/**
 * server.js — Servidor de teste local para o site de timbrados
 * =============================================================
 * 
 * Este servidor substitui o PHP para testes locais.
 * Ele serve arquivos estáticos e faz chamadas REAIS à API Brevo
 * para enviar e-mails (boas-vindas e código de acesso).
 * 
 * COMO USAR:
 *   1. node server.js
 *   2. Abra http://localhost:3000
 *   3. Faça cadastro e entre pelo código
 * 
 * ⚠️ Para produção na VPS, use PHP (Apache/Nginx + PHP-FPM).
 *    Este arquivo serve APENAS para testes locais.
 * 
 * 🔐 As chaves ficam em secrets_config.json (ignorado pelo Git) ou em
 *    variáveis de ambiente. Veja secrets_config.example.json.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { normalizarLista } = require('./db_colunas');

// Hospedagens (Render, Railway, Fly) escolhem a porta e passam por env.
// Local, sem env, continua sendo 3000.
const PORT = process.env.PORT || 3000;
const JSON_DB_PATH = path.join(__dirname, 'usuarios.json');

// ============================================================
// [CONFIG] BREVO API — Envio real de e-mail
// ============================================================
// A chave NAO fica no codigo. Ordem de leitura:
//   1) variavel de ambiente BREVO_API_KEY (producao)
//   2) secrets_config.json na raiz do projeto (local — esta no .gitignore)
// Veja secrets_config.example.json para o formato.
function loadSecretsConfig() {
    try {
        const p = path.join(__dirname, 'secrets_config.json');
        if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8')) || {};
    } catch (err) {
        console.error('⚠️  secrets_config.json inválido:', err.message);
    }
    return {};
}

const SECRETS = loadSecretsConfig();
const BREVO_API_KEY = process.env.BREVO_API_KEY || SECRETS.brevo?.api_key || '';
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

if (!BREVO_API_KEY) {
    console.warn('⚠️  Chave Brevo ausente: copie secrets_config.example.json para secrets_config.json. O envio de e-mail vai falhar.');
}

/**
 * Envia e-mail real via API Brevo
 */
async function enviarEmailBrevo(paraEmail, assunto, htmlBody, textoAlt = '') {
    const payload = JSON.stringify({
        sender: { name: 'AgenteJ.us', email: 'advogare@agentej.us' },
        to: [{ email: paraEmail, name: paraEmail }],
        subject: assunto,
        htmlContent: htmlBody,
        textContent: textoAlt || htmlBody.replace(/<[^>]+>/g, '').substring(0, 500)
    });

    try {
        // Usar fetch do Node 18+
        const response = await fetch(BREVO_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'api-key': BREVO_API_KEY
            },
            body: payload
        });

        const data = await response.json();
        
        if (response.ok) {
            console.log(`✅ E-mail REAL enviado para ${paraEmail} | ID: ${data.messageId || 'N/A'}`);
            return true;
        } else {
            console.error(`❌ Brevo API erro (${response.status}): ${data.message || 'Erro desconhecido'}`);
            return false;
        }
    } catch (err) {
        console.error(`❌ Erro ao conectar com Brevo: ${err.message}`);
        return false;
    }
}

// ============================================================
// [CONFIG] LOGIN SOCIAL — Google e Microsoft (OAuth 2.0 / OpenID)
// ============================================================
// As credenciais NAO ficam no codigo. Ordem de leitura:
//   1) variaveis de ambiente (producao)
//   2) oauth_config.json na raiz do projeto (local — esta no .gitignore)
// Veja oauth_config.example.json para o formato.
function loadOAuthConfig() {
    let file = {};
    try {
        const p = path.join(__dirname, 'oauth_config.json');
        if (fs.existsSync(p)) file = JSON.parse(fs.readFileSync(p, 'utf-8')) || {};
    } catch (err) {
        console.error('⚠️  oauth_config.json inválido:', err.message);
    }

    return {
        baseUrl: process.env.OAUTH_BASE_URL || file.base_url || `http://localhost:${PORT}`,
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID || file.google?.client_id || '',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || file.google?.client_secret || ''
        },
        microsoft: {
            clientId: process.env.MS_CLIENT_ID || file.microsoft?.client_id || '',
            clientSecret: process.env.MS_CLIENT_SECRET || file.microsoft?.client_secret || '',
            tenant: process.env.MS_TENANT || file.microsoft?.tenant || 'common'
        }
    };
}

const OAUTH = loadOAuthConfig();

const OAUTH_PROVIDERS = {
    google: {
        nome: 'Google',
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenUrl: 'https://oauth2.googleapis.com/token',
        scope: 'openid email profile',
        extraAuthParams: { access_type: 'online', prompt: 'select_account' },
        // Endpoint de checagem da conta: devolve e-mail + se ele é verificado
        async buscarConta(accessToken) {
            const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            if (!r.ok) throw new Error(`userinfo Google ${r.status}`);
            const d = await r.json();
            return {
                email: (d.email || '').toLowerCase(),
                emailVerificado: d.email_verified === true,
                nome: d.name || '',
                idExterno: d.sub || ''
            };
        }
    },
    microsoft: {
        nome: 'Microsoft',
        authUrl: '',   // preenchido abaixo (depende do tenant)
        tokenUrl: '',
        scope: 'openid email profile User.Read',
        extraAuthParams: { response_mode: 'query', prompt: 'select_account' },
        async buscarConta(accessToken) {
            const r = await fetch('https://graph.microsoft.com/v1.0/me', {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            if (!r.ok) throw new Error(`Graph /me ${r.status}`);
            const d = await r.json();
            const email = (d.mail || d.userPrincipalName || '').toLowerCase();
            return {
                email,
                // A conta so existe no diretorio Microsoft se o Graph a devolveu,
                // entao o e-mail do diretorio ja vale como verificado.
                emailVerificado: !!email,
                nome: d.displayName || '',
                idExterno: d.id || ''
            };
        }
    }
};

OAUTH_PROVIDERS.microsoft.authUrl =
    `https://login.microsoftonline.com/${OAUTH.microsoft.tenant}/oauth2/v2.0/authorize`;
OAUTH_PROVIDERS.microsoft.tokenUrl =
    `https://login.microsoftonline.com/${OAUTH.microsoft.tenant}/oauth2/v2.0/token`;

function oauthCredenciais(provider) {
    return provider === 'google' ? OAUTH.google : OAUTH.microsoft;
}

function oauthRedirectUri(provider) {
    return `${OAUTH.baseUrl.replace(/\/$/, '')}/auth/${provider}/callback`;
}

// Estados pendentes (anti-CSRF) e tickets de sessao — memoria, com validade curta
const oauthStates = new Map();   // state -> { provider, retorno, criadoEm }
const oauthTickets = new Map();  // ticket -> { user, criadoEm }
const OAUTH_STATE_TTL = 10 * 60 * 1000;
const OAUTH_TICKET_TTL = 2 * 60 * 1000;

function limparExpirados(mapa, ttl) {
    const agora = Date.now();
    for (const [k, v] of mapa) if (agora - v.criadoEm > ttl) mapa.delete(k);
}

// ------------------------------------------------------------
// Para onde devolver a pessoa depois do login social
// ------------------------------------------------------------
// O site publico fica no GitHub Pages (www.agentej.us) e o servidor no Render.
// Quem clica em "Entrar com Google" sai de www.agentej.us, passa pelo Render e
// pelo Google — e, sem isto, era largado em advogacert.onrender.com, um
// dominio que nao e o do site, justo na hora de pagar.
//
// O endereco de origem chega em ?retorno=. Ele NAO pode ser usado como veio:
// seria um open redirect, e daria para mandar a vitima (com o ticket de sessao
// na URL) para um site qualquer. Por isso so vale o que esta nesta lista.
const RETORNOS_PERMITIDOS = [
    'https://www.agentej.us',
    'https://agentej.us',
    'https://advogacert.onrender.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
];

function retornoSeguro(bruto) {
    if (!bruto) return '';
    const limpo = String(bruto).replace(/\/$/, '');
    return RETORNOS_PERMITIDOS.includes(limpo) ? limpo : '';
}

function redirecionarComErro(res, motivo, retorno = '') {
    const base = retornoSeguro(retorno);
    res.writeHead(302, {
        Location: `${base}/login.html?oauth_erro=${encodeURIComponent(motivo)}`
    });
    res.end();
}

/**
 * Localiza (ou cria) o usuario a partir da conta social ja checada no provedor.
 * Contas sociais nao tem senha local: o campo fica null e o login por senha
 * continua exigindo hash, entao ninguem entra nessas contas sem passar pelo provedor.
 */
function usuarioDaContaSocial(conta, provider) {
    const db = loadJsonDb();
    let user = db.usuarios.find(u => (u.email || '').toLowerCase() === conta.email);

    if (!user) {
        user = {
            id: db.usuarios.length + 1,
            email: conta.email,
            senha: null,
            provider,
            provider_id: conta.idExterno,
            nome: conta.nome,
            created_at: new Date().toISOString()
        };
        db.usuarios.push(user);
    } else {
        user.provider = provider;
        user.provider_id = conta.idExterno;
        if (conta.nome && !user.nome) user.nome = conta.nome;
    }

    saveJsonDb(db);
    return { id: user.id, email: user.email, nome: user.nome || '', provider };
}

// ============================================================
// [CONFIG] LOGIN POR CÓDIGO (OTP)
// ============================================================
// Fluxo em 4 passos:
//   1) usuario informa o destino -> geramos 6 digitos e guardamos so o HASH + validade (5 min)
//   2) o codigo sai pelo canal do destino
//   3) usuario digita o codigo   -> conferimos hash e prazo
//   4) o codigo e invalidado (uso unico) e a sessao e aberta
//
// Canais:
//   E-MAIL  -> sempre ligado. Vai pela API Brevo, a mesma ja usada nos outros e-mails,
//              entao nao tem custo novo. E o caminho recomendado hoje.
//   CELULAR -> so funciona se OTP_CANAL_SMS estiver configurado, porque SMS e pago.
//              Enquanto estiver em "off", quem digitar um celular recebe um aviso claro.
//
// Config (env tem prioridade; otp_config.json opcional na raiz):
//   OTP_CANAL_SMS = off | console | brevo
//     off     -> celular desativado (padrao). So e-mail.
//     console -> imprime o codigo no terminal. APENAS teste local.
//     brevo   -> SMS real pela API Brevo (exige saldo de SMS na conta).
//   OTP_REMETENTE_SMS = nome que aparece como remetente do SMS (max. 11 caracteres)
function loadOtpConfig() {
    let file = {};
    try {
        const p = path.join(__dirname, 'otp_config.json');
        if (fs.existsSync(p)) file = JSON.parse(fs.readFileSync(p, 'utf-8')) || {};
    } catch (err) {
        console.error('⚠️  otp_config.json inválido:', err.message);
    }

    return {
        canalSms: process.env.OTP_CANAL_SMS || file.canal_sms || 'off',
        remetenteSms: process.env.OTP_REMETENTE_SMS || file.remetente_sms || 'AdvogaCert'
    };
}

const OTP = loadOtpConfig();

const OTP_TTL = 5 * 60 * 1000;          // validade do codigo
const OTP_MAX_TENTATIVAS = 5;           // 6 digitos = 1 milhao de combinacoes; sem teto e forca bruta trivial
const OTP_INTERVALO_ENVIO = 60 * 1000;  // 1 envio por minuto no mesmo numero
const OTP_MAX_HORA_DESTINO = 5;
const OTP_MAX_HORA_IP = 10;
const UMA_HORA = 60 * 60 * 1000;

// destino -> { hash, salt, tentativas, expiraEm, usadoEm }  (equivale a tabela otp_codes)
const otpCodigos = new Map();
// chave ("destino:..." ou "ip:1.2.3.4") -> lista de timestamps de envio
const otpEnvios = new Map();

/**
 * Normaliza para E.164 antes de qualquer coisa: "85 99999-9999", "085999999999"
 * e "+5585999999999" precisam virar a MESMA string, senao viram usuarios duplicados.
 */
function normalizarTelefone(bruto) {
    let d = String(bruto || '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    d = d.replace(/^0+/, '');                                  // 0 de operadora / DDD com 0
    if (d.length === 10 || d.length === 11) d = '55' + d;      // numero nacional sem DDI
    if (!/^55\d{10,11}$/.test(d)) return null;
    return '+' + d;
}

/**
 * O campo do login aceita e-mail ou celular; aqui decidimos qual e e devolvemos
 * a forma canonica. Tudo depois disso (limite, hash, usuario) usa essa string.
 */
function normalizarDestinoOtp(bruto) {
    const texto = String(bruto || '').trim();

    if (texto.includes('@')) {
        const email = texto.toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
        return { tipo: 'email', valor: email };
    }

    const telefone = normalizarTelefone(texto);
    return telefone ? { tipo: 'telefone', valor: telefone } : null;
}

function mascararDestino(tipo, valor) {
    if (tipo === 'telefone') {
        return valor.replace(/^(\+\d{2})(\d{2})(\d+)(\d{2})$/, '$1 $2 ****$4');
    }
    const [nome, dominio] = valor.split('@');
    const visivel = nome.length <= 2 ? nome[0] : nome.slice(0, 2);
    return `${visivel}${'*'.repeat(Math.max(nome.length - visivel.length, 1))}@${dominio}`;
}

function hashCodigo(codigo, salt) {
    return crypto.createHash('sha256').update(salt + codigo).digest('hex');
}

function conferirHash(codigo, registro) {
    const calculado = Buffer.from(hashCodigo(codigo, registro.salt), 'hex');
    const guardado = Buffer.from(registro.hash, 'hex');
    return calculado.length === guardado.length && crypto.timingSafeEqual(calculado, guardado);
}

/** Envios da ultima hora para uma chave, ja descartando o que envelheceu. */
function enviosRecentes(chave) {
    const agora = Date.now();
    const lista = (otpEnvios.get(chave) || []).filter(t => agora - t < UMA_HORA);
    if (lista.length) otpEnvios.set(chave, lista); else otpEnvios.delete(chave);
    return lista;
}

/**
 * Rate limit obrigatorio: sem ele alguem dispara milhares de envios e queima o saldo.
 * Retorna null se pode enviar, ou { erro, esperar } se nao pode.
 */
function checarLimiteEnvio(destino, ip) {
    const doDestino = enviosRecentes('destino:' + destino);
    const doIp = enviosRecentes('ip:' + ip);
    const ultimo = doDestino[doDestino.length - 1];

    if (ultimo && Date.now() - ultimo < OTP_INTERVALO_ENVIO) {
        return {
            erro: 'Aguarde para pedir outro código.',
            esperar: Math.ceil((OTP_INTERVALO_ENVIO - (Date.now() - ultimo)) / 1000)
        };
    }
    if (doDestino.length >= OTP_MAX_HORA_DESTINO) {
        return { erro: 'Muitos códigos pedidos para este contato. Tente novamente em 1 hora.', esperar: 3600 };
    }
    if (doIp.length >= OTP_MAX_HORA_IP) {
        return { erro: 'Muitas tentativas a partir deste acesso. Tente novamente mais tarde.', esperar: 3600 };
    }
    return null;
}

function registrarEnvio(destino, ip) {
    otpEnvios.set('destino:' + destino, [...enviosRecentes('destino:' + destino), Date.now()]);
    otpEnvios.set('ip:' + ip, [...enviosRecentes('ip:' + ip), Date.now()]);
}

async function enviarSmsBrevo(telefone, texto) {
    try {
        const r = await fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'api-key': BREVO_API_KEY
            },
            body: JSON.stringify({
                type: 'transactional',
                sender: OTP.remetenteSms,
                recipient: telefone.replace('+', ''),
                content: texto
            })
        });
        const data = await r.json();
        if (r.ok) {
            console.log(`✅ SMS enviado para ${mascararDestino('telefone', telefone)} | ID: ${data.messageId || 'N/A'}`);
            return true;
        }
        console.error(`❌ Brevo SMS erro (${r.status}): ${data.message || 'desconhecido'}`);
        return false;
    } catch (err) {
        console.error(`❌ Erro ao enviar SMS: ${err.message}`);
        return false;
    }
}

/** Monta o e-mail do codigo a partir do template email-otp.html. */
function htmlCodigoOtp(email, codigo) {
    const templatePath = path.join(__dirname, 'email-otp.html');
    if (!fs.existsSync(templatePath)) {
        console.error('⚠️  email-otp.html não encontrado — enviando versão simples.');
        return `<p>Seu código de acesso AdvogaCert é <strong>${codigo}</strong>. Vale por 5 minutos.</p>`;
    }

    return fs.readFileSync(templatePath, 'utf-8')
        .replaceAll('{{CODIGO}}', codigo)
        .replaceAll('{{EMAIL}}', email);
}

async function enviarCodigoOtp(tipo, valor, codigo) {
    if (tipo === 'email') {
        return enviarEmailBrevo(
            valor,
            `${codigo} é o seu código de acesso - AdvogaCert`,
            htmlCodigoOtp(valor, codigo),
            `Seu código de acesso AdvogaCert é ${codigo}. Vale por 5 minutos e só pode ser usado uma vez. Não compartilhe com ninguém.`
        );
    }

    const texto = `AdvogaCert: seu codigo de acesso e ${codigo}. Vale por 5 minutos. Nao compartilhe com ninguem.`;

    if (OTP.canalSms === 'brevo') return enviarSmsBrevo(valor, texto);

    console.log('========================================');
    console.log('📱 CÓDIGO OTP (canal SMS "console" — só teste local)');
    console.log(`   ${valor} → ${codigo}`);
    console.log('========================================');
    return true;
}

/**
 * Localiza (ou cria) o usuario pelo contato ja conferido.
 * Conta aberta por codigo nao tem senha local: o campo fica null, entao o login
 * por senha continua exigindo hash e ninguem entra nela sem passar pelo codigo.
 * Se o e-mail ja existir (cadastro normal ou Google), e a MESMA conta — sem duplicar.
 */
function usuarioDoDestinoOtp(tipo, valor) {
    const db = loadJsonDb();
    let user = tipo === 'email'
        ? db.usuarios.find(u => (u.email || '').toLowerCase() === valor)
        : db.usuarios.find(u => u.telefone === valor);

    if (!user) {
        user = {
            id: db.usuarios.length + 1,
            email: tipo === 'email' ? valor : null,
            telefone: tipo === 'telefone' ? valor : null,
            senha: null,
            provider: 'codigo',
            nome: '',
            created_at: new Date().toISOString()
        };
        db.usuarios.push(user);
    }

    saveJsonDb(db);
    return {
        id: user.id,
        email: user.email || '',
        telefone: user.telefone || '',
        nome: user.nome || '',
        provider: user.provider || 'codigo'
    };
}

// ============================================================
// [CONFIG] PAGAMENTO (Mercado Pago) e PAINEL DE CONTROLE
// ============================================================
// Env tem prioridade; pagamento_config.json é o arquivo local (fora do git).
//   MP_LINK         — link de pagamento/assinatura gerado no painel do MP
//   MP_ACCESS_TOKEN — chave da API; sem ela o webhook não confere o pagamento
//   MP_EMAIL_AVISO  — para onde mandar o aviso de venda nova
//   ADMIN_SENHA     — senha do painel /admin.html
function loadPagamentoConfig() {
    let file = {};
    try {
        const p = path.join(__dirname, 'pagamento_config.json');
        if (fs.existsSync(p)) file = JSON.parse(fs.readFileSync(p, 'utf-8')) || {};
    } catch (err) {
        console.error('⚠️  pagamento_config.json inválido:', err.message);
    }

    return {
        mp: {
            link: process.env.MP_LINK || file.mercadopago?.link || '',
            accessToken: process.env.MP_ACCESS_TOKEN || file.mercadopago?.access_token || '',
            emailAviso: process.env.MP_EMAIL_AVISO || file.mercadopago?.email_aviso || ''
        },
        admin: {
            // Sem padrao: o repositorio e publico, entao um valor fixo aqui
            // seria senha conhecida por qualquer um. Sem configurar, ninguem entra.
            senha: process.env.ADMIN_SENHA || file.admin?.senha || '',
            // Segredo do app autenticador (base32). Vazio = 2FA desligado.
            totpSecret: (process.env.ADMIN_TOTP_SECRET || file.admin?.totp_secret || '')
                .replace(/\s+/g, '').toUpperCase()
        }
    };
}

const PAGAMENTO = loadPagamentoConfig();
const MP = PAGAMENTO.mp;
const ADMIN = PAGAMENTO.admin;

if (!ADMIN.senha) {
    console.warn('⚠️  Painel admin sem senha configurada (ADMIN_SENHA ou pagamento_config.json): o acesso está bloqueado.');
}

// sessões do painel — memória, expiram em 8 horas
const adminSessoes = new Map();
const ADMIN_SESSAO_TTL = 8 * 60 * 60 * 1000;

// Estados possíveis de um chamado, na ordem em que o trabalho anda.
const STATUS_CHAMADO = ['aberto', 'em_atendimento', 'aguardando_cliente', 'fechado'];

// Acima disto, chamado sem responsável fica destacado na fila.
const SEM_DONO_HORAS = 8;

/**
 * Sessão do painel.
 *
 * O token vem por cookie httpOnly, não por sessionStorage: sessionStorage é
 * legível por qualquer JavaScript da página, então um XSS no painel levaria
 * a sessão junto. Cookie httpOnly o script não alcança.
 *
 * Isto só é possível porque o admin.html é servido pelo próprio Render (está
 * no exclude do GitHub Pages): painel e API na mesma origem, sem cookie
 * de terceiros e sem precisar afrouxar o SameSite.
 *
 * O cabeçalho Authorization continua aceito para não quebrar sessão aberta
 * antes desta mudança; some sozinho quando as sessões antigas expirarem.
 */
function lerCookie(req, nome) {
    const bruto = req.headers.cookie || '';
    for (const parte of bruto.split(';')) {
        const [k, ...v] = parte.trim().split('=');
        if (k === nome) return decodeURIComponent(v.join('='));
    }
    return '';
}

function sessaoAdmin(req) {
    limparExpirados(adminSessoes, ADMIN_SESSAO_TTL);
    const doCookie = lerCookie(req, 'admin_sessao');
    if (doCookie && adminSessoes.has(doCookie)) return doCookie;

    const doHeader = (req.headers.authorization || '').replace('Bearer ', '');
    return doHeader && adminSessoes.has(doHeader) ? doHeader : null;
}

// tentativas de login no painel por IP — trava forca bruta na senha e no codigo
const adminTentativas = new Map();
const ADMIN_MAX_TENTATIVAS = 8;
const ADMIN_JANELA_TENTATIVAS = 15 * 60 * 1000;

// ============================================================
// 2FA do painel — TOTP (RFC 6238), compatível com Google Authenticator,
// Authy, 1Password e Microsoft Authenticator.
// ============================================================
const BASE32_ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(texto) {
    let bits = '';
    for (const c of texto.replace(/=+$/, '')) {
        const i = BASE32_ALFABETO.indexOf(c);
        if (i === -1) return null;
        bits += i.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
    return Buffer.from(bytes);
}

/** Codigo de 6 digitos para um instante — o mesmo calculo que o app faz. */
function totpCodigo(secretBase32, contador) {
    const chave = base32Decode(secretBase32);
    if (!chave || !chave.length) return null;

    const buf = Buffer.alloc(8);
    buf.writeUInt32BE(Math.floor(contador / 2 ** 32), 0);
    buf.writeUInt32BE(contador >>> 0, 4);

    const hmac = crypto.createHmac('sha1', chave).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const valor = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) |
                  (hmac[offset + 2] << 8) | hmac[offset + 3];
    return String(valor % 1000000).padStart(6, '0');
}

/**
 * Aceita o codigo da janela atual e uma vizinha de cada lado: o relogio do
 * celular quase nunca bate exatamente com o do servidor.
 */
function totpValido(secretBase32, digitado) {
    const codigo = String(digitado || '').replace(/\D/g, '');
    if (codigo.length !== 6) return false;

    const agora = Math.floor(Date.now() / 1000 / 30);
    for (let j = -1; j <= 1; j++) {
        const esperado = totpCodigo(secretBase32, agora + j);
        if (esperado && crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(codigo))) return true;
    }
    return false;
}

// Tipos MIME
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml',
};

// ============================================================
// BANCO DE DADOS (Supabase em produção, arquivo local no desenvolvimento)
// ============================================================
// Quatro coleções, no lugar da lista solta de usuários que existia antes:
//   usuarios    — quem é a pessoa (e-mail, WhatsApp, senha)
//   assinaturas — quem pagou o quê, e se está valendo agora
//   chamados    — cada atendimento aberto, inclusive o gratuito de teste
//   logins      — histórico de entradas, para saber quem anda usando
//
// POR QUE SUPABASE: no plano free do Render o disco é efêmero. A cada deploy —
// e a cada vez que o serviço acorda depois de dormir — o usuarios.json voltava
// ao que estava no commit, apagando cadastros e assinaturas reais. O Supabase
// é um Postgres de verdade, fora do container, então os dados sobrevivem.
//
// COMO FUNCIONA: as mesmas quatro coleções viram quatro tabelas. O servidor
// carrega tudo para a memória no boot e mantém `loadJsonDb`/`saveJsonDb`
// SÍNCRONOS — foi de propósito: as ~24 chamadas espalhadas pelas rotas não
// precisaram mudar, e nenhuma lógica que já funcionava foi mexida. A gravação
// no Postgres acontece logo depois, em segundo plano e uma de cada vez.
//
// Sem SUPABASE_URL configurado, tudo continua no usuarios.json como antes,
// que é o que se quer rodando na sua máquina.
const COLECOES = [
    'usuarios', 'assinaturas', 'chamados', 'logins', 'agendamentos',
    'verificacoes_oab', 'auditoria',
    // a agenda deixou de ser constante no código e virou dado: horário de
    // trabalho por dia, ajustes gerais e datas bloqueadas
    'agenda_config', 'agenda_ajustes', 'agenda_bloqueios'
];

const SUPABASE_URL = (process.env.SUPABASE_URL || SECRETS.supabase?.url || '').replace(/\/$/, '');
// service_role: ignora as políticas de RLS. Só pode viver no servidor —
// nunca no HTML, ou qualquer visitante lê e escreve a base inteira.
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || SECRETS.supabase?.service_key || '';
const SUPABASE_ATIVO = Boolean(SUPABASE_URL && SUPABASE_KEY);

function supabaseHeaders(extra = {}) {
    return {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        ...extra
    };
}

/**
 * Apaga linhas no banco.
 *
 * saveJsonDb não serve para isto: ele reenvia o que está na memória com
 * "atualizar se já existir" e nunca apaga. Tirar da memória e salvar deixaria
 * a linha viva no Postgres, e ela voltaria no próximo restart — o servidor
 * recarrega tudo do banco ao subir.
 *
 * Por isso o apagar fala direto com o Supabase, e só depois mexe na memória:
 * se o banco recusar, a memória continua igual ao que está gravado.
 */
async function apagarNoSupabase(tabela, ids) {
    if (!SUPABASE_ATIVO || !ids.length) return;
    const lista = ids.map(Number).filter(Number.isFinite).join(',');

    // O apagar entra NA MESMA FILA das gravações, e não em paralelo.
    //
    // As gravações são enfileiradas e saem uma de cada vez. Um apagar direto
    // furava essa fila: se ainda houvesse um upsert pendente com aquela linha
    // na memória — o que fecha o chamado, por exemplo —, ele chegava depois do
    // apagar e recriava a linha. O apagar respondia "sucesso" e o registro
    // continuava lá.
    filaGravacao = filaGravacao.then(async () => {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?id=in.(${lista})`, {
            method: 'DELETE',
            headers: supabaseHeaders({ Prefer: 'return=minimal' })
        });
        if (!r.ok) throw new Error(`DELETE ${tabela}: ${r.status} ${await r.text()}`);
    });

    return filaGravacao;
}

/** Espelho em memória do banco. É ele que as rotas leem. */
let memDb = null;

function dbVazio() {
    const vazio = {};
    for (const c of COLECOES) vazio[c] = [];
    return vazio;
}

function lerArquivoLocal() {
    let dados = {};
    try {
        if (fs.existsSync(JSON_DB_PATH)) {
            dados = JSON.parse(fs.readFileSync(JSON_DB_PATH, 'utf-8')) || {};
        }
    } catch (err) {
        console.error('⚠️  usuarios.json ilegível:', err.message);
        dados = {};
    }
    // garante que toda coleção exista, mesmo em bancos criados antes
    for (const c of COLECOES) if (!Array.isArray(dados[c])) dados[c] = [];
    return dados;
}

function gravarArquivoLocal(data) {
    // grava num temporário e renomeia: se o processo morrer no meio,
    // o arquivo antigo continua íntegro em vez de virar um JSON pela metade
    const tmp = JSON_DB_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, JSON_DB_PATH);
}

/**
 * Lê as quatro tabelas do Supabase para a memória. Roda uma vez, no boot,
 * ANTES de o servidor aceitar requisição — se subisse antes, os primeiros
 * acessos veriam um banco vazio e criariam usuários duplicados.
 */
async function carregarDoSupabase() {
    const dados = dbVazio();

    for (const tabela of COLECOES) {
        const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?select=*&order=id.asc`, {
            headers: supabaseHeaders()
        });
        if (!r.ok) {
            throw new Error(`${tabela}: ${r.status} ${(await r.text()).slice(0, 200)}`);
        }
        dados[tabela] = await r.json();
    }
    return dados;
}

// Uma gravação de cada vez. Sem esta fila, dois saves quase simultâneos
// disparariam upserts fora de ordem e o registro mais novo poderia perder
// para o mais velho.
let filaGravacao = Promise.resolve();
let gravacoesComErro = 0;

async function enviarAoSupabase(data) {
    for (const tabela of COLECOES) {
        const linhas = data[tabela];
        if (!linhas || !linhas.length) continue;

        // merge-duplicates = INSERT ... ON CONFLICT (id) DO UPDATE.
        // Nenhuma rota apaga registro (cancelar assinatura só muda o status),
        // então reenviar tudo basta para deixar a tabela igual à memória.
        //
        // normalizarLista é obrigatório: os registros têm chaves diferentes
        // entre si (quem entrou pelo Google não tem `senha`, quem nunca voltou
        // não tem `ultimo_login`), e o PostgREST recusa o lote inteiro nesse
        // caso — veja db_colunas.js.
        const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}`, {
            method: 'POST',
            headers: supabaseHeaders({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
            body: JSON.stringify(normalizarLista(tabela, linhas))
        });

        if (!r.ok) {
            throw new Error(`${tabela}: ${r.status} ${(await r.text()).slice(0, 300)}`);
        }
    }
}

/**
 * Devolve o banco. Síncrono de propósito — veja o comentário do bloco.
 */
function loadJsonDb() {
    if (!memDb) memDb = SUPABASE_ATIVO ? dbVazio() : lerArquivoLocal();
    return memDb;
}

/**
 * Guarda o banco. A memória é atualizada na hora (a resposta ao usuário já
 * sai correta); o Postgres recebe logo em seguida, em segundo plano.
 */
function saveJsonDb(data) {
    memDb = data;

    if (!SUPABASE_ATIVO) {
        gravarArquivoLocal(data);
        return;
    }

    // cópia rasa das listas: o handler pode continuar mexendo no objeto
    // depois deste retorno, e a fila gravaria um estado meio editado
    const snapshot = {};
    for (const c of COLECOES) snapshot[c] = (data[c] || []).map(x => ({ ...x }));

    filaGravacao = filaGravacao
        .then(() => enviarAoSupabase(snapshot))
        .then(() => { gravacoesComErro = 0; })
        .catch(err => {
            gravacoesComErro++;
            console.error(`❌ Falha ao gravar no Supabase (${gravacoesComErro}x):`, err.message);
            // rede de segurança: o dado não some enquanto o Postgres não volta
            try {
                gravarArquivoLocal(data);
                console.error('   ↳ cópia de emergência salva em usuarios.json');
            } catch (e2) {
                console.error('   ↳ e o arquivo local também falhou:', e2.message);
            }
        });
}

/**
 * Normaliza a inscrição da OAB para uma forma única: NUMERO/UF.
 * É ELA, e não o e-mail, que responde "esta pessoa já usou o chamado grátis?".
 * Sem isso, bastaria criar outro e-mail para ganhar mais um atendimento free.
 */
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA',
             'PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

function normalizarOab(bruto) {
    const texto = String(bruto || '').toUpperCase().replace(/\s+/g, '');
    const m = texto.match(/^(?:OAB)?[\/-]?([A-Z]{2})?[\/-]?(\d{3,6})[\/-]?([A-Z]{2})?$/);
    if (!m) return null;

    const numero = m[2];
    const uf = m[3] || m[1];            // aceita "GO123456" e "123456/GO"
    if (!uf || !UFS.includes(uf)) return null;

    return `${numero}/${uf}`;
}

/** id sequencial por coleção (o maior existente + 1) */
function proximoId(lista) {
    return lista.reduce((maior, item) => Math.max(maior, item.id || 0), 0) + 1;
}

/** Anota a entrada e atualiza o "visto por último" do usuário. */
function registrarLogin(db, usuarioId, metodo, req) {
    db.logins.push({
        id: proximoId(db.logins),
        usuario_id: usuarioId,
        metodo,                                   // senha | codigo | google
        ip: req.socket.remoteAddress || null,
        criado_em: new Date().toISOString()
    });
    const u = db.usuarios.find(x => x.id === usuarioId);
    if (u) u.ultimo_login = new Date().toISOString();
}

/** Assinatura valendo agora: paga e ainda dentro do prazo. */
function assinaturaAtiva(db, usuarioId) {
    const agora = new Date();
    return db.assinaturas.find(a =>
        a.usuario_id === usuarioId &&
        a.status === 'ativa' &&
        (!a.valida_ate || new Date(a.valida_ate) > agora)
    ) || null;
}

/**
 * A última assinatura da pessoa, valendo ou não.
 * É ela que separa "nunca assinou" de "assinou e venceu": sem isso o painel
 * mostraria os dois como "sem plano" e você não saberia de quem cobrar.
 */
function assinaturaMaisRecente(db, usuarioId) {
    return db.assinaturas
        .filter(a => a.usuario_id === usuarioId)
        .sort((x, y) => new Date(y.criado_em || 0) - new Date(x.criado_em || 0))[0] || null;
}

/**
 * Situação de cobrança da inscrição, em uma palavra só:
 *
 *   ativa         — pagou e está dentro do prazo
 *   inadimplente  — o prazo venceu e ninguém cancelou: é aqui que se cobra
 *   cancelada     — pediu para sair; não se cobra
 *   sem plano     — nunca assinou
 *
 * "Inadimplente" nasce do vencimento, não de um campo: o gateway ainda não
 * está ligado, então não há aviso de falha de pagamento chegando de fora.
 */
function situacaoDeCobranca(db, usuarioId) {
    if (assinaturaAtiva(db, usuarioId)) return { estado: 'ativa', dias_atraso: 0 };

    const ultima = assinaturaMaisRecente(db, usuarioId);
    if (!ultima) return { estado: 'sem plano', dias_atraso: 0 };
    if (ultima.status === 'cancelada') return { estado: 'cancelada', dias_atraso: 0 };

    const venceu = ultima.valida_ate ? new Date(ultima.valida_ate) : null;
    const dias = venceu
        ? Math.max(0, Math.floor((Date.now() - venceu.getTime()) / 86400000))
        : 0;
    return { estado: 'inadimplente', dias_atraso: dias };
}

/**
 * O chamado grátis é contado pela OAB, não pela conta.
 * Se a mesma inscrição já usou o dela em qualquer cadastro, acabou.
 */
function freeUsadoPelaOab(db, oab) {
    if (!oab) return false;
    const idsDaOab = db.usuarios.filter(u => u.oab === oab).map(u => u.id);
    // Conta agendamento também, e não só chamado: desde que a triagem passou
    // a decidir quando o chamado nasce, existe um intervalo em que o
    // atendimento já foi marcado mas o chamado ainda não existe. Contar só
    // chamado deixaria a pessoa marcar duas vezes nesse intervalo.
    const porAgendamento = (db.agendamentos || []).some(a =>
        a.status !== 'cancelado' &&
        (a.oab === oab || idsDaOab.includes(a.usuario_id)));
    const porChamado = (db.chamados || []).some(c =>
        c.tipo === 'free' && (c.oab === oab || idsDaOab.includes(c.usuario_id)));
    return porAgendamento || porChamado;
}

// ============================================================
// VERIFICAÇÃO DA INSCRIÇÃO NA OAB
//
// O sistema não tem como conferir a inscrição sozinho: a OAB não publica
// API, e o CNA tem CAPTCHA justamente para impedir consulta automatizada.
// Então a conferência é humana — e o que o código faz é preparar a decisão,
// registrá-la e reaproveitá-la.
//
// Reaproveitar é o ponto: a decisão fica guardada por inscrição. Quem já foi
// conferido uma vez não volta para a fila.
// ============================================================
/**
 * Normaliza a inscrição para a forma canônica: só dígitos, sem zeros à
 * esquerda, mais a UF em maiúsculas. Reaproveita a lista UFS e convive com
 * normalizarOab, que resolve o caso de campo único ("123456/GO"); aqui o
 * número e a seccional chegam em campos separados, da tela de identificação.
 *
 * Sem isso, "012.345/go", "12345/GO" e "12345 GO" viram três inscrições
 * diferentes no banco — e o controle de "um grátis por inscrição" cai por
 * terra, porque bastaria digitar com um ponto a mais.
 */
function normalizarInscricao(inscricaoBruta, ufBruta) {
    const digitos = String(inscricaoBruta || '').replace(/\D/g, '').replace(/^0+/, '');
    const uf = String(ufBruta || '').trim().toUpperCase();

    if (!digitos) return { erro: 'Informe o número da inscrição.' };
    if (digitos.length > 6) return { erro: 'Inscrição com mais de 6 dígitos.' };
    if (!UFS.includes(uf)) return { erro: 'Seccional inválida. Use a sigla do estado, como GO.' };

    return { inscricao: digitos, uf, rotulo: `${digitos}/${uf}` };
}

/** A verificação já registrada para esta inscrição, se houver. */
function verificacaoDe(db, inscricao, uf) {
    return (db.verificacoes_oab || [])
        .find(v => v.inscricao === inscricao && v.uf === uf) || null;
}

/**
 * Sinais de que algo não bate. Não bloqueiam nada sozinhos — quem decide é
 * você, olhando o CNA. Servem para dizer onde olhar com mais atenção.
 */
function sinaisDeFraude(db, alvo) {
    const sinais = [];
    const verificacoes = db.verificacoes_oab || [];
    const norm = s => String(s || '').trim().toLowerCase();
    const soDigitos = s => String(s || '').replace(/\D/g, '');

    // Mesma inscrição pedida antes com outro nome
    const mesmaInscricao = verificacoes.filter(v =>
        v.inscricao === alvo.inscricao && v.uf === alvo.uf && v.id !== alvo.id);
    if (mesmaInscricao.some(v => norm(v.nome_declarado) !== norm(alvo.nome_declarado))) {
        sinais.push({ tipo: 'nome_divergente', texto: 'Inscrição já pedida com outro nome' });
    }

    // Mesmo contato em inscrições diferentes
    if (soDigitos(alvo.contato).length >= 10) {
        const outras = verificacoes.filter(v =>
            soDigitos(v.contato) === soDigitos(alvo.contato) &&
            (v.inscricao !== alvo.inscricao || v.uf !== alvo.uf));
        if (outras.length) {
            sinais.push({
                tipo: 'contato_repetido',
                texto: `Mesmo WhatsApp em ${outras.length + 1} inscrições`
            });
        }
    }

    // Mesmo e-mail em inscrições diferentes
    if (norm(alvo.email)) {
        const outras = verificacoes.filter(v =>
            norm(v.email) === norm(alvo.email) &&
            (v.inscricao !== alvo.inscricao || v.uf !== alvo.uf));
        if (outras.length) {
            sinais.push({
                tipo: 'email_repetido',
                texto: `Mesmo e-mail em ${outras.length + 1} inscrições`
            });
        }
    }

    // Mais de 2 tentativas do mesmo IP em 24h
    if (alvo.ip) {
        const desde = Date.now() - 24 * 3600 * 1000;
        const doIp = verificacoes.filter(v =>
            v.ip === alvo.ip && new Date(v.criado_em).getTime() > desde);
        if (doIp.length > 2) {
            sinais.push({
                tipo: 'ip_repetido',
                texto: `${doIp.length} pedidos do mesmo IP em 24h`
            });
        }
    }

    return sinais;
}

/**
 * Registra a decisão no histórico.
 * A tabela de verificações guarda o estado atual — uma linha por inscrição,
 * sobrescrita a cada nova decisão. Esta guarda o que aconteceu, e nada aqui
 * é sobrescrito.
 */
function auditar(db, { ator, acao, alvo, detalhe, ip }) {
    db.auditoria = db.auditoria || [];
    db.auditoria.push({
        id: proximoId(db.auditoria),
        ator: ator || 'painel',
        acao,
        alvo: String(alvo || '').slice(0, 200),
        detalhe: String(detalhe || '').slice(0, 500),
        ip: ip || null,
        criado_em: new Date().toISOString()
    });
}

/** O IP de quem pediu, respeitando o proxy do Render. */
function ipDoPedido(req) {
    const encaminhado = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return encaminhado || req.socket.remoteAddress || null;
}

// ============================================================
// AGENDA DO SUPORTE
//
// O premium não agenda: entra na fila e é atendido a qualquer momento. O
// gratuito marca hora, e por isso precisa de uma lista de horários livres.
//
// A agenda MORA NO BANCO, não aqui. Antes era um objeto constante neste
// arquivo, e mudar o horário de trabalho exigia publicar o servidor de novo.
// Agora vem de agenda_config (faixa por dia da semana), agenda_ajustes
// (duração, folga, antecedência) e agenda_bloqueios (feriado, viagem).
//
// E é a MESMA fonte para os dois lados: a tela pública monta a lista de
// horários com estas funções, e o painel desenha a grade da semana com
// elas. Não existe caminho pelo qual o cliente marque fora do que está
// configurado, porque não há segunda regra escrita em outro lugar.
//
// Os valores abaixo são só a rede de segurança de quando as tabelas ainda
// estão vazias — no primeiro boot depois da migração, por exemplo.
// ============================================================
const AGENDA_PADRAO = {
    // O movimento é à noite: o advogado procura suporte depois do expediente.
    horaInicio: 18,         // primeiro bloco começa às 18h
    horaFim: 24,            // último começa às 23h e termina à meia-noite
    capacidade: 1,          // um atendimento por bloco
    duracaoMin: 60,         // cada atendimento reserva 1 hora
    folgaMin: 0,            // respiro entre um atendimento e o seguinte
    antecedenciaMin: 1440,  // o cliente só marca de amanhã em diante
    janelaDias: 7           // até 7 dias à frente
};

// O Render roda em UTC; o atendimento é no horário de Fortaleza. O Brasil não
// tem mais horário de verão, então o deslocamento é fixo e não precisa de
// biblioteca de fuso.
const FUSO_BR = -3;
const FUSO_NOME = 'America/Fortaleza';

/** 'YYYY-MM-DD' + hora local (aceita fração) → instante real (Date em UTC). */
function instanteBR(dia, hora) {
    const [a, m, d] = dia.split('-').map(Number);
    return new Date(Date.UTC(a, m - 1, d, 0, 0, 0) + Math.round((hora - FUSO_BR) * 3600000));
}

/** O dia 'YYYY-MM-DD' em que aquele instante cai — no fuso daqui, não no do servidor. */
function diaBR(quando) {
    return new Date(new Date(quando).getTime() + FUSO_BR * 3600000).toISOString().slice(0, 10);
}

/** A hora local, em número com fração: 19h30 vira 19.5. */
function horaBR(quando) {
    const local = new Date(new Date(quando).getTime() + FUSO_BR * 3600000);
    return local.getUTCHours() + local.getUTCMinutes() / 60;
}

/** Manhã, tarde ou noite — é assim que o cliente declara a preferência. */
function turnoDaHora(hora) {
    if (hora < 12) return 'manha';
    if (hora < 18) return 'tarde';
    return 'noite';
}

/**
 * A configuração da agenda, já consolidada e com os buracos preenchidos.
 * Uma leitura só, para as funções abaixo não irem ao banco em cada laço.
 */
function agendaConfig(db) {
    const ajustes = (db.agenda_ajustes || [])[0] || {};
    const porDia = {};

    for (let d = 0; d <= 6; d++) {
        const linha = (db.agenda_config || []).find(c => Number(c.dia_semana) === d);
        porDia[d] = linha
            ? {
                dia_semana: d,
                hora_inicio: Number(linha.hora_inicio),
                hora_fim: Number(linha.hora_fim),
                capacidade: Math.max(1, Number(linha.capacidade) || 1),
                ativo: linha.ativo !== false
            }
            : {
                dia_semana: d,
                hora_inicio: AGENDA_PADRAO.horaInicio,
                hora_fim: AGENDA_PADRAO.horaFim,
                capacidade: AGENDA_PADRAO.capacidade,
                // Sem linha no banco o dia fica ATIVO, e não desligado: uma
                // tabela vazia deixaria o site sem nenhum horário para
                // oferecer, o que parece defeito e não configuração.
                ativo: true
            };
    }

    const num = (v, padrao) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : padrao);
    return {
        dias: porDia,
        duracaoMin: num(ajustes.duracao_min, AGENDA_PADRAO.duracaoMin),
        folgaMin: Number.isFinite(Number(ajustes.folga_min))
            ? Math.max(0, Number(ajustes.folga_min)) : AGENDA_PADRAO.folgaMin,
        antecedenciaMin: Number.isFinite(Number(ajustes.antecedencia_min))
            ? Math.max(0, Number(ajustes.antecedencia_min)) : AGENDA_PADRAO.antecedenciaMin,
        janelaDias: num(ajustes.janela_dias, AGENDA_PADRAO.janelaDias)
    };
}

/** Os status que ocupam lugar na agenda. Cancelado e faltou liberam a vaga. */
const STATUS_OCUPA = ['marcado', 'confirmado', 'em_atendimento', 'atendido'];

function agendamentosVivos(db) {
    return (db.agendamentos || []).filter(a => STATUS_OCUPA.includes(a.status));
}

/** O bloqueio que cobre esta faixa, se houver. */
function bloqueioDaFaixa(db, inicio, fim) {
    const de = new Date(inicio).getTime();
    const ate = new Date(fim).getTime();
    return (db.agenda_bloqueios || []).find(b => {
        const bi = new Date(b.inicio).getTime();
        const bf = new Date(b.fim).getTime();
        return bi < ate && bf > de;      // sobreposição de faixas
    }) || null;
}

/**
 * Todos os blocos de um dia, livres ou não.
 *
 * É a função-base: a lista pública, a grade da semana do painel e a
 * conferência na hora de gravar saem todas daqui. Se o desenho da agenda
 * mudar, muda num lugar só.
 */
function slotsDoDia(db, dia, opcoes = {}) {
    const cfg = opcoes.cfg || agendaConfig(db);
    const ignorarId = opcoes.ignorarId;
    const diaSemana = new Date(dia + 'T12:00:00Z').getUTCDay();
    const regra = cfg.dias[diaSemana];
    if (!regra || !regra.ativo || regra.hora_fim <= regra.hora_inicio) return [];

    const vivos = agendamentosVivos(db).filter(a => a.id !== ignorarId);
    const duracaoH = cfg.duracaoMin / 60;
    const passoH = (cfg.duracaoMin + cfg.folgaMin) / 60;
    const agora = Date.now();
    const cedoDemais = agora + cfg.antecedenciaMin * 60000;

    const slots = [];
    for (let h = regra.hora_inicio; h + duracaoH <= regra.hora_fim + 1e-9; h += passoH) {
        const inicio = instanteBR(dia, h);
        const fim = new Date(inicio.getTime() + cfg.duracaoMin * 60000);
        const bloqueio = bloqueioDaFaixa(db, inicio, fim);

        // Ocupação é por bloco, e o bloco é identificado pelo instante de
        // início. Agendamento que ficou fora da grade (remarcado à mão, ou
        // sobra de uma configuração antiga) é contado pelo início real —
        // por isso a comparação é de sobreposição, e não de igualdade.
        const dentro = vivos.filter(a => {
            const ai = new Date(a.inicio).getTime();
            const af = new Date(a.fim || ai + cfg.duracaoMin * 60000).getTime();
            return ai < fim.getTime() && af > inicio.getTime();
        });

        slots.push({
            inicio: inicio.toISOString(),
            fim: fim.toISOString(),
            rotulo: String(Math.floor(h)).padStart(2, '0') + ':' +
                    String(Math.round((h % 1) * 60)).padStart(2, '0'),
            turno: turnoDaHora(h),
            capacidade: regra.capacidade,
            ocupados: dentro.length,
            agendamentos: dentro.map(a => a.id),
            bloqueado: !!bloqueio,
            motivo_bloqueio: bloqueio ? (bloqueio.motivo || 'Bloqueado') : null,
            bloqueio_id: bloqueio ? bloqueio.id : null,
            passou: inicio.getTime() <= agora,
            // "cedo demais" não é o mesmo que ocupado: o painel PODE marcar
            // aqui (é decisão sua), o cliente não.
            cedo_demais: inicio.getTime() <= cedoDemais
        });
    }
    return slots;
}

/** Os dias que a pessoa pode escolher, em 'YYYY-MM-DD'. */
function diasDaAgenda(db) {
    const cfg = agendaConfig(db || loadJsonDb());
    const lista = [];
    const hojeBR = diaBR(new Date());
    for (let i = 0; i <= cfg.janelaDias; i++) {
        const d = new Date(hojeBR + 'T12:00:00Z');
        d.setUTCDate(d.getUTCDate() + i);
        const dia = d.toISOString().slice(0, 10);
        if (cfg.dias[d.getUTCDay()].ativo) lista.push(dia);
    }
    return lista;
}

/**
 * Horários livres de um dia, do ponto de vista do CLIENTE.
 * Livre = dentro do expediente, não bloqueado, com vaga, e respeitando a
 * antecedência mínima. É consultado ao montar a tela E de novo ao gravar:
 * entre ver e confirmar, alguém pode ter pego o horário.
 */
function horariosLivres(db, dia, opcoes = {}) {
    return slotsDoDia(db, dia, opcoes)
        .filter(s => !s.bloqueado && s.ocupados < s.capacidade && !s.cedo_demais)
        .map(s => ({ inicio: s.inicio, rotulo: s.rotulo, turno: s.turno }));
}

/**
 * Horários livres do ponto de vista do PAINEL: vale tudo que ainda não
 * passou e tem vaga, inclusive daqui a uma hora. A antecedência mínima é
 * regra para o cliente não marcar em cima da hora — não para me impedir de
 * encaixar alguém.
 */
function horariosLivresPainel(db, dia, opcoes = {}) {
    return slotsDoDia(db, dia, opcoes)
        .filter(s => !s.bloqueado && s.ocupados < s.capacidade && !s.passou);
}

/**
 * O horário pedido é válido e continua livre?
 * `opcoes.painel` afrouxa a antecedência; `opcoes.ignorarId` tira o próprio
 * agendamento da conta — sem isso, remarcar para o mesmo bloco seria
 * recusado por conflito com ele mesmo.
 */
function horarioValido(db, inicioISO, opcoes = {}) {
    if (!inicioISO) return { ok: false, erro: 'Escolha um horário.' };

    const quando = new Date(inicioISO);
    if (isNaN(quando)) return { ok: false, erro: 'Horário inválido.' };

    const dia = diaBR(quando);
    const cfg = agendaConfig(db);
    const slots = slotsDoDia(db, dia, { cfg, ignorarId: opcoes.ignorarId });
    const slot = slots.find(s => s.inicio === quando.toISOString());

    if (!slot) return { ok: false, erro: 'Este horário está fora da sua agenda de trabalho.' };
    if (slot.bloqueado) return { ok: false, erro: 'Este horário está bloqueado: ' + slot.motivo_bloqueio };
    if (slot.passou) return { ok: false, erro: 'Esse horário já passou.' };
    if (!opcoes.painel && slot.cedo_demais) {
        return { ok: false, erro: 'Este horário é cedo demais para marcar agora.' };
    }
    if (slot.ocupados >= slot.capacidade) {
        return { ok: false, erro: 'Esse horário acabou de ser ocupado. Escolha outro.' };
    }
    return { ok: true, quando, slot };
}

/**
 * O próximo bloco vago, calculado AQUI e não no navegador.
 *
 * É o que faz o botão da triagem nascer com a data no rótulo — "Remarcar
 * para qui 06/08 15h" — em vez de abrir um formulário vazio para você
 * procurar. Respeita horário de trabalho, folga, bloqueio e, quando o
 * cliente declarou, o turno que ele prefere.
 */
function proximoSlotLivre(db, opcoes = {}) {
    const cfg = agendaConfig(db);
    const depois = opcoes.depoisDe ? new Date(opcoes.depoisDe).getTime() : Date.now();
    const turno = opcoes.turno || null;

    // Duas passadas: primeiro tentando respeitar o turno preferido, depois
    // sem ele. Um turno preferido que não tem vaga nenhuma não pode deixar
    // o botão mudo — melhor oferecer outro horário do que oferecer nada.
    for (const exigirTurno of (turno ? [turno, null] : [null])) {
        let d = new Date(diaBR(new Date(depois)) + 'T12:00:00Z');
        for (let i = 0; i <= cfg.janelaDias + 14; i++) {
            const dia = d.toISOString().slice(0, 10);
            const achado = horariosLivresPainel(db, dia, { cfg, ignorarId: opcoes.ignorarId })
                .filter(s => new Date(s.inicio).getTime() > depois)
                .filter(s => !exigirTurno || s.turno === exigirTurno)
                .sort((a, b) => new Date(a.inicio) - new Date(b.inicio))[0];
            if (achado) return { ...achado, turno_preferido: !!exigirTurno };
            d.setUTCDate(d.getUTCDate() + 1);
        }
    }
    return null;
}

/**
 * Escapa o que vai dentro de HTML de e-mail.
 *
 * Nome e observação são digitados por quem está do outro lado, e os avisos
 * ao cliente são montados com template string. Sem isto, um nome com `<` ou
 * `<script>` sairia como marcação dentro do e-mail — e o texto do aviso é
 * editável no painel antes do envio, o que é mais uma porta de entrada.
 */
function escaparHtml(texto) {
    return String(texto == null ? '' : texto)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Controle de concorrência otimista.
 *
 * O painel carrega a triagem, você lê, pensa e clica — e nesse intervalo o
 * cliente pode ter remarcado pelo site, ou a outra aba do navegador pode ter
 * confirmado. Gravar por cima apagaria a mudança do outro sem ninguém notar.
 *
 * Então o painel devolve o `atualizado_em` que leu. Se não bater com o do
 * banco, a ação é recusada e a tela recarrega aquele item.
 */
function conferirVersao(registro, atualizadoEm) {
    const atual = registro.atualizado_em || registro.criado_em || null;
    // Registro anterior à migração pode não ter carimbo nenhum: não dá para
    // exigir versão de quem nunca teve uma. Ele ganha o carimbo agora.
    if (!atual) return { ok: true };
    if (!atualizadoEm) {
        return {
            ok: false,
            resposta: {
                success: false,
                conflito: true,
                error: 'Recarregue a triagem antes de agir sobre este item.'
            }
        };
    }
    if (new Date(atualizadoEm).getTime() !== new Date(atual).getTime()) {
        return {
            ok: false,
            resposta: {
                success: false,
                conflito: true,
                error: 'Este atendimento mudou desde que a tela carregou. Recarreguei — confira e refaça.'
            }
        };
    }
    return { ok: true };
}

/** Como o horário é escrito para o cliente e para o painel. */
function rotularQuando(quando, opcoes = {}) {
    return new Date(quando).toLocaleString('pt-BR', {
        weekday: opcoes.curto ? 'short' : 'long',
        day: '2-digit', month: '2-digit',
        hour: '2-digit', minute: '2-digit',
        timeZone: FUSO_NOME
    });
}

/** Situação consolidada de uma pessoa — é o que o painel mostra. */
function situacaoDoUsuario(db, u) {
    const assinatura = assinaturaAtiva(db, u.id);
    // a referência para prazo e renovação é a última assinatura, mesmo vencida:
    // é dela que sai "vence em" e "venceu há", que o painel mostra
    const referencia = assinatura || assinaturaMaisRecente(db, u.id);
    const chamados = db.chamados.filter(c => c.usuario_id === u.id);
    const cobranca = situacaoDeCobranca(db, u.id);

    return {
        id: u.id,
        nome: u.nome || '',
        email: u.email || '',
        telefone: u.telefone || '',
        oab: u.oab || '',
        criado_em: u.created_at || null,
        ultimo_login: u.ultimo_login || null,
        plano: referencia ? referencia.plano : null,
        status: cobranca.estado,              // ativa | inadimplente | cancelada | sem plano
        dias_atraso: cobranca.dias_atraso,
        valida_ate: referencia ? referencia.valida_ate : null,
        // sem assinatura não há o que renovar: fica null e o painel mostra "—"
        renovacao_automatica: referencia ? referencia.renovacao_automatica !== false : null,
        chamados_total: chamados.length,
        chamados_free: chamados.filter(c => c.tipo === 'free').length,
        chamados_premium: chamados.filter(c => c.tipo === 'premium').length,
        // contabilizado pela OAB: vale para todos os cadastros da mesma inscrição
        free_usado: freeUsadoPelaOab(db, u.oab) || chamados.some(c => c.tipo === 'free')
    };
}

// ============================================================
// SERVIDOR HTTP
// ============================================================
const server = http.createServer((req, res) => {
    const { method, url } = req;

    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    // Authorization entra aqui por causa do painel: o navegador so deixa o
    // cabecalho passar numa chamada de outro dominio se ele estiver listado.
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');

    if (method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // ================== LOGIN SOCIAL: GET /auth/:provider ==================
    // Passo 1 — manda o usuario para a tela de consentimento do provedor.
    const authMatch = url.split('?')[0].match(/^\/auth\/(google|microsoft)$/);
    if (method === 'GET' && authMatch) {
        const provider = authMatch[1];
        const cred = oauthCredenciais(provider);

        // de que dominio a pessoa saiu — para devolver nele no fim
        const retorno = retornoSeguro(
            new URL(req.url, `http://${req.headers.host}`).searchParams.get('retorno')
        );

        if (!cred.clientId || !cred.clientSecret) {
            redirecionarComErro(res, `${provider}_nao_configurado`, retorno);
            return;
        }

        limparExpirados(oauthStates, OAUTH_STATE_TTL);
        const state = crypto.randomBytes(24).toString('hex');
        // o retorno viaja no state, guardado no servidor: o Google devolve o
        // state intacto, e assim ele nao pode ser trocado no meio do caminho
        oauthStates.set(state, { provider, retorno, criadoEm: Date.now() });

        const p = OAUTH_PROVIDERS[provider];
        const params = new URLSearchParams({
            client_id: cred.clientId,
            redirect_uri: oauthRedirectUri(provider),
            response_type: 'code',
            scope: p.scope,
            state,
            ...p.extraAuthParams
        });

        res.writeHead(302, { Location: `${p.authUrl}?${params}` });
        res.end();
        return;
    }

    // ============ LOGIN SOCIAL: GET /auth/:provider/callback ============
    // Passo 2 — troca o code por token, checa a conta no provedor e cria o ticket.
    const cbMatch = url.split('?')[0].match(/^\/auth\/(google|microsoft)\/callback$/);
    if (method === 'GET' && cbMatch) {
        const provider = cbMatch[1];
        const query = new URL(req.url, `http://${req.headers.host}`).searchParams;
        const code = query.get('code');
        const state = query.get('state');

        (async () => {
            limparExpirados(oauthStates, OAUTH_STATE_TTL);
            const pendente = oauthStates.get(state);
            // so o state diz de onde a pessoa veio; sem ele o erro cai aqui mesmo
            const retorno = pendente ? pendente.retorno : '';

            if (query.get('error')) {
                redirecionarComErro(res, query.get('error'), retorno);
                return;
            }

            if (!code || !pendente || pendente.provider !== provider) {
                redirecionarComErro(res, 'state_invalido', retorno);
                return;
            }
            oauthStates.delete(state);

            const cred = oauthCredenciais(provider);
            const p = OAUTH_PROVIDERS[provider];

            try {
                const tokenRes = await fetch(p.tokenUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        client_id: cred.clientId,
                        client_secret: cred.clientSecret,
                        code,
                        grant_type: 'authorization_code',
                        redirect_uri: oauthRedirectUri(provider)
                    })
                });

                const token = await tokenRes.json();
                if (!tokenRes.ok || !token.access_token) {
                    console.error(`❌ Token ${provider}:`, token.error_description || token.error);
                    redirecionarComErro(res, 'falha_token', retorno);
                    return;
                }

                const conta = await p.buscarConta(token.access_token);

                if (!conta.email) {
                    redirecionarComErro(res, 'conta_sem_email', retorno);
                    return;
                }
                if (!conta.emailVerificado) {
                    redirecionarComErro(res, 'email_nao_verificado', retorno);
                    return;
                }

                const user = usuarioDaContaSocial(conta, provider);
                const dbLog = loadJsonDb();
                registrarLogin(dbLog, user.id, provider, req);
                saveJsonDb(dbLog);
                console.log(`✅ Login ${p.nome} conferido: ${user.email}`);

                limparExpirados(oauthTickets, OAUTH_TICKET_TTL);
                const ticket = crypto.randomBytes(24).toString('hex');
                oauthTickets.set(ticket, { user, criadoEm: Date.now() });

                // volta para o dominio de onde a pessoa saiu (www.agentej.us),
                // e nao para o do servidor
                res.writeHead(302, { Location: `${retorno}/login.html?oauth_ticket=${ticket}` });
                res.end();

            } catch (err) {
                console.error(`❌ OAuth ${provider}:`, err.message);
                redirecionarComErro(res, 'falha_provedor', retorno);
            }
        })();
        return;
    }

    // ============ LOGIN SOCIAL: POST /oauth/exchange ============
    // Passo 3 — o front troca o ticket (uso unico) pelos dados da sessao.
    if (method === 'POST' && url === '/oauth/exchange') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { ticket } = JSON.parse(body || '{}');
                limparExpirados(oauthTickets, OAUTH_TICKET_TTL);
                const registro = ticket && oauthTickets.get(ticket);

                if (!registro) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Ticket inválido ou expirado' }));
                    return;
                }

                oauthTickets.delete(ticket);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, user: registro.user }));

            } catch {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Erro interno' }));
            }
        });
        return;
    }

    // ============ OTP passo 1 e 2: POST /otp/enviar ============
    // Gera o codigo, guarda o hash com prazo de 5 min e manda pelo canal escolhido.
    if (method === 'POST' && url === '/otp/enviar') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            const responder = (status, payload) => {
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(payload));
            };

            try {
                const { destino } = JSON.parse(body || '{}');
                const alvo = normalizarDestinoOtp(destino);

                if (!alvo) {
                    responder(400, { success: false, error: 'Informe um e-mail válido ou um celular com DDD.' });
                    return;
                }
                if (alvo.tipo === 'telefone' && OTP.canalSms === 'off') {
                    responder(400, { success: false, error: 'Código por SMS ainda não está disponível. Use seu e-mail.' });
                    return;
                }

                const ip = req.socket.remoteAddress || 'desconhecido';
                const bloqueio = checarLimiteEnvio(alvo.valor, ip);
                if (bloqueio) {
                    responder(429, { success: false, error: bloqueio.erro, esperar: bloqueio.esperar });
                    return;
                }

                const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
                const salt = crypto.randomBytes(16).toString('hex');

                // Um codigo por destino: pedir de novo invalida o anterior.
                otpCodigos.set(alvo.valor, {
                    hash: hashCodigo(codigo, salt),
                    salt,
                    tentativas: 0,
                    expiraEm: Date.now() + OTP_TTL,
                    usadoEm: null
                });
                registrarEnvio(alvo.valor, ip);

                const enviado = await enviarCodigoOtp(alvo.tipo, alvo.valor, codigo);
                if (!enviado) {
                    otpCodigos.delete(alvo.valor);
                    responder(502, { success: false, error: 'Não foi possível enviar o código agora. Tente novamente.' });
                    return;
                }

                responder(200, {
                    success: true,
                    msg: `Código enviado para ${mascararDestino(alvo.tipo, alvo.valor)}`,
                    destino: alvo.valor,
                    tipo: alvo.tipo,
                    expira_em: Math.floor(OTP_TTL / 1000),
                    reenviar_em: Math.floor(OTP_INTERVALO_ENVIO / 1000)
                });

            } catch (err) {
                console.error('Erro no envio de OTP:', err.message);
                responder(400, { success: false, error: 'Erro interno' });
            }
        });
        return;
    }

    // ============ OTP passo 3 e 4: POST /otp/verificar ============
    // Confere hash + prazo + tentativas, invalida o codigo e abre a sessao.
    if (method === 'POST' && url === '/otp/verificar') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const responder = (status, payload) => {
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(payload));
            };

            try {
                const { destino, codigo } = JSON.parse(body || '{}');
                const alvo = normalizarDestinoOtp(destino);
                const digitado = String(codigo || '').replace(/\D/g, '');

                if (!alvo || digitado.length !== 6) {
                    responder(400, { success: false, error: 'Código inválido ou expirado.' });
                    return;
                }

                const registro = otpCodigos.get(alvo.valor);
                const valido = registro &&
                    !registro.usadoEm &&
                    registro.expiraEm > Date.now() &&
                    registro.tentativas < OTP_MAX_TENTATIVAS;

                if (!valido || !conferirHash(digitado, registro)) {
                    if (registro) {
                        registro.tentativas += 1;
                        if (registro.tentativas >= OTP_MAX_TENTATIVAS) otpCodigos.delete(alvo.valor);
                    }
                    responder(200, { success: false, error: 'Código inválido ou expirado.' });
                    return;
                }

                // Uso unico: o codigo morre aqui, mesmo que a resposta se perca no caminho.
                otpCodigos.delete(alvo.valor);

                const user = usuarioDoDestinoOtp(alvo.tipo, alvo.valor);
                const dbLog = loadJsonDb();
                registrarLogin(dbLog, user.id, 'codigo', req);
                saveJsonDb(dbLog);
                console.log(`✅ Login por código conferido: ${mascararDestino(alvo.tipo, alvo.valor)}`);
                responder(200, { success: true, user });

            } catch (err) {
                console.error('Erro na verificação de OTP:', err.message);
                responder(400, { success: false, error: 'Erro interno' });
            }
        });
        return;
    }

    // ============ VERIFICAÇÃO: POST /verificacao/solicitar ============
    // Primeira porta do atendimento gratuito. Responde uma de quatro coisas:
    //
    //   liberado    — inscrição já conferida antes: segue direto para a agenda
    //   pendente    — entrou na fila; o agendamento fica bloqueado até você decidir
    //   recusado    — já foi conferida e reprovada
    //   ja_usou     — a inscrição já gastou o gratuito dela
    //
    // O agendamento NÃO acontece aqui. Só depois de "liberado".
    if (method === 'POST' && url === '/verificacao/solicitar') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const responder = (status, payload) => {
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(payload));
            };

            try {
                const entrada = JSON.parse(body || '{}');
                const norma = normalizarInscricao(entrada.inscricao, entrada.uf);
                if (norma.erro) {
                    responder(400, { success: false, error: norma.erro });
                    return;
                }

                const nome = String(entrada.nome || '').trim();
                if (nome.length < 5) {
                    responder(400, { success: false, error: 'Informe seu nome completo, como está na inscrição.' });
                    return;
                }

                const contato = String(entrada.contato || '').replace(/\D/g, '');
                if (contato.length < 10) {
                    responder(400, { success: false, error: 'Informe seu WhatsApp com DDD.' });
                    return;
                }

                const email = String(entrada.email || '').trim().toLowerCase();
                if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
                    responder(400, { success: false, error: 'Informe um e-mail válido.' });
                    return;
                }

                const db = loadJsonDb();

                // 1) O gratuito desta inscrição já foi usado?
                //    Conferido antes de tudo: não faz sentido mandar para a
                //    fila de verificação quem não teria direito de qualquer jeito.
                if (freeUsadoPelaOab(db, norma.rotulo) ||
                    (db.chamados || []).some(c => c.tipo === 'free' && c.oab === norma.rotulo)) {
                    responder(200, {
                        success: false,
                        situacao: 'ja_usou',
                        error: `O atendimento gratuito da inscrição ${norma.rotulo} já foi usado.`,
                        oferecer_premium: true
                    });
                    return;
                }

                // 2) Esta inscrição já foi julgada alguma vez?
                const antiga = verificacaoDe(db, norma.inscricao, norma.uf);

                if (antiga && antiga.status === 'confere') {
                    responder(200, {
                        success: true,
                        situacao: 'liberado',
                        verificacao_id: antiga.id,
                        inscricao: norma.rotulo,
                        msg: 'Inscrição conferida. Escolha o horário do seu atendimento.'
                    });
                    return;
                }

                if (antiga && (antiga.status === 'nao_confere' || antiga.status === 'nao_encontrado')) {
                    responder(200, {
                        success: false,
                        situacao: 'recusado',
                        error: 'Não foi possível concluir seu cadastro. Fale com a gente pelo WhatsApp.'
                    });
                    return;
                }

                if (antiga && antiga.status === 'pendente') {
                    responder(200, {
                        success: true,
                        situacao: 'pendente',
                        verificacao_id: antiga.id,
                        msg: 'Seu cadastro já está em análise. Avisamos por e-mail assim que liberar.'
                    });
                    return;
                }

                // 3) Primeira vez: entra na fila
                db.verificacoes_oab = db.verificacoes_oab || [];
                const registro = {
                    id: proximoId(db.verificacoes_oab),
                    inscricao: norma.inscricao,
                    uf: norma.uf,
                    nome_declarado: nome.slice(0, 120),
                    contato,
                    email,
                    status: 'pendente',
                    observacao: null,
                    decidido_por: null,
                    decidido_em: null,
                    ip: ipDoPedido(req),
                    criado_em: new Date().toISOString()
                };
                db.verificacoes_oab.push(registro);
                saveJsonDb(db);

                console.log(`🔎 Verificação pedida: OAB ${norma.rotulo} — ${nome}`);
                responder(200, {
                    success: true,
                    situacao: 'pendente',
                    verificacao_id: registro.id,
                    msg: 'Recebemos seu pedido. Assim que confirmarmos seu cadastro, você recebe um e-mail para escolher o horário — costuma levar poucas horas.'
                });

            } catch (err) {
                console.error('Erro na verificação:', err.message);
                responder(400, { success: false, error: 'Erro interno' });
            }
        });
        return;
    }

    // ============ AGENDA: GET /agenda/horarios ============
    // Devolve os dias e as horas ainda livres. É calculado aqui, no servidor,
    // porque só ele enxerga o que já foi marcado — no navegador, duas pessoas
    // veriam a mesma vaga como livre.
    if (method === 'GET' && url.split('?')[0] === '/agenda/horarios') {
        const db = loadJsonDb();
        const cfg = agendaConfig(db);
        const dias = diasDaAgenda(db).map(dia => {
            const d = new Date(dia + 'T12:00:00Z');
            const horarios = horariosLivres(db, dia, { cfg });
            return {
                dia,
                // partes separadas para a grade montar o cartão do dia sem
                // ter de fatiar texto no navegador
                semana: d.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' })
                          .replace('.', '').toUpperCase(),
                numero: String(d.getUTCDate()).padStart(2, '0'),
                mes: d.toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', ''),
                rotulo: d.toLocaleDateString('pt-BR', {
                    weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC'
                }),
                vagas: horarios.length,
                horarios
            };
        }).filter(d => d.horarios.length);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, dias }));
        return;
    }

    // ============ CHAMADO GRATUITO: POST /chamado/free ============
    // Registra o chamado de teste. Cada conta tem direito a um só.
    if (method === 'POST' && url === '/chamado/free') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const responder = (status, payload) => {
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(payload));
            };

            try {
                const entrada = JSON.parse(body || '{}');
                const db = loadJsonDb();
                const user = db.usuarios.find(u => u.id === entrada.usuario_id) || null;

                // O agendamento do gratuito só existe depois que a inscrição
                // foi conferida no CNA. Quem manda aqui é a verificação, não a
                // OAB digitada: sem isso bastaria pular a tela de identificação
                // e chamar esta rota direto com um número qualquer.
                const verificacao = (db.verificacoes_oab || [])
                    .find(v => v.id === entrada.verificacao_id);

                // Esta primeira mensagem é trava técnica, não recado ao
                // cliente: só chega aqui quem chamou a rota por fora, pulando
                // a tela. Pela tela é impossível cair neste caso.
                if (!verificacao) {
                    responder(400, { success: false, error: 'Pedido inválido.' });
                    return;
                }
                if (verificacao.status !== 'confere') {
                    responder(200, {
                        success: false,
                        situacao: verificacao.status,
                        error: verificacao.status === 'pendente'
                            ? 'Seu cadastro ainda está sendo confirmado. Avisamos por e-mail assim que liberar.'
                            : 'Não foi possível concluir seu cadastro. Fale com a gente pelo WhatsApp.'
                    });
                    return;
                }

                const oabLimpa = `${verificacao.inscricao}/${verificacao.uf}`;

                // conta pela inscrição: trocar de e-mail não devolve o free
                const jaUsou = freeUsadoPelaOab(db, oabLimpa) ||
                               db.chamados.some(c => c.tipo === 'free' && c.oab === oabLimpa) ||
                               (user && db.chamados.some(c => c.usuario_id === user.id && c.tipo === 'free'));
                if (jaUsou) {
                    responder(200, {
                        success: false,
                        error: `O suporte gratuito da inscrição ${oabLimpa} já foi usado.`,
                        free_usado: true
                    });
                    return;
                }

                // A hora marcada é conferida agora, de novo: entre a pessoa ver
                // a lista e clicar em confirmar, alguém pode ter pego a vaga.
                const vaga = horarioValido(db, entrada.inicio);
                if (!vaga.ok) {
                    responder(200, { success: false, error: vaga.erro, recarregar_agenda: true });
                    return;
                }

                // Marcado pelo cliente também para na triagem: o chamado nasce
                // quando você prioriza, não quando ele escolhe a hora. Sem
                // isso, metade dos atendimentos entraria na fila de trabalho
                // sem passar pela sua conferência.
                const agora = new Date().toISOString();
                const fim = new Date(vaga.quando.getTime() + agendaConfig(db).duracaoMin * 60000);
                db.agendamentos.push({
                    id: proximoId(db.agendamentos),
                    chamado_id: null,
                    usuario_id: user ? user.id : null,
                    oab: oabLimpa,
                    nome: verificacao.nome_declarado || (user && user.nome) || '',
                    verificacao_id: verificacao.id,
                    inicio: vaga.quando.toISOString(),
                    fim: fim.toISOString(),
                    status: 'marcado',
                    // o turno que ele escolheu é o que ele prefere: guardado
                    // aqui, o cálculo do próximo horário livre respeita
                    // sozinho na hora de remarcar
                    preferencia_turno: turnoDaHora(horaBR(vaga.quando)),
                    confirmado_pelo_cliente: true,   // foi ele quem escolheu
                    atualizado_em: agora,
                    criado_em: agora
                });
                saveJsonDb(db);

                console.log(`🆓 Suporte gratuito marcado: OAB ${oabLimpa} → ${vaga.quando.toISOString()}`);
                responder(200, {
                    success: true,
                    msg: 'Atendimento marcado.',
                    inicio: vaga.quando.toISOString()
                });

            } catch (err) {
                console.error('Erro no chamado free:', err.message);
                responder(400, { success: false, error: 'Erro interno' });
            }
        });
        return;
    }

    // ============ CHAMADO DE ASSINANTE: POST /chamado/premium ============
    // Rota separada da free de propósito: as regras não são as mesmas. Aqui não
    // há limite de quantidade, mas há exigência de plano valendo — e é a recusa
    // por vencimento que faz o painel saber quem está inadimplente.
    if (method === 'POST' && url === '/chamado/premium') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const responder = (status, payload) => {
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(payload));
            };

            try {
                const { usuario_id, descricao } = JSON.parse(body || '{}');
                const db = loadJsonDb();
                const user = db.usuarios.find(u => u.id === usuario_id);

                if (!user) {
                    responder(404, { success: false, error: 'Usuário não encontrado' });
                    return;
                }

                const cobranca = situacaoDeCobranca(db, user.id);

                if (cobranca.estado !== 'ativa') {
                    // a mensagem muda conforme o motivo: quem venceu precisa
                    // renovar, quem nunca assinou precisa assinar
                    const motivo = {
                        'inadimplente': `Seu plano venceu há ${cobranca.dias_atraso} dia(s). Renove para abrir chamados.`,
                        'cancelada': 'Seu plano foi cancelado. Assine novamente para abrir chamados.',
                        'sem plano': 'Este atendimento é do Plano Premium. Assine para abrir chamados.'
                    }[cobranca.estado];

                    responder(200, {
                        success: false,
                        error: motivo,
                        situacao: cobranca.estado,
                        dias_atraso: cobranca.dias_atraso
                    });
                    return;
                }

                db.chamados.push({
                    id: proximoId(db.chamados),
                    usuario_id: user.id,
                    oab: user.oab || null,
                    tipo: 'premium',
                    descricao: String(descricao || '').slice(0, 500),
                    status: 'aberto',
                    criado_em: new Date().toISOString()
                });
                saveJsonDb(db);

                console.log(`⭐ Chamado premium aberto: ${user.email || user.telefone}`);
                responder(200, { success: true, msg: 'Chamado registrado. Atendimento prioritário.' });

            } catch (err) {
                console.error('Erro no chamado premium:', err.message);
                responder(400, { success: false, error: 'Erro interno' });
            }
        });
        return;
    }

    // ============ WEBHOOK DO MERCADO PAGO: POST /webhook/mercadopago ============
    // Quem manda aqui é o Mercado Pago, não o navegador — por isso é este POST
    // que vale como prova de pagamento, e não o retorno da tela do cliente.
    //
    // ⚠️ FALTA LIGAR: enquanto MP_ACCESS_TOKEN não estiver configurado, o
    // servidor NÃO consulta a API para conferir o pagamento. Ele apenas anota o
    // evento em `assinaturas` com status "pendente_confirmacao", para você não
    // perder a venda, e avisa no terminal. Assim que a chave existir, a
    // consulta passa a rodar e o status vira "ativa" sozinho.
    if (method === 'POST' && url.split('?')[0] === '/webhook/mercadopago') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            // responde 200 rápido: se demorar, o MP reenvia o mesmo evento
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ recebido: true }));

            try {
                const evento = JSON.parse(body || '{}');
                const eventoId = String(evento.id || evento.data?.id || '');
                if (!eventoId) return;

                const db = loadJsonDb();

                // idempotência: o MP reenvia o mesmo evento quando não recebe 200
                if (db.assinaturas.some(a => a.gateway_ref === eventoId)) {
                    console.log(`↩️  Webhook repetido ignorado (${eventoId})`);
                    return;
                }

                const pagador = evento.data?.payer_email || evento.payer?.email || null;
                const user = pagador
                    ? db.usuarios.find(u => (u.email || '').toLowerCase() === pagador.toLowerCase())
                    : null;

                const validaAte = new Date();
                validaAte.setMonth(validaAte.getMonth() + 1);

                db.assinaturas.push({
                    id: proximoId(db.assinaturas),
                    usuario_id: user ? user.id : null,
                    plano: 'Plano Premium',
                    valor: evento.data?.transaction_amount || 90,
                    // sem a chave da API não dá para confirmar de verdade
                    status: MP.accessToken ? 'ativa' : 'pendente_confirmacao',
                    gateway: 'mercadopago',
                    gateway_ref: eventoId,
                    email_pagador: pagador,
                    inicio: new Date().toISOString(),
                    valida_ate: validaAte.toISOString(),
                    // assinatura do gateway nasce como recorrente; se o cliente
                    // desligar a recorrência lá, isto vira false pelo painel
                    renovacao_automatica: true,
                    criado_em: new Date().toISOString()
                });
                saveJsonDb(db);

                console.log('========================================');
                console.log(`💰 PAGAMENTO RECEBIDO — evento ${eventoId}`);
                console.log(`   pagador: ${pagador || 'não informado'}`);
                console.log(`   usuário no site: ${user ? user.id : 'NÃO IDENTIFICADO — vincule pelo painel'}`);
                console.log('========================================');

                // avisa você por e-mail, se houver destinatário configurado
                if (MP.emailAviso) {
                    await enviarEmailBrevo(
                        MP.emailAviso,
                        '💰 Nova assinatura no AdvogaCert',
                        `<p><strong>Pagamento recebido.</strong></p>
                         <p>Evento: ${eventoId}<br>
                         Pagador: ${pagador || 'não informado'}<br>
                         Usuário no site: ${user ? (user.email || user.telefone) : 'não identificado'}</p>
                         <p>Confira no painel: ${OAUTH.baseUrl.replace(/\/$/, '')}/admin.html</p>`,
                        `Pagamento recebido. Evento ${eventoId}. Pagador: ${pagador || 'n/d'}.`
                    );
                }

            } catch (err) {
                console.error('❌ Webhook Mercado Pago:', err.message);
            }
        });
        return;
    }

    // ============ PAINEL: POST /admin/entrar ============
    if (method === 'POST' && url === '/admin/entrar') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const responder = (status, payload) => {
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(payload));
            };

            try {
                const { senha, codigo } = JSON.parse(body || '{}');
                const ip = req.socket.remoteAddress || 'desconhecido';

                // sem senha configurada o painel fica fechado, e nao aberto
                if (!ADMIN.senha) {
                    responder(200, { success: false, error: 'Painel sem senha configurada no servidor.' });
                    return;
                }

                const tentativas = (adminTentativas.get(ip) || [])
                    .filter(t => Date.now() - t < ADMIN_JANELA_TENTATIVAS);
                if (tentativas.length >= ADMIN_MAX_TENTATIVAS) {
                    responder(429, { success: false, error: 'Muitas tentativas. Aguarde 15 minutos.' });
                    return;
                }

                const registrarErro = () => adminTentativas.set(ip, [...tentativas, Date.now()]);

                if (!senha || senha !== ADMIN.senha) {
                    registrarErro();
                    responder(200, { success: false, error: 'Senha incorreta' });
                    return;
                }

                // segundo fator: só exigido se houver segredo configurado
                if (ADMIN.totpSecret) {
                    if (!codigo) {
                        responder(200, { success: false, precisa_codigo: true, error: 'Digite o código do autenticador' });
                        return;
                    }
                    if (!totpValido(ADMIN.totpSecret, codigo)) {
                        registrarErro();
                        responder(200, { success: false, precisa_codigo: true, error: 'Código inválido' });
                        return;
                    }
                }

                adminTentativas.delete(ip);
                limparExpirados(adminSessoes, ADMIN_SESSAO_TTL);
                const token = crypto.randomBytes(24).toString('hex');
                adminSessoes.set(token, { criadoEm: Date.now() });

                // O token vai no cookie httpOnly — o JavaScript da página não
                // consegue lê-lo, então um XSS no painel não leva a sessão.
                // Secure só em produção: em http://localhost o navegador
                // descarta cookie marcado como Secure e o login não fecharia.
                const producao = /^https:/.test(OAUTH.baseUrl);
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'Set-Cookie': [
                        `admin_sessao=${token}`,
                        'HttpOnly',
                        'Path=/',
                        'SameSite=Strict',
                        `Max-Age=${ADMIN_SESSAO_TTL / 1000}`,
                        producao ? 'Secure' : ''
                    ].filter(Boolean).join('; ')
                });
                // o token não volta mais no corpo: quem guarda é o cookie
                res.end(JSON.stringify({ success: true }));
                return;

            } catch {
                responder(400, { success: false, error: 'Erro interno' });
            }
        });
        return;
    }

    // ============ PAINEL: GET /admin/dados ============
    // Devolve tudo o que a tela do painel mostra, já consolidado.
    if (method === 'GET' && url.split('?')[0] === '/admin/dados') {
        if (!sessaoAdmin(req)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Sessão expirada' }));
            return;
        }

        const db = loadJsonDb();
        const pessoas = db.usuarios.map(u => situacaoDoUsuario(db, u));
        const trintaDias = Date.now() - 30 * 24 * 60 * 60 * 1000;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            // Estado das peças, para a seção de diagnóstico do painel. É o
            // servidor quem sabe disso: o navegador não enxerga variável de
            // ambiente nem se o Supabase respondeu.
            saude: {
                banco: SUPABASE_ATIVO ? 'Supabase' : 'arquivo local (usuarios.json)',
                banco_ok: !!SUPABASE_ATIVO,
                tabelas: COLECOES.map(c => ({ nome: c, linhas: (db[c] || []).length })),
                servidor_desde: new Date(Date.now() - process.uptime() * 1000).toISOString(),
                node: process.version,
                sms: OTP.canalSms === 'off' ? 'desligado' : OTP.canalSms,
                email: (process.env.BREVO_API_KEY || SECRETS.brevo?.api_key) ? 'configurado' : 'sem chave',
                google: (OAUTH.google && OAUTH.google.clientId) ? 'configurado' : 'sem credenciais',
                pagamento: MP.link ? 'link configurado' : 'NÃO ligado (checkout não cobra)',
                agenda: (() => {
                    const cfg = agendaConfig(db);
                    const ativos = Object.values(cfg.dias).filter(d => d.ativo);
                    return `${ativos.length} dia(s) da semana, blocos de ${cfg.duracaoMin}min, ` +
                           `até ${cfg.janelaDias} dias — configurável na aba Triagem`;
                })()
            },
            resumo: {
                usuarios: pessoas.length,
                ativos: pessoas.filter(p => p.status === 'ativa').length,
                inadimplentes: pessoas.filter(p => p.status === 'inadimplente').length,
                sem_renovacao: pessoas.filter(p => p.status === 'ativa' && p.renovacao_automatica === false).length,
                free_usados: pessoas.filter(p => p.free_usado).length,
                chamados: db.chamados.length,
                logins_30d: db.logins.filter(l => new Date(l.criado_em).getTime() > trintaDias).length,
                receita_mes: db.assinaturas
                    .filter(a => a.status === 'ativa')
                    .reduce((soma, a) => soma + Number(a.valor || 0), 0)
            },
            pessoas,
            // agenda em ordem cronológica: é uma lista do que vem pela frente,
            // não um histórico — por isso não vai invertida como as outras
            agendamentos: (db.agendamentos || [])
                .slice()
                .sort((a, b) => new Date(a.inicio) - new Date(b.inicio))
                .map(a => ({
                    ...a,
                    // a agenda precisa saber em que ponto da esteira o item
                    // está para oferecer o botão certo
                    virou_chamado: !!a.chamado_id,
                    confirmado: a.status === 'confirmado'
                })),
            assinaturas: db.assinaturas.slice().reverse(),
            // vai com o nome e o contato de quem abriu: o painel lista os
            // chamados um a um, e só o usuario_id não diz nada na tela
            chamados: db.chamados.slice().reverse().map(c => {
                const dono = db.usuarios.find(u => u.id === c.usuario_id);
                return {
                    ...c,
                    nome: dono ? (dono.nome || dono.email || dono.telefone || '') : '',
                    contato: dono ? (dono.telefone || dono.email || '') : ''
                };
            })
        }));
        return;
    }

    // ============ PAINEL: GET /admin/verificacoes ============
    // A fila de conferência. Vem com tudo pronto para decidir em segundos:
    // inscrição formatada, nome para bater no CNA, contato, espera e sinais.
    if (method === 'GET' && url.split('?')[0] === '/admin/verificacoes') {
        if (!sessaoAdmin(req)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Sessão expirada' }));
            return;
        }

        const q = new URL(req.url, `http://${req.headers.host}`).searchParams;
        const status = q.get('status') || 'pendente';
        const pagina = Math.max(1, Number(q.get('pagina')) || 1);
        const porPagina = Math.min(100, Number(q.get('por_pagina')) || 20);

        const db = loadJsonDb();
        const todas = (db.verificacoes_oab || [])
            .filter(v => status === 'todos' || v.status === status)
            // pendente: o mais antigo primeiro, que é quem esperou mais.
            // decidido: o mais recente primeiro, que é o histórico.
            .sort((a, b) => status === 'pendente'
                ? new Date(a.criado_em) - new Date(b.criado_em)
                : new Date(b.decidido_em || b.criado_em) - new Date(a.decidido_em || a.criado_em));

        // Confere, mas ainda sem hora marcada: a bola está com o cliente (ele
        // escolhe no site), mas você pode empurrar com um lembrete ou marcar
        // por ele se demorar demais. Calculado só para quem está em
        // 'confere' — nas outras listas ninguém vai agir sobre isso.
        const agendamentos = db.agendamentos || [];
        const semHoraAinda = id =>
            !agendamentos.some(a => a.verificacao_id === id && a.status !== 'cancelado');

        const inicio = (pagina - 1) * porPagina;
        const itens = todas.slice(inicio, inicio + porPagina).map(v => ({
            id: v.id,
            inscricao: `${v.inscricao}/${v.uf}`,
            uf: v.uf,
            nome_declarado: v.nome_declarado,
            contato: v.contato,
            email: v.email,
            status: v.status,
            observacao: v.observacao,
            decidido_por: v.decidido_por,
            decidido_em: v.decidido_em,
            criado_em: v.criado_em,
            espera_horas: Math.floor((Date.now() - new Date(v.criado_em).getTime()) / 3600000),
            sinais: sinaisDeFraude(db, v),
            aguardando_hora: v.status === 'confere' && semHoraAinda(v.id),
            horas_desde_liberacao: v.status === 'confere'
                ? Math.floor((Date.now() - new Date(v.decidido_em || v.criado_em).getTime()) / 3600000)
                : null
        }));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            itens,
            total: todas.length,
            pagina,
            por_pagina: porPagina,
            pendentes: (db.verificacoes_oab || []).filter(v => v.status === 'pendente').length
        }));
        return;
    }

    // ============ PAINEL: POST /admin/verificacao/decidir ============
    // "Confere" libera o agendamento e avisa por e-mail. As outras duas
    // bloqueiam. Toda decisão vai para a auditoria, com quem, quando e por quê.
    if (method === 'POST' && url === '/admin/verificacao/decidir') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            const responder = (status, payload) => {
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(payload));
            };

            if (!sessaoAdmin(req)) {
                responder(401, { success: false, error: 'Sessão expirada' });
                return;
            }

            try {
                const { id, decisao, observacao } = JSON.parse(body || '{}');
                const VALIDAS = ['confere', 'nao_confere', 'nao_encontrado'];
                if (!VALIDAS.includes(decisao)) {
                    responder(400, { success: false, error: 'Decisão inválida' });
                    return;
                }

                const db = loadJsonDb();
                const v = (db.verificacoes_oab || []).find(x => x.id === id);
                if (!v) {
                    responder(404, { success: false, error: 'Verificação não encontrada' });
                    return;
                }

                const antes = v.status;
                v.status = decisao;
                v.observacao = String(observacao || '').slice(0, 500);
                v.decidido_por = 'painel';
                v.decidido_em = new Date().toISOString();

                auditar(db, {
                    acao: 'verificacao_decidida',
                    alvo: `OAB ${v.inscricao}/${v.uf}`,
                    detalhe: `${antes} -> ${decisao}${v.observacao ? ' | ' + v.observacao : ''}`,
                    ip: ipDoPedido(req)
                });
                saveJsonDb(db);

                console.log(`⚖️  Verificação ${v.inscricao}/${v.uf}: ${antes} -> ${decisao}`);

                // O aviso por e-mail não pode derrubar a decisão: se a Brevo
                // falhar, a decisão já está gravada e você não perde o trabalho.
                if (v.email) {
                    const liberado = decisao === 'confere';
                    const assunto = liberado
                        ? 'Sua inscrição foi confirmada — AdvogaCert'
                        : 'Sobre seu pedido de atendimento — AdvogaCert';
                    const corpo = liberado
                        ? `<p>Olá, ${v.nome_declarado}.</p>
                           <p>Confirmamos sua inscrição <strong>${v.inscricao}/${v.uf}</strong>.
                           Seu atendimento gratuito está liberado.</p>
                           <p><a href="https://www.agentej.us/index.html#planos">Escolher o horário</a></p>`
                        : `<p>Olá, ${v.nome_declarado}.</p>
                           <p>Não conseguimos confirmar a inscrição
                           <strong>${v.inscricao}/${v.uf}</strong> no cadastro da OAB.</p>
                           <p>Se acha que houve engano, responda este e-mail ou fale
                           conosco pelo WhatsApp que a gente confere de novo.</p>`;

                    enviarEmailBrevo(v.email, assunto, corpo)
                        .catch(e => console.error('Aviso de verificação não saiu:', e.message));
                }

                responder(200, {
                    success: true,
                    msg: decisao === 'confere' ? 'Liberado e avisado por e-mail.' : 'Registrado.',
                    status: decisao
                });

            } catch (err) {
                console.error('Erro ao decidir verificação:', err.message);
                responder(400, { success: false, error: 'Erro interno' });
            }
        });
        return;
    }

    // ============ PAINEL: GET /admin/triagem ============
    // O que está entre a liberação e o atendimento. Depois que você confere a
    // OAB, a pessoa não some nem vira chamado na hora: ela precisa escolher o
    // horário. Esta aba mostra quem está nesse meio do caminho — senão o
    // liberado sai da fila de verificação e desaparece do painel.
    if (method === 'GET' && url.split('?')[0] === '/admin/triagem') {
        if (!sessaoAdmin(req)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Sessão expirada' }));
            return;
        }

        const db = loadJsonDb();
        const agendamentos = db.agendamentos || [];
        const agora = Date.now();

        // Quem ainda não conferiu a OAB e quem conferiu mas não marcou hora
        // não estão mais aqui: a Triagem é só remarcação de horário já
        // marcado. "Aguardando verificação" mora na aba Verificação de OAB
        // (é lá que a ação acontece); "conferido, sem hora ainda" mora na
        // mesma aba, porque é continuação do mesmo status — ver
        // /admin/verificacoes.

        // Hora marcada, esperando sua decisão de mandar para a fila.
        // Só entra quem ainda NÃO virou chamado: promovido sai da triagem e
        // passa a viver na aba de chamados, senão apareceria nos dois lugares
        // e você não saberia onde ele está de verdade.
        //
        // Cada item vem com as AÇÕES JÁ RESOLVIDAS pelo servidor: qual é o
        // próximo horário livre, se empurrar uma hora cabe, se empurrar um
        // dia cabe. É o que permite o botão nascer com a data no rótulo e
        // desabilitado quando criaria conflito — o navegador não recalcula
        // agenda, só desenha o que recebeu.
        // Fica na triagem tudo que ainda não virou chamado. O 'confirmado'
        // sem chamado_id é herança do fluxo antigo (confirmava aqui, abria o
        // chamado em outra aba): hoje confirmar já abre o chamado, mas o
        // registro velho precisa continuar visível para você fechá-lo.
        const marcados = agendamentos
            .filter(a => (a.status === 'marcado' || a.status === 'confirmado') && !a.chamado_id)
            .map(a => {
                const v = (db.verificacoes_oab || []).find(x => x.id === a.verificacao_id);
                const dono = a.usuario_id
                    ? (db.usuarios || []).find(u => u.id === a.usuario_id)
                    : null;
                const inicio = new Date(a.inicio).getTime();

                /** Um destino possível para este agendamento, já conferido. */
                const destino = (quando) => {
                    const teste = horarioValido(db, new Date(quando).toISOString(), {
                        painel: true, ignorarId: a.id
                    });
                    return {
                        inicio: new Date(quando).toISOString(),
                        rotulo: rotularQuando(quando, { curto: true }),
                        ok: teste.ok,
                        motivo: teste.ok ? null : teste.erro
                    };
                };

                const proximo = proximoSlotLivre(db, {
                    depoisDe: Math.max(Date.now(), inicio),
                    turno: a.preferencia_turno || null,
                    ignorarId: a.id
                });

                return {
                    id: a.id,
                    verificacao_id: a.verificacao_id,
                    inscricao: a.oab,
                    nome: a.nome || (v ? v.nome_declarado : ''),
                    contato: v ? v.contato : (dono ? dono.telefone : ''),
                    email: v ? v.email : (dono ? dono.email : ''),
                    inicio: a.inicio,
                    fim: a.fim,
                    status: a.status,
                    // o painel devolve isto na hora de agir. Se não bater com
                    // o que está no banco, alguém mexeu no meio e a ação é
                    // recusada em vez de sobrescrever a mudança do outro.
                    atualizado_em: a.atualizado_em || a.criado_em || null,
                    confirmado_pelo_cliente: a.confirmado_pelo_cliente === true,
                    preferencia_turno: a.preferencia_turno || null,
                    remarcado_de: a.remarcado_de || null,
                    tipo: dono && assinaturaAtiva(db, dono.id) ? 'premium' : 'free',
                    passou: inicio < agora,
                    horas_ate: (inicio - agora) / 3600000,
                    acoes: {
                        proximo_livre: proximo
                            ? {
                                inicio: proximo.inicio,
                                rotulo: rotularQuando(proximo.inicio, { curto: true }),
                                ok: true,
                                turno_preferido: proximo.turno_preferido
                            }
                            : { ok: false, motivo: 'Não há horário livre na sua agenda.' },
                        empurrar_1h: destino(inicio + 3600000),
                        empurrar_1d: destino(inicio + 86400000)
                    }
                };
            })
            // Premium primeiro: ele não espera a fila. Dentro de cada grupo,
            // ordem do relógio — o que acontece antes aparece antes.
            .sort((a, b) =>
                (a.tipo === b.tipo ? 0 : a.tipo === 'premium' ? -1 : 1) ||
                (new Date(a.inicio) - new Date(b.inicio)));

        // ---- alertas: só o que exige ação agora ----
        //
        // A régua é essa: se você não puder fazer nada a respeito, não é
        // alerta, é informação — e informação fica no cartão, não no topo.
        const cfg = agendaConfig(db);
        const alertas = [];

        marcados.forEach(m => {
            if (m.passou) {
                alertas.push({
                    tipo: 'passou',
                    agendamento_id: m.id,
                    texto: `${m.inscricao} era ${rotularQuando(m.inicio, { curto: true })} e ninguém deu baixa`
                });
            } else if (m.horas_ate < 2 && !m.confirmado_pelo_cliente) {
                alertas.push({
                    tipo: 'sem_confirmacao',
                    agendamento_id: m.id,
                    texto: `${m.inscricao} é em menos de 2h e o cliente não confirmou`
                });
            }

            // Fora do expediente: o horário não corresponde a nenhum bloco da
            // agenda daquele dia. Acontece quando a configuração muda depois
            // de alguém já ter marcado — ou quando o cliente achou uma brecha.
            const slots = slotsDoDia(db, diaBR(m.inicio), { cfg });
            if (!m.passou && !slots.some(s => s.inicio === m.inicio)) {
                alertas.push({
                    tipo: 'fora_do_expediente',
                    agendamento_id: m.id,
                    texto: `${m.inscricao} está marcado fora do seu horário de trabalho`
                });
            }
        });

        // Sobreposição é do SLOT, não do agendamento: dois no mesmo bloco só
        // é problema se passar da capacidade que você definiu para o dia.
        const conflitos = [];
        const diasComGente = [...new Set(marcados.filter(m => !m.passou).map(m => diaBR(m.inicio)))];
        diasComGente.forEach(dia => {
            slotsDoDia(db, dia, { cfg }).forEach(s => {
                if (s.ocupados <= s.capacidade) return;
                conflitos.push(s.inicio);
                alertas.push({
                    tipo: 'sobreposicao',
                    agendamento_id: s.agendamentos[0],
                    texto: `${s.ocupados} atendimentos em ${rotularQuando(s.inicio, { curto: true })} ` +
                           `— a capacidade do bloco é ${s.capacidade}`
                });
            });
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            agora: new Date().toISOString(),
            fuso: FUSO_NOME,
            marcados,
            alertas,
            conflitos: conflitos.length,
            atrasados: marcados.filter(m => m.passou).length
        }));
        return;
    }

    // ============ PAINEL: GET /admin/contadores ============
    // Um pedido só para todos os selos das abas.
    //
    // Cada aba conta APENAS o que está parado nela. Não há número passando
    // de uma para a outra: o item muda de estágio e os dois contadores são
    // recalculados do zero. Antes cada módulo mandava o seu selo depois de
    // carregar a lista inteira — três respostas grandes para exibir três
    // números, e uma aba nunca aberta ficava sem contador nenhum.
    if (method === 'GET' && url.split('?')[0] === '/admin/contadores') {
        if (!sessaoAdmin(req)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Sessão expirada' }));
            return;
        }

        const db = loadJsonDb();
        const agora = Date.now();
        const cfg = agendaConfig(db);
        const verificacoes = db.verificacoes_oab || [];
        const agendamentos = db.agendamentos || [];

        const pendentes = verificacoes.filter(v => v.status === 'pendente');
        // mesmo critério de /admin/verificacoes: um agendamento cancelado
        // não conta como "já marcou hora"
        const semHora = verificacoes.filter(v => v.status === 'confere' &&
            !agendamentos.some(a => a.verificacao_id === v.id && a.status !== 'cancelado'));
        // mesmo recorte da aba: inclui o 'confirmado' órfão do fluxo antigo
        const naTriagem = agendamentos.filter(a =>
            (a.status === 'marcado' || a.status === 'confirmado') && !a.chamado_id);
        const abertos = (db.chamados || []).filter(c => c.status === 'aberto');

        // Vermelho não é "tem coisa": é "tem coisa que já devia estar feita".
        // Um item esperando há mais de 24h, ou um conflito de horário.
        const velho = lista => lista.some(x =>
            agora - new Date(x.decidido_em || x.criado_em || agora).getTime() > 24 * 3600000);

        let conflitos = 0;
        [...new Set(naTriagem.map(a => diaBR(a.inicio)))].forEach(dia => {
            slotsDoDia(db, dia, { cfg }).forEach(s => {
                if (s.ocupados > s.capacidade) conflitos++;
            });
        });

        const passouDaHora = naTriagem.filter(a => new Date(a.inicio).getTime() < agora).length;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            aguardando_oab: pendentes.length,
            aguardando_oab_urgente: velho(pendentes),
            aguardando_hora: semHora.length,
            aguardando_hora_urgente: velho(semHora),
            triagem: naTriagem.length,
            triagem_urgente: conflitos > 0 || passouDaHora > 0,
            chamados_abertos: abertos.length,
            chamados_urgente: velho(abertos),
            conflitos,
            saude_alertas: SUPABASE_ATIVO && gravacoesComErro > 0 ? 1 : 0
        }));
        return;
    }

    // ============ PAINEL: GET /admin/agenda/ocupacao ============
    // A grade da semana. Devolve, bloco a bloco, quanta gente cabe e quanta
    // está marcada — mais quem é essa gente, para o painel lateral abrir sem
    // um segundo pedido.
    //
    // O navegador NÃO calcula agenda. Ele recebe cada bloco já classificado
    // (livre, ocupado, cheio, bloqueado) e só pinta. Duas telas calculando a
    // mesma coisa é como as duas discordarem.
    if (method === 'GET' && url.split('?')[0] === '/admin/agenda/ocupacao') {
        if (!sessaoAdmin(req)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Sessão expirada' }));
            return;
        }

        const db = loadJsonDb();
        const cfg = agendaConfig(db);
        const params = new URLSearchParams(url.split('?')[1] || '');
        const eData = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

        const de = eData(params.get('de')) ? params.get('de') : diaBR(new Date());
        let ate = eData(params.get('ate')) ? params.get('ate') : null;
        if (!ate) {
            const d = new Date(de + 'T12:00:00Z');
            d.setUTCDate(d.getUTCDate() + 6);
            ate = d.toISOString().slice(0, 10);
        }

        // Sem teto, um `ate` distante montaria meses de grade numa resposta só.
        const limite = new Date(de + 'T12:00:00Z');
        limite.setUTCDate(limite.getUTCDate() + 30);
        if (new Date(ate + 'T12:00:00Z') > limite) ate = limite.toISOString().slice(0, 10);

        const porId = id => (db.agendamentos || []).find(a => a.id === id);
        const dias = [];
        const cursor = new Date(de + 'T12:00:00Z');

        while (cursor.toISOString().slice(0, 10) <= ate) {
            const dia = cursor.toISOString().slice(0, 10);
            const regra = cfg.dias[cursor.getUTCDay()];
            dias.push({
                dia,
                semana: cursor.toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'UTC' })
                              .replace('.', '').toUpperCase(),
                numero: String(cursor.getUTCDate()).padStart(2, '0'),
                mes: cursor.toLocaleDateString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', ''),
                ativo: regra.ativo,
                slots: slotsDoDia(db, dia, { cfg }).map(s => ({
                    inicio: s.inicio,
                    fim: s.fim,
                    rotulo: s.rotulo,
                    turno: s.turno,
                    capacidade: s.capacidade,
                    ocupados: s.ocupados,
                    bloqueado: s.bloqueado,
                    bloqueio_id: s.bloqueio_id,
                    motivo_bloqueio: s.motivo_bloqueio,
                    passou: s.passou,
                    // quem está aqui dentro — é o que o painel lateral mostra
                    pessoas: s.agendamentos.map(id => {
                        const a = porId(id);
                        if (!a) return null;
                        return {
                            agendamento_id: a.id,
                            inscricao: a.oab,
                            nome: a.nome || '',
                            status: a.status,
                            virou_chamado: !!a.chamado_id,
                            confirmado_pelo_cliente: a.confirmado_pelo_cliente === true
                        };
                    }).filter(Boolean)
                }))
            });
            cursor.setUTCDate(cursor.getUTCDate() + 1);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, de, ate, fuso: FUSO_NOME, dias }));
        return;
    }

    // ============ PAINEL: GET /admin/agenda/config ============
    // O que alimenta a validação do site inteiro. Sai daqui para a tela de
    // configuração da própria aba Triagem.
    if (method === 'GET' && url.split('?')[0] === '/admin/agenda/config') {
        if (!sessaoAdmin(req)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Sessão expirada' }));
            return;
        }

        const db = loadJsonDb();
        const cfg = agendaConfig(db);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            dias: Object.values(cfg.dias),
            duracao_min: cfg.duracaoMin,
            folga_min: cfg.folgaMin,
            antecedencia_min: cfg.antecedenciaMin,
            janela_dias: cfg.janelaDias,
            bloqueios: (db.agenda_bloqueios || [])
                .slice()
                .sort((a, b) => new Date(a.inicio) - new Date(b.inicio))
                .map(b => ({
                    id: b.id,
                    inicio: b.inicio,
                    fim: b.fim,
                    motivo: b.motivo || '',
                    rotulo: rotularQuando(b.inicio, { curto: true }) + ' → ' +
                            rotularQuando(b.fim, { curto: true })
                }))
        }));
        return;
    }

    // ============ PAINEL: POST /admin/agenda/config ============
    // Salva o horário de trabalho. Muda a agenda dos dois lados de uma vez:
    // a grade do painel e a lista que o cliente vê no site.
    if (method === 'POST' && url === '/admin/agenda/config') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const responder = (status, payload) => {
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(payload));
            };

            if (!sessaoAdmin(req)) {
                responder(401, { success: false, error: 'Sessão expirada' });
                return;
            }

            try {
                const entrada = JSON.parse(body || '{}');
                const db = loadJsonDb();
                const inteiro = (v, min, max, padrao) => {
                    const n = Math.round(Number(v));
                    return Number.isFinite(n) && n >= min && n <= max ? n : padrao;
                };

                db.agenda_config = db.agenda_config || [];
                (entrada.dias || []).forEach(d => {
                    const dia = inteiro(d.dia_semana, 0, 6, null);
                    if (dia === null) return;

                    const inicio = inteiro(d.hora_inicio, 0, 23, 18);
                    const fim = inteiro(d.hora_fim, 1, 24, 24);
                    // Fim antes do início não é agenda curta, é agenda vazia —
                    // e vazia sem aviso pareceria o site estar quebrado.
                    if (fim <= inicio) {
                        throw new Error(`No dia ${dia}, o fim (${fim}h) precisa ser depois do início (${inicio}h).`);
                    }

                    const linha = db.agenda_config.find(c => Number(c.dia_semana) === dia);
                    const valores = {
                        dia_semana: dia,
                        hora_inicio: inicio,
                        hora_fim: fim,
                        capacidade: inteiro(d.capacidade, 1, 10, 1),
                        ativo: d.ativo !== false
                    };
                    if (linha) Object.assign(linha, valores);
                    else db.agenda_config.push({ id: proximoId(db.agenda_config), ...valores });
                });

                db.agenda_ajustes = db.agenda_ajustes || [];
                const ajustes = db.agenda_ajustes[0] || { id: 1 };
                ajustes.duracao_min = inteiro(entrada.duracao_min, 15, 480, 60);
                ajustes.folga_min = inteiro(entrada.folga_min, 0, 240, 0);
                ajustes.antecedencia_min = inteiro(entrada.antecedencia_min, 0, 20160, 1440);
                ajustes.janela_dias = inteiro(entrada.janela_dias, 1, 90, 7);
                if (!db.agenda_ajustes.length) db.agenda_ajustes.push(ajustes);

                auditar(db, {
                    acao: 'agenda_configurada',
                    alvo: 'agenda',
                    detalhe: `blocos de ${ajustes.duracao_min}min, folga ${ajustes.folga_min}min, ` +
                             `antecedência ${ajustes.antecedencia_min}min, janela ${ajustes.janela_dias}d`,
                    ip: ipDoPedido(req)
                });
                saveJsonDb(db);

                responder(200, { success: true, msg: 'Agenda salva. Vale para o site também.' });

            } catch (err) {
                console.error('Erro ao salvar agenda:', err.message);
                responder(400, { success: false, error: err.message || 'Erro interno' });
            }
        });
        return;
    }

    // ============ PAINEL: POST /admin/agenda/bloqueio ============
    // Feriado, viagem, ou simplesmente "hoje não".
    //
    // Bloquear NÃO empurra quem já estava marcado: o pedido é recusado com a
    // lista de quem precisa ser remarcado antes. Bloquear por cima de alguém
    // deixaria um atendimento combinado num horário que não existe mais, e
    // ninguém saberia disso até o cliente aparecer.
    if (method === 'POST' && url === '/admin/agenda/bloqueio') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const responder = (status, payload) => {
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(payload));
            };

            if (!sessaoAdmin(req)) {
                responder(401, { success: false, error: 'Sessão expirada' });
                return;
            }

            try {
                const { acao, inicio, fim, motivo, id } = JSON.parse(body || '{}');
                const db = loadJsonDb();
                db.agenda_bloqueios = db.agenda_bloqueios || [];

                if (acao === 'remover') {
                    const alvo = db.agenda_bloqueios.find(b => b.id === id);
                    if (!alvo) {
                        responder(404, { success: false, error: 'Bloqueio não encontrado' });
                        return;
                    }
                    db.agenda_bloqueios = db.agenda_bloqueios.filter(b => b.id !== id);
                    auditar(db, {
                        acao: 'bloqueio_removido',
                        alvo: 'agenda',
                        detalhe: `${alvo.inicio} → ${alvo.fim}`,
                        ip: ipDoPedido(req)
                    });
                    saveJsonDb(db);
                    apagarNoSupabase('agenda_bloqueios', [id])
                        .catch(e => console.error('Bloqueio não saiu do banco:', e.message));
                    responder(200, { success: true, msg: 'Bloqueio removido.' });
                    return;
                }

                const de = new Date(inicio);
                const ate = new Date(fim);
                if (isNaN(de) || isNaN(ate) || ate <= de) {
                    responder(400, { success: false, error: 'Faixa de datas inválida.' });
                    return;
                }

                const ocupando = agendamentosVivos(db).filter(a => {
                    const ai = new Date(a.inicio).getTime();
                    return ai >= de.getTime() && ai < ate.getTime();
                });
                if (ocupando.length) {
                    responder(200, {
                        success: false,
                        precisa_remarcar: ocupando.map(a => ({
                            agendamento_id: a.id,
                            inscricao: a.oab,
                            rotulo: rotularQuando(a.inicio, { curto: true })
                        })),
                        error: `Há ${ocupando.length} atendimento(s) nessa faixa. Remarque antes de bloquear.`
                    });
                    return;
                }

                const registro = {
                    id: proximoId(db.agenda_bloqueios),
                    inicio: de.toISOString(),
                    fim: ate.toISOString(),
                    motivo: String(motivo || 'Bloqueado').slice(0, 200),
                    criado_em: new Date().toISOString()
                };
                db.agenda_bloqueios.push(registro);

                auditar(db, {
                    acao: 'bloqueio_criado',
                    alvo: 'agenda',
                    detalhe: `${registro.inicio} → ${registro.fim} (${registro.motivo})`,
                    ip: ipDoPedido(req)
                });
                saveJsonDb(db);

                responder(200, { success: true, msg: 'Horário bloqueado.', bloqueio: registro });

            } catch (err) {
                console.error('Erro no bloqueio:', err.message);
                responder(400, { success: false, error: 'Erro interno' });
            }
        });
        return;
    }

    // ============ PAINEL: POST /admin/sugerir-horarios ============
    // O contrário de impor: manda três opções e devolve a escolha ao cliente.
    //
    // O agendamento volta para 'aguardando_hora' — sai da lista de marcados e
    // entra na de "esperando o cliente". Se ficasse como marcado, o horário
    // continuaria reservado para uma hora que ele já sabe que não vale.
    if (method === 'POST' && url === '/admin/sugerir-horarios') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const responder = (status, payload) => {
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(payload));
            };

            if (!sessaoAdmin(req)) {
                responder(401, { success: false, error: 'Sessão expirada' });
                return;
            }

            try {
                const { agendamento_id, atualizado_em, texto, apenas_calcular } = JSON.parse(body || '{}');
                const db = loadJsonDb();
                const a = (db.agendamentos || []).find(x => x.id === agendamento_id);

                if (!a) {
                    responder(404, { success: false, error: 'Agendamento não encontrado' });
                    return;
                }

                // Três opções, cada uma depois da anterior, respeitando o
                // turno que o cliente já declarou.
                const opcoes = [];
                let cursor = Date.now();
                for (let i = 0; i < 3; i++) {
                    const s = proximoSlotLivre(db, {
                        depoisDe: cursor,
                        turno: a.preferencia_turno || null,
                        ignorarId: a.id
                    });
                    if (!s) break;
                    opcoes.push({ inicio: s.inicio, rotulo: rotularQuando(s.inicio) });
                    cursor = new Date(s.inicio).getTime();
                }

                if (!opcoes.length) {
                    responder(200, { success: false, error: 'Não há horário livre para sugerir.' });
                    return;
                }
                // O painel pede primeiro sem gravar, para montar a prévia do
                // aviso com as opções reais antes de você mandar.
                if (apenas_calcular) {
                    responder(200, { success: true, opcoes });
                    return;
                }

                const versao = conferirVersao(a, atualizado_em);
                if (!versao.ok) { responder(200, versao.resposta); return; }

                a.status = 'aguardando_hora';
                a.confirmado_pelo_cliente = false;
                a.atualizado_em = new Date().toISOString();

                auditar(db, {
                    acao: 'horarios_sugeridos',
                    alvo: `OAB ${a.oab}`,
                    detalhe: opcoes.map(o => o.rotulo).join(' | '),
                    ip: ipDoPedido(req)
                });
                saveJsonDb(db);

                const v = (db.verificacoes_oab || []).find(x => x.id === a.verificacao_id);
                const alvo = (v && v.email) || null;
                if (alvo) {
                    const corpo = texto
                        ? `<p>${escaparHtml(texto).replace(/\n/g, '<br>')}</p>`
                        : `<p>Olá, ${escaparHtml(a.nome || '')}.</p>
                           <p>Precisamos remarcar seu atendimento. Estes horários estão livres:</p>
                           <ul>${opcoes.map(o => `<li>${escaparHtml(o.rotulo)}</li>`).join('')}</ul>
                           <p>Responda este e-mail com o que preferir e a gente confirma.</p>`;
                    enviarEmailBrevo(alvo, 'Escolha o horário do seu atendimento — AdvogaCert', corpo)
                        .catch(e => console.error('Sugestão de horários não saiu:', e.message));
                }

                responder(200, {
                    success: true,
                    opcoes,
                    msg: alvo ? 'Opções enviadas. Voltou para "esperando o cliente".'
                              : 'Voltou para "esperando o cliente". Sem e-mail no cadastro — avise pelo WhatsApp.'
                });

            } catch (err) {
                console.error('Erro ao sugerir horários:', err.message);
                responder(400, { success: false, error: 'Erro interno' });
            }
        });
        return;
    }

    // ============ PAINEL: POST /admin/agendar ============
    // Marca o horário pelo painel, sem esperar o cliente entrar no site.
    // É o que faz a esteira andar: liberada a OAB, você escolhe a hora e o
    // item sai da triagem e vira chamado.
    //
    // Usa a mesma conferência de vaga da tela pública — inclusive a segunda,
    // na hora de gravar. Você e um cliente podem estar escolhendo o mesmo
    // horário no mesmo instante.
    if (method === 'POST' && url === '/admin/agendar') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const responder = (status, payload) => {
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(payload));
            };

            if (!sessaoAdmin(req)) {
                responder(401, { success: false, error: 'Sessão expirada' });
                return;
            }

            try {
                const { verificacao_id, inicio } = JSON.parse(body || '{}');
                const db = loadJsonDb();
                const v = (db.verificacoes_oab || []).find(x => x.id === verificacao_id);

                if (!v) {
                    responder(404, { success: false, error: 'Verificação não encontrada' });
                    return;
                }
                if (v.status !== 'confere') {
                    responder(400, { success: false, error: 'Confira a inscrição antes de marcar.' });
                    return;
                }
                if ((db.agendamentos || []).some(a => a.verificacao_id === v.id)) {
                    responder(400, { success: false, error: 'Esta inscrição já tem atendimento marcado.' });
                    return;
                }

                // painel: true — a antecedência mínima existe para o cliente
                // não marcar em cima da hora, não para me impedir de encaixar
                // alguém daqui a uma hora.
                const vaga = horarioValido(db, inicio, { painel: true });
                if (!vaga.ok) {
                    responder(200, { success: false, error: vaga.erro, recarregar_agenda: true });
                    return;
                }

                const rotulo = `${v.inscricao}/${v.uf}`;
                const soDigitos = s => String(s || '').replace(/\D/g, '');
                const dono = (db.usuarios || []).find(u =>
                    (v.email && String(u.email || '').toLowerCase() === String(v.email).toLowerCase()) ||
                    (v.contato && soDigitos(u.telefone) === soDigitos(v.contato))) || null;
                const tipo = dono && assinaturaAtiva(db, dono.id) ? 'premium' : 'free';

                // Marcar NÃO abre chamado. O chamado nasce quando você decide,
                // na triagem, que aquele atendimento está pronto para entrar na
                // fila de trabalho — depois de conferir horário e prioridade, e
                // com a chance de remarcar antes. chamado_id fica null até lá.
                const agora = new Date().toISOString();
                const fim = new Date(vaga.quando.getTime() + agendaConfig(db).duracaoMin * 60000);
                const agendamentoId = proximoId(db.agendamentos);
                db.agendamentos.push({
                    id: agendamentoId,
                    chamado_id: null,
                    usuario_id: dono ? dono.id : null,
                    oab: rotulo,
                    nome: v.nome_declarado || '',
                    inicio: vaga.quando.toISOString(),
                    fim: fim.toISOString(),
                    status: 'marcado',
                    verificacao_id: v.id,
                    preferencia_turno: turnoDaHora(horaBR(vaga.quando)),
                    // marcado por mim, não por ele: fica pendente de confirmação
                    // até responder, e é isso que acende o alerta de "é daqui a
                    // duas horas e ninguém confirmou"
                    confirmado_pelo_cliente: false,
                    atualizado_em: agora,
                    criado_em: agora
                });

                auditar(db, {
                    acao: 'agendado_pelo_painel',
                    alvo: `OAB ${rotulo}`,
                    detalhe: `Agendamento #${agendamentoId} para ${vaga.quando.toISOString()} (${tipo})`,
                    ip: ipDoPedido(req)
                });
                saveJsonDb(db);

                console.log(`📅 Marcado pelo painel: ${rotulo} → ${vaga.quando.toISOString()}`);

                // Avisa quem foi marcado: ele não escolheu, então precisa saber.
                if (v.email) {
                    const quando = rotularQuando(vaga.quando);
                    enviarEmailBrevo(
                        v.email,
                        'Seu atendimento foi marcado — AdvogaCert',
                        `<p>Olá, ${escaparHtml(v.nome_declarado)}.</p>
                         <p>Seu atendimento ficou marcado para <strong>${escaparHtml(quando)}</strong>.</p>
                         <p>Se o horário não servir, responda este e-mail que a gente remarca.</p>`
                    ).catch(e => console.error('Aviso de agendamento não saiu:', e.message));
                }

                responder(200, {
                    success: true,
                    msg: 'Horário marcado. Revise na triagem e passe para chamado quando quiser.',
                    agendamento_id: agendamentoId
                });

            } catch (err) {
                console.error('Erro ao marcar pelo painel:', err.message);
                responder(400, { success: false, error: 'Erro interno' });
            }
        });
        return;
    }

    // ============ PAINEL: POST /admin/remarcar ============
    // Força maior: o horário combinado não serve mais. Troca a hora sem
    // desfazer a verificação nem perder o lugar na triagem.
    if (method === 'POST' && url === '/admin/remarcar') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const responder = (status, payload) => {
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(payload));
            };

            if (!sessaoAdmin(req)) {
                responder(401, { success: false, error: 'Sessão expirada' });
                return;
            }

            try {
                const {
                    agendamento_id, inicio, atualizado_em,
                    motivo, aviso, avisar
                } = JSON.parse(body || '{}');
                const db = loadJsonDb();
                const a = (db.agendamentos || []).find(x => x.id === agendamento_id);

                if (!a) {
                    responder(404, { success: false, error: 'Agendamento não encontrado' });
                    return;
                }
                if (a.chamado_id) {
                    responder(400, {
                        success: false,
                        error: 'Já virou chamado. Remarque pela fila de chamados.'
                    });
                    return;
                }

                const versao = conferirVersao(a, atualizado_em);
                if (!versao.ok) { responder(200, versao.resposta); return; }

                // ignorarId tira o próprio agendamento da contagem de lotação:
                // senão, remarcar para o mesmo bloco seria recusado por
                // conflito com ele mesmo.
                const vaga = horarioValido(db, inicio, { painel: true, ignorarId: a.id });
                if (!vaga.ok) {
                    responder(200, { success: false, error: vaga.erro, recarregar_agenda: true });
                    return;
                }

                const antigo = a.inicio;
                a.remarcado_de = antigo;
                a.remarcado_por = 'painel';
                a.motivo_remarcacao = motivo ? String(motivo).slice(0, 300) : null;
                a.inicio = vaga.quando.toISOString();
                a.fim = new Date(vaga.quando.getTime() + agendaConfig(db).duracaoMin * 60000).toISOString();
                a.status = 'marcado';
                // mudou a hora debaixo dele: a confirmação anterior não vale
                // mais para o horário novo
                a.confirmado_pelo_cliente = false;
                a.atualizado_em = new Date().toISOString();

                auditar(db, {
                    acao: 'remarcado',
                    alvo: `OAB ${a.oab}`,
                    detalhe: `${antigo} -> ${a.inicio}${motivo ? ' (' + motivo + ')' : ''}`,
                    ip: ipDoPedido(req)
                });
                saveJsonDb(db);

                // Nunca envio cego: o texto vem do painel, já revisto por você.
                // Sem `avisar`, remarca e não manda nada — é o caso de quem
                // combinou por telefone e só está registrando.
                const v = (db.verificacoes_oab || []).find(x => x.id === a.verificacao_id);
                let enviado = false;
                if (avisar !== false && v && v.email) {
                    const quando = rotularQuando(vaga.quando);
                    const corpo = aviso
                        ? `<p>${escaparHtml(aviso).replace(/\n/g, '<br>')}</p>`
                        : `<p>Olá, ${escaparHtml(v.nome_declarado)}.</p>
                           <p>Precisamos remarcar seu atendimento. O novo horário é
                           <strong>${escaparHtml(quando)}</strong>.</p>
                           <p>Se não puder, responda este e-mail que a gente ajusta.</p>`;
                    enviado = true;
                    enviarEmailBrevo(v.email, 'Seu atendimento foi remarcado — AdvogaCert', corpo)
                        .catch(e => console.error('Aviso de remarcação não saiu:', e.message));
                }

                responder(200, {
                    success: true,
                    inicio: a.inicio,
                    rotulo: rotularQuando(a.inicio, { curto: true }),
                    atualizado_em: a.atualizado_em,
                    msg: enviado ? 'Remarcado e cliente avisado.'
                                 : 'Remarcado. Nenhum aviso foi enviado.'
                });

            } catch (err) {
                console.error('Erro ao remarcar:', err.message);
                responder(400, { success: false, error: 'Erro interno' });
            }
        });
        return;
    }

    // ============ PAINEL: POST /admin/confirmar ============
    // O fim da triagem: confirma o horário E abre o chamado, num passo só.
    //
    // A esteira é: confere a OAB → lista de assinantes diz se há pendência →
    // tria o horário → CONFIRMA, e o atendimento entra na fila de chamados
    // com o prazo correndo.
    //
    // Já houve uma parada intermediária em "Cadastros e agenda" entre a
    // triagem e o chamado. Saiu: aquela aba virou a lista de assinantes, que
    // é consulta — a conferência de pendência acontece ANTES de confirmar,
    // não num terceiro clique depois.
    if (method === 'POST' && url === '/admin/confirmar') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const responder = (status, payload) => {
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(payload));
            };

            if (!sessaoAdmin(req)) {
                responder(401, { success: false, error: 'Sessão expirada' });
                return;
            }

            try {
                const { agendamento_id, voltar, atualizado_em } = JSON.parse(body || '{}');
                const db = loadJsonDb();
                const a = (db.agendamentos || []).find(x => x.id === agendamento_id);

                if (!a) {
                    responder(404, { success: false, error: 'Agendamento não encontrado' });
                    return;
                }
                if (a.chamado_id) {
                    responder(400, { success: false, error: 'Já virou chamado.' });
                    return;
                }

                // Chamada antiga sem versão continua valendo: quem não
                // afirma ter lido uma versão não é cobrado por isso.
                if (atualizado_em) {
                    const versao = conferirVersao(a, atualizado_em);
                    if (!versao.ok) { responder(200, versao.resposta); return; }
                }

                const agora = new Date().toISOString();

                if (voltar) {
                    a.status = 'marcado';
                    a.atualizado_em = agora;
                    auditar(db, {
                        acao: 'devolvido_para_triagem',
                        alvo: `OAB ${a.oab}`,
                        detalhe: `Agendamento #${a.id} em ${a.inicio}`,
                        ip: ipDoPedido(req)
                    });
                    saveJsonDb(db);
                    responder(200, { success: true, msg: 'Devolvido para a triagem.' });
                    return;
                }

                // Confirmar abre o chamado aqui mesmo. Se fossem duas rotas
                // (confirmar e depois promover), existiria um estado
                // intermediário em que o atendimento não aparece em lugar
                // nenhum do painel — e foi exatamente o que acontecia.
                const v = (db.verificacoes_oab || []).find(x => x.id === a.verificacao_id);
                const dono = a.usuario_id
                    ? (db.usuarios || []).find(u => u.id === a.usuario_id)
                    : null;
                const tipo = dono && assinaturaAtiva(db, dono.id) ? 'premium' : 'free';

                const chamadoId = proximoId(db.chamados);
                db.chamados.push({
                    id: chamadoId,
                    usuario_id: a.usuario_id || null,
                    oab: a.oab,
                    uf: v ? v.uf : null,
                    tipo,
                    descricao: 'Atendimento de ' + rotularQuando(a.inicio, { curto: true }),
                    status: 'aberto',
                    responsavel: null,
                    primeiro_retorno_em: null,
                    fechado_em: null,
                    reaberturas: 0,
                    atualizado_em: agora,
                    verificacao_id: a.verificacao_id || null,
                    criado_em: agora
                });

                a.status = 'confirmado';
                a.chamado_id = chamadoId;
                a.atualizado_em = agora;

                auditar(db, {
                    acao: 'confirmado_virou_chamado',
                    alvo: `OAB ${a.oab}`,
                    detalhe: `Agendamento #${a.id} -> Chamado #${chamadoId} (${tipo})`,
                    ip: ipDoPedido(req)
                });
                saveJsonDb(db);

                console.log(`➡️  Triagem: ${a.oab} confirmado, chamado #${chamadoId} (${tipo})`);
                responder(200, {
                    success: true,
                    chamado_id: chamadoId,
                    msg: 'Confirmado. Está na fila de chamados.'
                });

            } catch (err) {
                console.error('Erro ao confirmar:', err.message);
                responder(400, { success: false, error: 'Erro interno' });
            }
        });
        return;
    }

    // A rota /admin/promover morava aqui. Era o segundo passo de um fluxo em
    // dois cliques (confirmar na triagem, abrir chamado em Cadastros e
    // agenda) que deixou de existir: /admin/confirmar faz os dois de uma
    // vez, e a aba do meio virou a lista de assinantes.

    // ============ PAINEL: GET /admin/linha-tempo ============
    // A história daquela inscrição, em ordem. Montada na hora a partir das
    // tabelas que já existem — não há tabela de eventos, e criar uma exigiria
    // gravar duas vezes a mesma informação.
    if (method === 'GET' && url.split('?')[0] === '/admin/linha-tempo') {
        if (!sessaoAdmin(req)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Sessão expirada' }));
            return;
        }

        const q = new URL(req.url, `http://${req.headers.host}`).searchParams;
        const rotulo = (q.get('inscricao') || '').toUpperCase();
        const db = loadJsonDb();
        const eventos = [];

        (db.verificacoes_oab || [])
            .filter(v => `${v.inscricao}/${v.uf}` === rotulo)
            .forEach(v => {
                eventos.push({ em: v.criado_em, tipo: 'pedido', texto: 'Pediu o atendimento gratuito' });
                if (v.decidido_em) {
                    const nomes = {
                        confere: 'Inscrição conferida e liberada',
                        nao_confere: 'Inscrição não confere',
                        nao_encontrado: 'Inscrição não encontrada no CNA'
                    };
                    eventos.push({
                        em: v.decidido_em,
                        tipo: v.status === 'confere' ? 'liberado' : 'recusado',
                        texto: nomes[v.status] || v.status,
                        detalhe: v.observacao || ''
                    });
                }
            });

        (db.agendamentos || [])
            .filter(a => a.oab === rotulo)
            .forEach(a => {
                eventos.push({ em: a.criado_em, tipo: 'agendou', texto: 'Escolheu o horário' });
                eventos.push({ em: a.inicio, tipo: 'atendimento', texto: 'Atendimento marcado' });
            });

        (db.chamados || [])
            .filter(c => c.oab === rotulo)
            .forEach(c => {
                eventos.push({
                    em: c.criado_em, tipo: 'chamado',
                    texto: 'Chamado aberto (' + (c.tipo === 'premium' ? 'Premium' : 'grátis') + ')'
                });
                if (c.primeiro_retorno_em) {
                    eventos.push({ em: c.primeiro_retorno_em, tipo: 'retorno', texto: 'Primeiro retorno' });
                }
                if (c.fechado_em) {
                    eventos.push({ em: c.fechado_em, tipo: 'fechado', texto: 'Chamado fechado' });
                }
            });

        const usuarios = (db.usuarios || []).filter(u => u.oab === rotulo);
        usuarios.forEach(u => {
            if (u.created_at) eventos.push({ em: u.created_at, tipo: 'cadastro', texto: 'Criou conta no site' });
        });
        (db.assinaturas || [])
            .filter(a => usuarios.some(u => u.id === a.usuario_id))
            .forEach(a => {
                eventos.push({ em: a.criado_em, tipo: 'pagamento', texto: 'Assinou o Plano Premium' });
                if (a.cancelada_em) eventos.push({ em: a.cancelada_em, tipo: 'recusado', texto: 'Cancelou o plano' });
            });

        eventos.sort((a, b) => new Date(b.em) - new Date(a.em));   // mais novo em cima

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, inscricao: rotulo, eventos }));
        return;
    }

    // ============ PAINEL: GET /admin/chamados ============
    // Filtros, busca, ordenação e paginação acontecem aqui, e não no
    // navegador: com a fila crescendo, mandar tudo para o cliente filtrar
    // seria trafegar a base inteira a cada 30 segundos do polling.
    if (method === 'GET' && url.split('?')[0] === '/admin/chamados') {
        if (!sessaoAdmin(req)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Sessão expirada' }));
            return;
        }

        const q = new URL(req.url, `http://${req.headers.host}`).searchParams;
        const fStatus = q.get('status') || 'abertos';
        const fTipo = q.get('tipo') || 'todos';
        const dias = Number(q.get('dias')) || 0;
        const busca = (q.get('q') || '').trim().toLowerCase();
        const pagina = Math.max(1, Number(q.get('pagina')) || 1);
        const porPagina = Math.min(100, Number(q.get('por_pagina')) || 25);

        const db = loadJsonDb();
        const soDigitos = s => String(s || '').replace(/\D/g, '');
        const digitosBusca = soDigitos(busca);

        let lista = (db.chamados || []).map(c => {
            const dono = db.usuarios.find(u => u.id === c.usuario_id);
            const agend = (db.agendamentos || []).find(a => a.chamado_id === c.id);
            return {
                ...c,
                nome: (agend && agend.nome) || (dono && (dono.nome || dono.email)) || '',
                contato: (dono && (dono.telefone || dono.email)) || '',
                idade_horas: Math.floor((Date.now() - new Date(c.criado_em).getTime()) / 3600000)
            };
        });

        if (fStatus === 'abertos') {
            lista = lista.filter(c => c.status !== 'fechado');
        } else if (fStatus !== 'todos') {
            lista = lista.filter(c => c.status === fStatus);
        }
        if (fTipo !== 'todos') lista = lista.filter(c => c.tipo === fTipo);
        if (dias > 0) {
            const desde = Date.now() - dias * 86400000;
            lista = lista.filter(c => new Date(c.criado_em).getTime() >= desde);
        }
        if (busca) {
            lista = lista.filter(c =>
                (c.oab || '').toLowerCase().includes(busca) ||
                (c.nome || '').toLowerCase().includes(busca) ||
                (c.contato || '').toLowerCase().includes(busca) ||
                (digitosBusca.length >= 4 && soDigitos(c.contato).includes(digitosBusca)) ||
                (digitosBusca.length >= 3 && soDigitos(c.oab).includes(digitosBusca))
            );
        }

        // Premium sempre acima do grátis; dentro de cada grupo, o mais velho
        // primeiro — quem espera há mais tempo aparece antes.
        lista.sort((a, b) => {
            if (a.tipo !== b.tipo) return a.tipo === 'premium' ? -1 : 1;
            return new Date(a.criado_em) - new Date(b.criado_em);
        });

        const inicio = (pagina - 1) * porPagina;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            itens: lista.slice(inicio, inicio + porPagina),
            total: lista.length,
            pagina,
            por_pagina: porPagina,
            // limite acima do qual o chamado fica destacado por abandono
            sem_dono_horas: SEM_DONO_HORAS
        }));
        return;
    }

    // ============ PAINEL: POST /admin/chamado/status ============
    if (method === 'POST' && url === '/admin/chamado/status') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const responder = (status, payload) => {
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(payload));
            };

            if (!sessaoAdmin(req)) {
                responder(401, { success: false, error: 'Sessão expirada' });
                return;
            }

            try {
                const { id, status } = JSON.parse(body || '{}');
                if (!STATUS_CHAMADO.includes(status)) {
                    responder(400, { success: false, error: 'Status inválido' });
                    return;
                }

                const db = loadJsonDb();
                const c = (db.chamados || []).find(x => x.id === id);
                if (!c) {
                    responder(404, { success: false, error: 'Chamado não encontrado' });
                    return;
                }

                const antes = c.status;
                const agora = new Date().toISOString();

                // FRT: a primeira vez que o chamado sai de "aberto" é o
                // primeiro retorno. Só marca uma vez — reabrir depois não
                // reescreve o tempo de resposta original.
                if (antes === 'aberto' && status !== 'aberto' && !c.primeiro_retorno_em) {
                    c.primeiro_retorno_em = agora;
                }
                if (status === 'fechado') {
                    c.fechado_em = agora;
                } else if (antes === 'fechado') {
                    // saiu de fechado: é reabertura
                    c.reaberturas = (c.reaberturas || 0) + 1;
                    c.fechado_em = null;
                }

                c.status = status;
                c.atualizado_em = agora;

                auditar(db, {
                    acao: 'chamado_status',
                    alvo: `Chamado #${c.id} (${c.oab || 'sem OAB'})`,
                    detalhe: `${antes} -> ${status}`,
                    ip: ipDoPedido(req)
                });
                saveJsonDb(db);

                responder(200, { success: true, msg: 'Status atualizado', anterior: antes });

            } catch (err) {
                console.error('Erro ao mudar status:', err.message);
                responder(400, { success: false, error: 'Erro interno' });
            }
        });
        return;
    }

    // ============ PAINEL: POST /admin/chamado/apagar ============
    // Só apaga o que está fechado. Chamado aberto é trabalho em andamento, e
    // apagar por engano custaria o atendimento de alguém.
    //
    // Apagar fechado tem preço: MTTR, "fechados no período" e taxa de
    // reabertura saem justamente dali. O painel avisa antes; a decisão é sua.
    if (method === 'POST' && url === '/admin/chamado/apagar') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            const responder = (status, payload) => {
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(payload));
            };

            if (!sessaoAdmin(req)) {
                responder(401, { success: false, error: 'Sessão expirada' });
                return;
            }

            try {
                const entrada = JSON.parse(body || '{}');
                const db = loadJsonDb();

                // ou uma lista de ids, ou todos os fechados de uma vez
                const alvos = entrada.todos_fechados
                    ? (db.chamados || []).filter(c => c.status === 'fechado')
                    : (db.chamados || []).filter(c => (entrada.ids || []).includes(c.id));

                if (!alvos.length) {
                    responder(200, { success: false, error: 'Nenhum chamado fechado para apagar.' });
                    return;
                }

                const abertos = alvos.filter(c => c.status !== 'fechado');
                if (abertos.length) {
                    responder(400, {
                        success: false,
                        error: 'Só é possível apagar chamado fechado. Feche antes.'
                    });
                    return;
                }

                const ids = alvos.map(c => c.id);

                // o agendamento aponta para o chamado: soltar a referência
                // antes evita deixar um ponteiro para o que não existe mais
                (db.agendamentos || []).forEach(a => {
                    if (ids.includes(a.chamado_id)) a.chamado_id = null;
                });

                // banco primeiro: se recusar, a memória não muda e nada se perde
                await apagarNoSupabase('chamados', ids);

                db.chamados = (db.chamados || []).filter(c => !ids.includes(c.id));

                auditar(db, {
                    acao: 'chamados_apagados',
                    alvo: `${ids.length} chamado(s)`,
                    detalhe: alvos.map(c => `#${c.id} ${c.oab || 'sem OAB'}`).join(', ').slice(0, 500),
                    ip: ipDoPedido(req)
                });
                saveJsonDb(db);

                console.log(`🗑️  Apagados ${ids.length} chamado(s) fechado(s): ${ids.join(', ')}`);
                responder(200, {
                    success: true,
                    msg: ids.length === 1 ? 'Chamado apagado.' : ids.length + ' chamados apagados.',
                    apagados: ids.length
                });

            } catch (err) {
                console.error('Erro ao apagar chamado:', err.message);
                responder(400, { success: false, error: 'Não foi possível apagar. Nada foi alterado.' });
            }
        });
        return;
    }

    // ============ PAINEL: GET /admin/indicadores ============
    // Tudo aqui é janela, não tempo real — a interface deixa isso explícito.
    if (method === 'GET' && url.split('?')[0] === '/admin/indicadores') {
        if (!sessaoAdmin(req)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Sessão expirada' }));
            return;
        }

        const q = new URL(req.url, `http://${req.headers.host}`).searchParams;
        const dias = ({ hoje: 1, '7d': 7, '30d': 30 })[q.get('janela')] || 7;
        const desde = Date.now() - dias * 86400000;

        const db = loadJsonDb();
        const chamados = db.chamados || [];
        const abertos = chamados.filter(c => c.status !== 'fechado');

        const idadeDias = c => (Date.now() - new Date(c.criado_em).getTime()) / 86400000;
        const noPeriodo = chamados.filter(c => new Date(c.criado_em).getTime() >= desde);
        const fechadosNoPeriodo = chamados.filter(c =>
            c.fechado_em && new Date(c.fechado_em).getTime() >= desde);

        // Média em horas, ignorando quem ainda não tem o marco registrado.
        const media = (lista, de, ate) => {
            const vals = lista
                .filter(c => c[de] && c[ate])
                .map(c => (new Date(c[ate]) - new Date(c[de])) / 3600000);
            if (!vals.length) return null;
            return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length * 10) / 10;
        };

        const verificacoes = db.verificacoes_oab || [];
        const pendentes = verificacoes.filter(v => v.status === 'pendente');
        const decididas = verificacoes.filter(v => v.decidido_em);
        const reprovadas = decididas.filter(v => v.status !== 'confere');

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            janela_dias: dias,
            backlog: {
                ate_2d: abertos.filter(c => idadeDias(c) <= 2).length,
                de_3_a_7d: abertos.filter(c => idadeDias(c) > 2 && idadeDias(c) <= 7).length,
                mais_7d: abertos.filter(c => idadeDias(c) > 7).length
            },
            entrada: noPeriodo.length,
            fechamento: fechadosNoPeriodo.length,
            frt_horas: media(noPeriodo, 'criado_em', 'primeiro_retorno_em'),
            mttr_horas: media(fechadosNoPeriodo, 'criado_em', 'fechado_em'),
            reabertura_pct: chamados.length
                ? Math.round(chamados.filter(c => (c.reaberturas || 0) > 0).length / chamados.length * 1000) / 10
                : 0,
            verificacao: {
                pendentes: pendentes.length,
                espera_media_horas: pendentes.length
                    ? Math.round(pendentes.reduce((s, v) =>
                        s + (Date.now() - new Date(v.criado_em).getTime()) / 3600000, 0) / pendentes.length * 10) / 10
                    : 0,
                reprovacao_pct: decididas.length
                    ? Math.round(reprovadas.length / decididas.length * 1000) / 10
                    : 0
            }
        }));
        return;
    }

    // ============ PAINEL: POST /admin/assinatura ============
    // Liberar ou cancelar plano na mão — serve para o pagamento que chegou
    // por fora (Pix direto) ou para o webhook que não identificou o usuário.
    if (method === 'POST' && url === '/admin/assinatura') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const responder = (status, payload) => {
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(payload));
            };

            if (!sessaoAdmin(req)) {
                responder(401, { success: false, error: 'Sessão expirada' });
                return;
            }

            try {
                const { usuario_id, acao, meses } = JSON.parse(body || '{}');
                const db = loadJsonDb();
                const user = db.usuarios.find(u => u.id === usuario_id);

                if (!user) {
                    responder(404, { success: false, error: 'Usuário não encontrado' });
                    return;
                }

                if (acao === 'renovacao') {
                    // liga ou desliga a renovação da assinatura mais recente.
                    // Enquanto o gateway não está ligado, quem sabe da
                    // recorrência é você: este campo é o registro disso.
                    const alvo = assinaturaMaisRecente(db, user.id);
                    if (!alvo) {
                        responder(404, { success: false, error: 'Esta pessoa não tem assinatura' });
                        return;
                    }
                    alvo.renovacao_automatica = alvo.renovacao_automatica === false;
                    saveJsonDb(db);
                    responder(200, {
                        success: true,
                        msg: alvo.renovacao_automatica ? 'Renovação automática ligada' : 'Renovação automática desligada'
                    });
                    return;
                }

                if (acao === 'cancelar') {
                    db.assinaturas
                        .filter(a => a.usuario_id === user.id && a.status === 'ativa')
                        .forEach(a => { a.status = 'cancelada'; a.cancelada_em = new Date().toISOString(); });
                    saveJsonDb(db);
                    responder(200, { success: true, msg: 'Plano cancelado' });
                    return;
                }

                const validaAte = new Date();
                validaAte.setMonth(validaAte.getMonth() + (Number(meses) || 1));

                db.assinaturas.push({
                    id: proximoId(db.assinaturas),
                    usuario_id: user.id,
                    plano: 'Plano Premium',
                    valor: 90,
                    status: 'ativa',
                    gateway: 'manual',
                    gateway_ref: null,
                    inicio: new Date().toISOString(),
                    valida_ate: validaAte.toISOString(),
                    // liberado na mão não renova sozinho: vence e vira
                    // inadimplente no painel, para você reavaliar
                    renovacao_automatica: false,
                    criado_em: new Date().toISOString()
                });
                saveJsonDb(db);
                responder(200, { success: true, msg: 'Plano liberado' });

            } catch (err) {
                responder(400, { success: false, error: 'Erro interno' });
            }
        });
        return;
    }
    // ================== API: POST /login.php ==================
    if (method === 'POST' && url === '/login.php') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const input = JSON.parse(body);
                const { action, email, senha } = input;

                if (!action) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Ação inválida' }));
                    return;
                }

                const db = loadJsonDb();

                // ---- REGISTER ----
                if (action === 'register') {
                    if (!email || !senha || senha.length < 6) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: 'Dados inválidos' }));
                        return;
                    }

                    // O WhatsApp e a chave que liga o pagamento ao atendimento:
                    // e por ele que a pessoa chama, entao ele precisa estar
                    // guardado sempre no mesmo formato (E.164).
                    const whatsapp = normalizarTelefone(input.whatsapp);
                    if (!whatsapp) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: 'Informe um WhatsApp válido com DDD' }));
                        return;
                    }

                    // A OAB é a chave da contabilidade: é por ela que o chamado
                    // grátis é contado, não pelo e-mail.
                    const oab = normalizarOab(input.oab);
                    if (!oab) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: 'Informe sua inscrição na OAB (ex: 123456/GO)' }));
                        return;
                    }

                    const exists = db.usuarios.find(u => u.email === email);
                    if (exists) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: 'Este e-mail já está cadastrado' }));
                        return;
                    }

                    // Numero repetido quebraria a busca por WhatsApp la na frente
                    const telefoneEmUso = db.usuarios.find(u => u.telefone === whatsapp);
                    if (telefoneEmUso) {
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: 'Este WhatsApp já está cadastrado em outra conta' }));
                        return;
                    }

                    const hash = crypto.createHash('sha256').update(senha).digest('hex');

                    const novo = {
                        id: proximoId(db.usuarios),
                        email,
                        telefone: whatsapp,
                        oab,
                        nome: String(input.nome || '').trim().slice(0, 120),
                        senha: hash,
                        created_at: new Date().toISOString()
                    };
                    db.usuarios.push(novo);
                    saveJsonDb(db);

                    // avisa o front se a OAB já gastou o chamado grátis em outro cadastro
                    const freeDisponivel = !freeUsadoPelaOab(db, oab);

                    // ================== ENVIO REAL DE E-MAIL DE BOAS-VINDAS ==================
                    const templatePath = path.join(__dirname, 'email-boasvindas.html');
                    if (fs.existsSync(templatePath)) {
                        let htmlTemplate = fs.readFileSync(templatePath, 'utf-8');
                        htmlTemplate = htmlTemplate.replace('{{EMAIL}}', email);
                        
                        console.log(`📧 Enviando e-mail REAL de boas-vindas para ${email}...`);
                        await enviarEmailBrevo(
                            email,
                            '🎉 Bem-vindo ao AgenteJ.us - Conta criada com sucesso!',
                            htmlTemplate,
                            `Olá ${email},\n\nSua conta no AgenteJ.us foi criada com sucesso!\n\nAcesse: https://www.agentej.us\n\nBem-vindo! 🚀`
                        );
                    }

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        msg: 'Conta criada com sucesso!',
                        oab,
                        free_disponivel: freeDisponivel
                    }));
                    return;
                }

                // ---- LOGIN ----
                if (action === 'login') {
                    if (!email || !senha || senha.length < 6) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: 'Dados inválidos' }));
                        return;
                    }

                    const hash = crypto.createHash('sha256').update(senha).digest('hex');
                    const user = db.usuarios.find(u => u.email === email && u.senha === hash);

                    if (user) {
                        registrarLogin(db, user.id, 'senha', req);
                        saveJsonDb(db);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, user: { id: user.id, email: user.email } }));
                        return;
                    }

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Credenciais inválidas' }));
                    return;
                }

                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Ação inválida' }));

            } catch (err) {
                console.error('Erro:', err);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Erro interno' }));
            }
        });
        return;
    }

    // ================== API: POST /gpt.php (DeepSeek Chat) ==================
    if (method === 'POST' && url === '/gpt.php') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const input = JSON.parse(body);

                let messages = input.messages || [];
                if (!messages.length && input.prompt) {
                    messages = [{ role: 'user', content: String(input.prompt).trim() }];
                }

                if (!messages.length) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ reply: 'Digite uma mensagem.' }));
                    return;
                }

                const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || SECRETS.deepseek?.api_key || '';

                if (!DEEPSEEK_KEY) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ reply: 'Chave da API não configurada no servidor.' }));
                    return;
                }

                // No painel quem pergunta é o dono, não o cliente: o assunto é
                // operar o sistema, não vender plano. Por isso o prompt é outro.
                const promptAdmin = `Você é o assistente interno do painel administrativo do AdvogaCert.
Quem fala com você é o Jonas, dono do sistema — não é cliente. Trate como colega
de trabalho: direto, sem saudação de vendedor, sem oferecer plano.

============================================================
COMO O SISTEMA É MONTADO
============================================================
São três peças separadas:
1. www.agentej.us — GitHub Pages. Só entrega arquivos. Não executa nada.
2. advogacert.onrender.com — o servidor (server.js), no Render. Tem as rotas.
3. Supabase — o banco. É onde o dado mora de verdade.

O navegador do cliente nunca fala com o Supabase direto: sempre passa pelo Render.
O painel não salva nada — ele pede /admin/dados ao servidor, que lê do Supabase.

============================================================
O QUE CADA TABELA GUARDA
============================================================
- usuarios: nome, e-mail, celular, OAB, como entrou, último login.
- assinaturas: plano, valor, status, valida_ate, renovacao_automatica.
- chamados: tipo (free|premium), OAB, descrição, status, criado_em.
- agendamentos: hora marcada (inicio, fim, status, remarcado_de,
  confirmado_pelo_cliente, preferencia_turno, atualizado_em).
- agenda_config: horário de trabalho por dia da semana (dia_semana,
  hora_inicio, hora_fim, capacidade, ativo).
- agenda_ajustes: linha única com duracao_min, folga_min, antecedencia_min
  e janela_dias — vale para a agenda inteira.
- agenda_bloqueios: feriado, viagem, "hoje não" (inicio, fim, motivo).
- logins: histórico de entradas.

============================================================
AS ABAS DO PAINEL, NA ORDEM DA ESTEIRA
============================================================
1. Verificação de OAB — confere a inscrição no CNA e libera.
2. Lista de assinantes — só quem tem plano (ativo ou vencido). É consulta:
   serve para ver pendência ANTES de confirmar um atendimento.
3. Triagem — a central de horários: grade da semana, alertas, remarcação e
   a configuração da agenda. Confirmar aqui já abre o chamado.
4. Chamados — o trabalho com prazo correndo.
5. Indicadores e 6. Servidor e banco.

O selo de cada aba conta só o que está parado nela, e vem de
/admin/contadores. Âmbar = pendência normal. Vermelho = esperando há mais
de 24h ou conflito de horário. Sem selo = nada a fazer.

============================================================
COMO LER O PAINEL
============================================================
- "Inadimplente" = valida_ate já passou e ninguém cancelou. É de quem se cobra.
- "Cancelada" = pediu para sair. "Sem plano" = nunca assinou. Estes dois
  NÃO aparecem na Lista de assinantes — ela é só de quem paga.
- "Renovação" alterna entre Automática e Manual clicando no botão.
- Assinatura liberada na mão nasce Manual de propósito: vence e vira
  inadimplente, para você reavaliar em vez de renovar sozinha.
- O chamado grátis é contado pela OAB, não pelo e-mail: trocar de e-mail
  não devolve o grátis.
- A agenda NÃO está mais fixa no código: sai de agenda_config, e é a mesma
  fonte para a grade do painel e para a lista que o cliente vê no site.
  Mudar ali muda os dois. Premium não agenda — entra na fila.
- Na grade: cheio é consequência (alguém marcou), bloqueado é decisão sua.
  São pintados diferente de propósito.
- Remarcar sempre mostra o aviso ao cliente antes de mandar, e tem 10
  segundos de desfazer. Nada sai sem você ler.

============================================================
PROBLEMAS COMUNS E COMO RESOLVER
============================================================
- Painel não abre / demora muito: o Render no plano free hiberna após um
  tempo parado. O primeiro acesso leva de 30 a 60 segundos. É normal.
- Painel abre mas não carrega dados: sessão caiu. Entre de novo com a senha
  e o código do autenticador. A sessão dura 8 horas.
- 404 no painel pelo www.agentej.us: é o endereço errado. O painel só existe
  em https://advogacert.onrender.com/admin.html — o GitHub Pages não executa
  servidor nenhum.
- Servidor fora do ar depois de um deploy: quase sempre é tabela que falta.
  O server.js encerra sozinho (process.exit) se uma tabela do COLECOES não
  existir no Supabase. A ordem correta é criar a tabela primeiro, publicar
  depois. Veja o log do Render: ele diz qual tabela não encontrou.
- Supabase pausado: o plano free pausa o projeto após ~7 dias sem uso. Entre
  no painel do Supabase e reative.
- Dados sumiram depois do deploy: não deveria acontecer mais. Se acontecer,
  é sinal de que o servidor voltou a usar o usuarios.json em vez do Supabase
  — confira SUPABASE_URL e SUPABASE_SERVICE_KEY no Render.
- Login com Google dá erro 400 redirect_uri_mismatch: o endereço
  https://advogacert.onrender.com/auth/google/callback precisa estar
  cadastrado no Google Cloud Console, em Authorized redirect URIs.
- Código por SMS não chega: o canal está desligado. Falta OTP_CANAL_SMS=brevo
  no Render e créditos de SMS na Brevo. Por e-mail funciona.
- Pagamento não entra: o checkout ainda é um placeholder, não cobra nada.
  Falta ligar o Mercado Pago (MP_LINK e MP_ACCESS_TOKEN).

============================================================
REGRAS
============================================================
- Responda curto e prático. Se a pergunta for sobre um erro, diga a causa
  provável e o passo para resolver.
- Nunca invente nome de tabela, coluna ou rota. Se não souber, diga que não
  sabe e sugira olhar o log do Render.
- Nunca peça nem repita senha, chave de API ou token.
- Não use markdown: o chat não renderiza e os asteriscos aparecem na tela.`;

                const promptSite = `Você é o PjeGPT, atendente oficial de suporte técnico do AdvogaCert (https://www.agentej.us),
especializado em Certificado Digital (A1 e A3) e acesso a tribunais eletrônicos
(PJe, e-SAJ, Projudi, Eproc e demais sistemas de processo eletrônico) para advogados e escritórios.
Responda SOMENTE com base na BASE abaixo (não invente). Se a pergunta não estiver coberta,
faça 1 pergunta objetiva para coletar o dado que falta.

============================================================
BASE — o site AdvogaCert, como ele é hoje
============================================================
O site tem 4 páginas que o cliente usa. NÃO existem outras.
Nunca cite mac.html, windows.html nem login-success.html: essas páginas NÃO existem
e mandam o cliente para uma tela de erro.

1) PÁGINA INICIAL — https://www.agentej.us/index.html
   O menu do topo tem apenas "Contato". O resto da navegação é por estas seções:

   - https://www.agentej.us/index.html#plataformas
     "Suporte para Mac" e "Suporte para Windows". São SEÇÕES desta página, não páginas separadas.
   - https://www.agentej.us/index.html#como-funciona
     "Como funciona o suporte remoto" — o passo a passo do atendimento.
   - https://www.agentej.us/index.html#curso
     Anúncio do curso de PJe + IA.
   - https://www.agentej.us/index.html#sobre
     "Desenvolvido por quem vive a rotina jurídica de perto".
   - https://www.agentej.us/index.html#planos
     "Ao assinar, você garante suporte contínuo". Tem exatamente DOIS planos:
       • "1 chamado grátis" — R$0, botão "Quero testar grátis", leva para a página de contato.
       • "Plano Premium" — R$90 por mês, chamados ilimitados e atendimento prioritário,
         botão "Assinar agora", que abre a tela de pagamento ali mesmo.
     O pagamento NÃO exige login nem criar conta: o botão abre o checkout direto.

2) CONTATO — https://www.agentej.us/contato.html
   Telefone, e-mail, horário de atendimento e LinkedIn. É onde se fala com uma pessoa.
   - WhatsApp: https://wa.me/5561986241570
   - E-mail: advogare@agentej.us
   É também onde fica este chat.

3) CURSO — https://www.agentej.us/curso.html
   "Domine o PJe e coloque a IA para trabalhar no seu escritório".
   Tem: o que você vai aprender, para quem é, próxima turma e perguntas frequentes.

4) ENTRAR — https://www.agentej.us/login.html
   Só é necessária para acompanhar chamados, NÃO para pagar. Formas de entrar:
     • "Entrar com Google"
     • e-mail e senha
     • código enviado por e-mail (entrar sem senha)
     • "Criar conta", dentro da própria página

============================================================
COMO RESPONDER — formato obrigatório
============================================================
O chat mostra TEXTO PURO. Nunca use markdown: nada de **negrito**, ## títulos,
listas com - ou *, nem \`código\`. Os asteriscos apareceriam na tela como sujeira.

Para orientar o cliente a fazer algo, use SEMPRE este formato de passos,
com a linha de traços e o link da seção logo abaixo:

Passo 1 _________________________________________
Escolha o plano que atende você: 1 chamado grátis (R$0) ou Plano Premium (R$90/mês).
👉 https://www.agentej.us/index.html#planos

Passo 2 _________________________________________
Clique em "Assinar agora". A tela de pagamento abre ali mesmo,
sem precisar de conta nem senha.

Regras do formato:
- SEMPRE termine cada passo que envolva uma tela com o endereço completo, começando
  em https://www.agentej.us — é ele que vira o link clicável para o cliente.
- Um passo por ação. No máximo 5 passos.
- Escreva o endereço sozinho na linha, depois do 👉, sem pontuação no fim.
- Use emojis com moderação, para dar respiro ao texto. Sugestões:
  👉 link   ✅ concluído   ⚠️ atenção   🔑 certificado   💳 pagamento
  📄 documento   💬 falar com alguém   🖥️ computador   ⏱️ prazo
- Uma linha em branco entre blocos. Nunca escreva um parágrafo longo e corrido.
- Português do Brasil, sempre. Nunca responda em inglês.

============================================================
ESCOPO TÉCNICO
============================================================
- Certificado A1 (arquivo .pfx/.p12): instalação, senha, validade, backup.
- Certificado A3 (token ou cartão): leitora, driver, PIN bloqueado, reconhecimento.
- Erros de acesso a tribunais: certificado não reconhecido, Java desatualizado,
  navegador incompatível, driver de token ausente, extensão do PJe.
- Sempre que o problema exigir alguém olhando a máquina do cliente, encaminhe:
  💬 https://www.agentej.us/contato.html

Regras de conduta:
- Nunca peça a senha do cliente, nem o PIN do token.
- Nunca diga que não pode responder por ser um site específico.
- Se perguntarem como criar conta ou entrar, mande 👉 https://www.agentej.us/login.html

============================================================
ENCERRAMENTO DE CONVERSA
============================================================
- Se o cliente enviar "ok", "tá bom", "certo", "beleza", "valeu", "obrigado(a)",
  "encerrar", "fechar", "tchau", "até mais", "flw", "vlw" ou similares,
  ele está ENCERRANDO a conversa.
- NUNCA, SOB HIPÓTESE ALGUMA, responda com saudação de abertura ("Olá!",
  "Como posso ajudar?", "Sou o suporte técnico...") depois de um encerramento.
- Responda APENAS com uma despedida curta e cordial. Exemplos:
  "Se precisar, estou aqui. Até mais! 👋"
  "Fico à disposição, qualquer dúvida é só chamar. 😊"
- A resposta a um encerramento é EXCLUSIVAMENTE a despedida, sem perguntas.`;

                // O contexto vem do front: 'admin' quando a pergunta sai do
                // painel, 'site' em qualquer outra página.
                const system = input.contexto === 'admin' ? promptAdmin : promptSite;

                const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${DEEPSEEK_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'deepseek-chat',
                        messages: [
                            { role: 'system', content: system },
                            ...messages
                        ],
                        temperature: 0.7
                    })
                });

                const data = await response.json();
                const reply = data?.choices?.[0]?.message?.content || 'Sem resposta.';

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ reply: reply.trim() }));

            } catch (err) {
                console.error('Erro no GPT:', err.message);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ reply: 'Erro ao falar com o modelo.' }));
            }
        });
        return;
    }

    // ================== ARQUIVOS ESTÁTICOS ==================
    // Só serve extensões públicas de front-end. Sem isso, QUALQUER arquivo do
    // projeto (usuarios.json, db_config.php, lib/mail.php, .git/config, etc.)
    // ficava acessível direto pela URL, vazando senhas/hashes e chaves de API.
    const ALLOWED_STATIC_EXT = new Set([
        '.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg',
        '.woff', '.woff2', '.ttf'
    ]);

    let reqPath = decodeURIComponent(url.split('?')[0]);
    reqPath = reqPath === '/' ? '/index.html' : reqPath;

    const ext = path.extname(reqPath).toLowerCase();
    const filePath = path.normalize(path.join(__dirname, reqPath));
    const dentroDoProjeto = filePath === path.normalize(__dirname) ||
        filePath.startsWith(path.normalize(__dirname) + path.sep);

    if (!dentroDoProjeto || !ALLOWED_STATIC_EXT.has(ext)) {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>403 - Acesso negado</h1>');
        return;
    }

    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>404 - Arquivo não encontrado</h1>');
            return;
        }

        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(500);
                res.end('Erro interno');
                return;
            }
            // O servidor não mandava cabeçalho de cache nenhum, e aí cada
            // navegador decidia por conta própria por quanto tempo guardar o
            // arquivo. É assim que o painel continuava servindo a versão
            // anterior do admin.html depois de uma publicação.
            //
            // "no-cache" não proíbe guardar: obriga a perguntar ao servidor se
            // mudou antes de usar. Quando não mudou, a resposta é curta e
            // barata; quando mudou, vem o arquivo novo. É o que se quer para
            // HTML, que é o ponto de entrada e referencia todo o resto.
            res.writeHead(200, {
                'Content-Type': contentType,
                'Cache-Control': 'no-cache, must-revalidate'
            });
            res.end(data);
        });
    });
});

/**
 * Sobe o servidor. Quando há Supabase, o banco é carregado ANTES do listen:
 * atender requisição com a memória ainda vazia criaria usuários duplicados.
 */
async function iniciar() {
    if (SUPABASE_ATIVO) {
        try {
            memDb = await carregarDoSupabase();
            const total = COLECOES.map(c => `${memDb[c].length} ${c}`).join(', ');
            console.log(`🗄️  Supabase conectado — ${total}`);
        } catch (err) {
            // Subir com banco vazio gravaria por cima do que está no Postgres.
            // Melhor não subir e deixar o erro visível no log do Render.
            console.error('⛔ Não foi possível ler o Supabase:', err.message);
            console.error('   Confira SUPABASE_URL e SUPABASE_SERVICE_KEY, e se o projeto');
            console.error('   não está pausado (o plano free pausa após ~7 dias parado).');
            process.exit(1);
        }
    } else {
        memDb = lerArquivoLocal();
        console.log('🗄️  Banco em arquivo (usuarios.json) — sem SUPABASE_URL configurado');
    }

    server.listen(PORT, aoSubir);
}

function aoSubir() {
    console.log('========================================');
    console.log('🚀 Servidor de teste rodando!');
    console.log(`📁 Abra: http://localhost:${PORT}`);
    console.log('========================================');
    console.log('📧 E-mails REAIS sendo enviados via Brevo API');
    console.log('   (boas-vindas e código de acesso)');
    console.log('========================================');
    console.log('🔐 Fluxo completo disponível:');
    console.log('  1. Crie uma conta → e-mail de boas-vindas REAL');
    console.log('  2. Entre pelo celular → código de 6 dígitos');
    console.log('========================================');
    const stat = (c) => (c.clientId && c.clientSecret) ? '✅ configurado' : '⚠️  sem credenciais (oauth_config.json)';
    console.log(`🔑 Login Google:    ${stat(OAUTH.google)}  →  ${oauthRedirectUri('google')}`);
    console.log('📨 Login por código: e-mail ✅ (Brevo, sem custo novo)');
    console.log(`💳 Mercado Pago:    ${MP.link ? '✅ link configurado' : '⚠️  sem link (pagamento_config.json)'}${MP.accessToken ? ' + API' : ''}`);
    // nunca imprimir a senha: em hospedagem o log fica gravado no painel do provedor
    const senhaFraca = ADMIN.senha && (ADMIN.senha.length < 8 || ['admin', '1234', '123456'].includes(ADMIN.senha));
    const estadoAdmin = !ADMIN.senha
        ? '⛔ bloqueado (defina ADMIN_SENHA)'
        : senhaFraca
            ? '⚠️  senha fraca — troque antes de publicar'
            : `✅ senha forte${ADMIN.totpSecret ? ' + autenticador (2FA)' : ' (2FA desligado)'}`;
    console.log(`📊 Painel:          /admin.html  ${estadoAdmin}`);
    console.log(`📱 Código por SMS:  ${OTP.canalSms === 'off'
        ? 'desativado (canal pago — ligue em otp_config.json quando quiser)'
        : `canal "${OTP.canalSms}"${OTP.canalSms === 'console' ? ' ⚠️  só aparece no terminal' : ` (remetente ${OTP.remetenteSms})`}`}`);
    console.log('========================================');
}

iniciar();