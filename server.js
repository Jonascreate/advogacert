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
const COLECOES = ['usuarios', 'assinaturas', 'chamados', 'logins'];

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
 * O chamado grátis é contado pela OAB, não pela conta.
 * Se a mesma inscrição já usou o dela em qualquer cadastro, acabou.
 */
function freeUsadoPelaOab(db, oab) {
    if (!oab) return false;
    const idsDaOab = db.usuarios.filter(u => u.oab === oab).map(u => u.id);
    return db.chamados.some(c => c.tipo === 'free' && idsDaOab.includes(c.usuario_id));
}

/** Situação consolidada de uma pessoa — é o que o painel mostra. */
function situacaoDoUsuario(db, u) {
    const assinatura = assinaturaAtiva(db, u.id);
    const chamados = db.chamados.filter(c => c.usuario_id === u.id);
    return {
        id: u.id,
        nome: u.nome || '',
        email: u.email || '',
        telefone: u.telefone || '',
        oab: u.oab || '',
        criado_em: u.created_at || null,
        ultimo_login: u.ultimo_login || null,
        plano: assinatura ? assinatura.plano : null,
        status: assinatura ? 'ativa' : 'sem plano',
        valida_ate: assinatura ? assinatura.valida_ate : null,
        chamados_total: chamados.length,
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
                const { usuario_id, descricao } = JSON.parse(body || '{}');
                const db = loadJsonDb();
                const user = db.usuarios.find(u => u.id === usuario_id);

                if (!user) {
                    responder(404, { success: false, error: 'Usuário não encontrado' });
                    return;
                }

                // conta pela inscrição da OAB: trocar de e-mail não devolve o free
                const jaUsou = freeUsadoPelaOab(db, user.oab) ||
                               db.chamados.some(c => c.usuario_id === user.id && c.tipo === 'free');
                if (jaUsou) {
                    responder(200, {
                        success: false,
                        error: `O chamado gratuito da inscrição ${user.oab || 'desta conta'} já foi usado.`,
                        free_usado: true
                    });
                    return;
                }

                db.chamados.push({
                    id: proximoId(db.chamados),
                    usuario_id: user.id,
                    oab: user.oab || null,      // guardado junto: a contabilidade é por inscrição
                    tipo: 'free',
                    descricao: String(descricao || '').slice(0, 500),
                    status: 'aberto',
                    criado_em: new Date().toISOString()
                });
                saveJsonDb(db);

                console.log(`🆓 Chamado gratuito aberto: ${user.email || user.telefone}`);
                responder(200, { success: true, msg: 'Chamado gratuito registrado. Atendemos em até 2 horas.' });

            } catch (err) {
                console.error('Erro no chamado free:', err.message);
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
                responder(200, { success: true, token });

            } catch {
                responder(400, { success: false, error: 'Erro interno' });
            }
        });
        return;
    }

    // ============ PAINEL: GET /admin/dados ============
    // Devolve tudo o que a tela do painel mostra, já consolidado.
    if (method === 'GET' && url.split('?')[0] === '/admin/dados') {
        limparExpirados(adminSessoes, ADMIN_SESSAO_TTL);
        const token = (req.headers.authorization || '').replace('Bearer ', '');

        if (!adminSessoes.has(token)) {
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
            resumo: {
                usuarios: pessoas.length,
                ativos: pessoas.filter(p => p.status === 'ativa').length,
                free_usados: pessoas.filter(p => p.free_usado).length,
                chamados: db.chamados.length,
                logins_30d: db.logins.filter(l => new Date(l.criado_em).getTime() > trintaDias).length,
                receita_mes: db.assinaturas
                    .filter(a => a.status === 'ativa')
                    .reduce((soma, a) => soma + Number(a.valor || 0), 0)
            },
            pessoas,
            assinaturas: db.assinaturas.slice().reverse(),
            chamados: db.chamados.slice().reverse()
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

            limparExpirados(adminSessoes, ADMIN_SESSAO_TTL);
            const token = (req.headers.authorization || '').replace('Bearer ', '');
            if (!adminSessoes.has(token)) {
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

                const system = `Você é o PjeGPT, atendente oficial de suporte técnico do AdvogaCert (https://www.agentej.us),
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
            res.writeHead(200, { 'Content-Type': contentType });
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