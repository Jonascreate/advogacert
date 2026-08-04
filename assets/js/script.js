/* ==========================================
   JurisPapel - Script Principal
   Arquivo: assets/js/script.js
   Descrição: JavaScript da página inicial (blush animation, formulários, JurisGPT)
   ========================================== */

document.addEventListener('DOMContentLoaded', function() {

    // ==========================================
    // EFEITO GLOW MAGNÉTICO NOS CARDS DE CURSOS
    // ==========================================
    document.querySelectorAll('.course-card').forEach(card => {
        card.addEventListener('mousemove', e => {
            const rect = card.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * 100;
            const y = ((e.clientY - rect.top) / rect.height) * 100;
            card.style.setProperty('--mouse-x', x + '%');
            card.style.setProperty('--mouse-y', y + '%');
        });
    });

    // ==========================================
    // ANIMAÇÃO BLUSH (efeito de luz no fundo)
    // ==========================================
    const blush1 = document.getElementById('blush1');
    const blush2 = document.getElementById('blush2');
    const blush3 = document.getElementById('blush3');

    let mouseX = 0;
    let mouseY = 0;
    let blush1X = 0, blush1Y = 0;
    let blush2X = 0, blush2Y = 0;
    let blush3X = 0, blush3Y = 0;

    document.addEventListener('mousemove', function(e) {
        mouseX = e.clientX;
        mouseY = e.clientY;
    });

    function animate() {
        blush1X += (mouseX - blush1X - 200) * 0.05;
        blush1Y += (mouseY - blush1Y - 200) * 0.05;
        blush1.style.transform = `translate(${blush1X}px, ${blush1Y}px)`;

        blush2X += (mouseX - blush2X - 150) * 0.03;
        blush2Y += (mouseY - blush2Y - 150) * 0.03;
        blush2.style.transform = `translate(${blush2X}px, ${blush2Y}px)`;

        blush3X += (mouseX - blush3X - 125) * 0.02;
        blush3Y += (mouseY - blush3Y - 125) * 0.02;
        blush3.style.transform = `translate(${blush3X}px, ${blush3Y}px)`;

        requestAnimationFrame(animate);
    }

    // Iniciar animação
    animate();

    // ==========================================
    // FORMULÁRIOS (Login / Cadastro)
    // ==========================================
    function mostrarFormulario(idVisivel, titulo) {
        ['loginForm', 'registerForm', 'otpForm'].forEach(function (id) {
            const el = document.getElementById(id);
            if (el) el.style.display = id === idVisivel ? 'block' : 'none';
        });
        const h2 = document.querySelector('.login-container h2');
        if (h2) h2.textContent = titulo;
    }

    window.showLoginForm = function() {
        mostrarFormulario('loginForm', 'Cadastro');
    };

    window.showRegisterForm = function() {
        mostrarFormulario('registerForm', 'Criar Nova Conta');
    };

    window.showOtpForm = function() {
        mostrarFormulario('otpForm', 'Entrar com Código');
    };

    // Para onde ir depois de entrar. Só carrega a marca "retomar" quando existe
    // mesmo um plano escolhido esperando — é ela que autoriza o checkout a abrir
    // sozinho do outro lado. Sem isso, a tela de pagamento pulava na cara de
    // quem só queria navegar.
    window.destinoPosLogin = function () {
        return sessionStorage.getItem('checkoutPendente')
            ? 'index.html?retomar=1'
            : 'index.html';
    };

    // ==========================================
    // AVISO DE CHECKOUT PENDENTE (veio do botão "Assinar agora")
    // ==========================================
    if (new URLSearchParams(location.search).get('checkout') === '1') {
        const container = document.querySelector('.login-container');
        if (container) {
            const aviso = document.createElement('div');
            aviso.style.cssText = `
                background: rgba(110, 231, 200, 0.1);
                border: 1px solid rgba(110, 231, 200, 0.3);
                color: #6ee7c8;
                padding: 0.85rem 1.1rem;
                border-radius: 10px;
                font-size: 0.85rem;
                text-align: center;
                margin-bottom: 1.5rem;
            `;
            aviso.textContent = 'Faça login ou crie sua conta para concluir a assinatura do plano.';
            container.insertBefore(aviso, container.firstChild);
        }
    }

    // ==========================================
    // RETORNO DO LOGIN SOCIAL (Google)
    // O servidor já conferiu a conta no provedor e devolveu um ticket de uso
    // único na URL; aqui ele vira a sessão normal e some da barra de endereço.
    // ==========================================
    (function tratarRetornoSocial() {
        const params = new URLSearchParams(location.search);
        const ticket = params.get('oauth_ticket');
        const erro = params.get('oauth_erro');
        const messageDiv = document.getElementById('login-message');

        const limparUrl = () => {
            params.delete('oauth_ticket');
            params.delete('oauth_erro');
            const q = params.toString();
            history.replaceState({}, '', location.pathname + (q ? '?' + q : ''));
        };

        if (erro) {
            const textos = {
                google_nao_configurado: 'Login com Google ainda não configurado no servidor.',
                email_nao_verificado: 'O e-mail dessa conta não está verificado no provedor.',
                conta_sem_email: 'Não foi possível ler o e-mail dessa conta.',
                access_denied: 'Você cancelou a autorização.'
            };
            if (messageDiv) {
                messageDiv.style.color = '#ef4444';
                messageDiv.textContent = '✗ ' + (textos[erro] || 'Não foi possível entrar com essa conta.');
            }
            limparUrl();
            return;
        }

        if (!ticket) return;

        if (messageDiv) {
            messageDiv.style.color = '#333';
            messageDiv.textContent = 'Conferindo sua conta...';
        }

        fetch(apiUrl('/oauth/exchange'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticket: ticket })
        })
        .then(res => res.json())
        .then(data => {
            limparUrl();
            if (data.success) {
                sessionStorage.setItem('user', JSON.stringify(data.user));
                if (messageDiv) {
                    messageDiv.style.color = '#10b981';
                    messageDiv.textContent = '✓ Login realizado com sucesso!';
                }
                setTimeout(() => {
                    window.location.href = destinoPosLogin();
                }, 1200);
            } else if (messageDiv) {
                messageDiv.style.color = '#ef4444';
                messageDiv.textContent = '✗ ' + (data.error || 'Sessão expirada, tente novamente');
            }
        })
        .catch(() => {
            limparUrl();
            if (messageDiv) {
                messageDiv.style.color = '#ef4444';
                messageDiv.textContent = '✗ Erro de conexão com o servidor';
            }
        });
    })();

    // ==========================================
    // LOGIN POR CÓDIGO (OTP)
    // Passo 1: envia o e-mail  -> o servidor gera o código e dispara pelo canal
    // Passo 2: envia o código  -> o servidor confere, invalida e abre a sessão
    // ==========================================
    const otpForm = document.getElementById('otpForm');
    if (otpForm) {
        const passoDestino = document.getElementById('otp-passo-destino');
        const passoCodigo = document.getElementById('otp-passo-codigo');
        const inputDestino = document.getElementById('otp-destino-input');
        const inputCodigo = document.getElementById('otp-codigo');
        const btnEnviar = document.getElementById('otp-btn-enviar');
        const btnConfirmar = document.getElementById('otp-btn-confirmar');
        const btnReenviar = document.getElementById('otp-reenviar');
        const destino = document.getElementById('otp-destino');
        const messageDiv = document.getElementById('otp-message');

        let destinoEnviado = null;
        let contagem = null;

        function aviso(texto, cor) {
            messageDiv.style.color = cor || '#333';
            messageDiv.textContent = texto;
        }

        inputCodigo.addEventListener('input', function () {
            this.value = this.value.replace(/\D/g, '').slice(0, 6);
        });

        // O botão de reenvio respeita o mesmo intervalo que o servidor cobra
        function travarReenvio(segundos) {
            clearInterval(contagem);
            let restante = segundos;
            btnReenviar.disabled = true;
            const tick = function () {
                btnReenviar.textContent = restante > 0
                    ? 'Reenviar código em ' + restante + 's'
                    : 'Reenviar código';
                if (restante <= 0) {
                    clearInterval(contagem);
                    btnReenviar.disabled = false;
                    return;
                }
                restante--;
            };
            tick();
            contagem = setInterval(tick, 1000);
        }

        function pedirCodigo(botao, reenvio) {
            botao.disabled = true;
            aviso(reenvio ? 'Reenviando código...' : 'Enviando código...');

            return fetch(apiUrl('/otp/enviar'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ destino: inputDestino.value })
            })
            .then(res => res.json())
            .then(data => {
                botao.disabled = false;
                if (!data.success) {
                    aviso('✗ ' + (data.error || 'Não foi possível enviar o código'), '#ef4444');
                    if (data.esperar) travarReenvio(data.esperar);
                    return;
                }

                // Cada pedido gera um código novo e derruba o anterior
                destinoEnviado = data.destino;
                passoDestino.style.display = 'none';
                passoCodigo.style.display = 'block';
                destino.textContent = data.msg + ' · válido por 5 minutos';
                inputCodigo.value = '';
                inputCodigo.focus();
                aviso('');
                travarReenvio(data.reenviar_em || 60);
            })
            .catch(() => {
                botao.disabled = false;
                aviso('✗ Erro de conexão com o servidor', '#ef4444');
            });
        }

        otpForm.addEventListener('submit', function (e) {
            e.preventDefault();

            // Passo 1 — ainda pedindo o contato
            if (!destinoEnviado || passoCodigo.style.display === 'none') {
                pedirCodigo(btnEnviar, false);
                return;
            }

            // Passo 2 — conferindo o código
            const codigo = inputCodigo.value.replace(/\D/g, '');
            if (codigo.length !== 6) {
                aviso('✗ Digite os 6 dígitos do código', '#ef4444');
                return;
            }

            btnConfirmar.disabled = true;
            aviso('Conferindo o código...');

            fetch(apiUrl('/otp/verificar'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ destino: destinoEnviado, codigo: codigo })
            })
            .then(res => res.json())
            .then(data => {
                btnConfirmar.disabled = false;
                if (!data.success) {
                    aviso('✗ ' + (data.error || 'Código inválido ou expirado.'), '#ef4444');
                    inputCodigo.select();
                    return;
                }

                clearInterval(contagem);
                sessionStorage.setItem('user', JSON.stringify(data.user));
                aviso('✓ Login realizado com sucesso!', '#10b981');
                setTimeout(() => {
                    window.location.href = destinoPosLogin();
                }, 1200);
            })
            .catch(() => {
                btnConfirmar.disabled = false;
                aviso('✗ Erro de conexão com o servidor', '#ef4444');
            });
        });

        btnReenviar.addEventListener('click', function () {
            pedirCodigo(btnReenviar, true);
        });

        // Ponte para o formulário de entrada, que agora pede só o celular:
        // ele reaproveita este mesmo fluxo em vez de ter um envio próprio, para
        // o limite de tentativas, o reenvio e a conferência ficarem num lugar só.
        window.iniciarOtp = function (valor, botao) {
            inputDestino.value = valor;
            showOtpForm();
            return pedirCodigo(botao || btnEnviar, false);
        };
    }

    // ==========================================
    // ENTRADA PELO CELULAR (manda o código, sem senha)
    // O campo aceita e-mail também: quem normaliza o que foi digitado é o
    // servidor, em /otp/enviar, então aqui não se tenta adivinhar o formato.
    // ==========================================
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const campo = document.getElementById('login-telefone');
            const messageDiv = document.getElementById('login-message');
            const destino = campo.value.trim();

            if (!destino) {
                messageDiv.style.color = '#ef4444';
                messageDiv.textContent = '✗ Informe seu celular com DDD ou seu e-mail';
                return;
            }

            messageDiv.textContent = '';
            iniciarOtp(destino, document.getElementById('login-btn-codigo'));
        });
    }

    // ==========================================
    // REGISTER (Cadastro de nova conta)
    // ==========================================
    const registerForm = document.getElementById('registerForm');

    // máscara do WhatsApp — o servidor normaliza de novo para E.164
    const campoWhats = document.getElementById('register-whatsapp');
    if (campoWhats) {
        campoWhats.addEventListener('input', function () {
            const d = this.value.replace(/\D/g, '').slice(0, 11);
            if (d.length <= 2) this.value = d;
            else if (d.length <= 6) this.value = '(' + d.slice(0, 2) + ') ' + d.slice(2);
            else if (d.length <= 10) this.value = '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
            else this.value = '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', function (e) {
            e.preventDefault();

            const email = document.getElementById('register-email').value.trim();
            const whatsapp = document.getElementById('register-whatsapp').value;
            const oab = document.getElementById('register-oab').value.trim();
            const senha = document.getElementById('register-password').value;
            const senhaConfirm = document.getElementById('register-password-confirm').value;
            const messageDiv = document.getElementById('register-message');

            // validações
            if (whatsapp.replace(/\D/g, '').length < 10) {
                messageDiv.style.color = '#ef4444';
                messageDiv.textContent = '✗ Informe seu WhatsApp com DDD';
                return;
            }

            if (!/^\d{3,6}\s*\/?\s*[A-Za-z]{2}$/.test(oab.replace(/\s/g, ''))) {
                messageDiv.style.color = '#ef4444';
                messageDiv.textContent = '✗ Informe sua inscrição na OAB no formato 123456/GO';
                return;
            }

            if (senha.length < 6) {
                messageDiv.style.color = '#ef4444';
                messageDiv.textContent = '✗ A senha deve ter no mínimo 6 caracteres';
                return;
            }

            if (senha !== senhaConfirm) {
                messageDiv.style.color = '#ef4444';
                messageDiv.textContent = '✗ As senhas não coincidem';
                return;
            }

            messageDiv.style.color = '#333';
            messageDiv.textContent = 'Criando conta...';

            fetch(apiUrl('/login.php'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'register',
                    email: email,
                    whatsapp: whatsapp,
                    oab: oab,
                    senha: senha
                })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    messageDiv.style.color = '#10b981';
                    messageDiv.textContent = '✓ Conta criada com sucesso! Redirecionando...';

                    const checkoutPendente = sessionStorage.getItem('checkoutPendente');
                    if (checkoutPendente) {
                        // Havia um pagamento pendente: loga automaticamente com as
                        // credenciais recém-criadas para voltar direto ao checkout.
                        fetch(apiUrl('/login.php'), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'login', email: email, senha: senha })
                        })
                        .then(res => res.json())
                        .then(loginData => {
                            if (loginData.success) {
                                sessionStorage.setItem('user', JSON.stringify(loginData.user));
                            }
                            setTimeout(() => { window.location.href = destinoPosLogin(); }, 1000);
                        })
                        .catch(() => {
                            setTimeout(() => { window.location.href = 'login.html?checkout=1'; }, 1000);
                        });
                    } else {
                        setTimeout(() => {
                            window.location.href = 'agradecimento-free.html';
                        }, 1500);
                    }
                } else {
                    messageDiv.style.color = '#ef4444';
                    messageDiv.textContent = '✗ ' + data.error;
                }
            })
            .catch(() => {
                messageDiv.style.color = '#ef4444';
                messageDiv.textContent = '✗ Erro de conexão';
            });
        });
    }

    // ==========================================
    // JURISGPT CHAT (Assistente virtual)
    // ==========================================
    (() => {
        console.log('JurisGPT iniciado');

        const botGlowStyle = document.createElement('style');
        botGlowStyle.textContent = `
            @keyframes botGlowPulse {
                0%, 100% { box-shadow: 0 4px 16px rgba(0,0,0,.3), 0 0 20px rgba(110, 231, 200, 0.15); }
                50% { box-shadow: 0 4px 16px rgba(0,0,0,.3), 0 0 40px rgba(110, 231, 200, 0.4); }
            }
        `;
        document.head.appendChild(botGlowStyle);

        const btn = document.createElement('button');
        btn.innerHTML = '<i class="fa-solid fa-robot"></i>';
        Object.assign(btn.style, {
            position:'fixed', bottom:'24px', right:'24px',
            width:'58px', height:'58px',
            borderRadius:'50%', border:'none',
            fontSize:'22px', cursor:'pointer',
            background:'rgba(110, 231, 200, 0.12)', color:'#6ee7c8',
            border:'1px solid rgba(110, 231, 200, 0.35)',
            zIndex:'9999', animation:'botGlowPulse 3.2s ease-in-out infinite'
        });

        // Botão WhatsApp — por enquanto aponta para o wa.me, no futuro pode
        // ser trocado para o link da automação de atendimento no n8n.
        const waBtn = document.createElement('a');
        waBtn.href = 'https://wa.me/5561986241570';
        waBtn.target = '_blank';
        waBtn.rel = 'noopener';
        waBtn.innerHTML = '<i class="fa-brands fa-whatsapp"></i>';
        Object.assign(waBtn.style, {
            position:'fixed', bottom:'92px', right:'24px',
            width:'58px', height:'58px',
            borderRadius:'50%', border:'1px solid rgba(37, 211, 102, 0.4)',
            fontSize:'24px', cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center',
            background:'rgba(37, 211, 102, 0.14)', color:'#25D366',
            textDecoration:'none',
            zIndex:'9999', animation:'waGlowPulse 3.2s ease-in-out infinite'
        });
        const waGlowStyle = document.createElement('style');
        waGlowStyle.textContent = `
            @keyframes waGlowPulse {
                0%, 100% { box-shadow: 0 4px 16px rgba(0,0,0,.3), 0 0 20px rgba(37, 211, 102, 0.15); }
                50% { box-shadow: 0 4px 16px rgba(0,0,0,.3), 0 0 40px rgba(37, 211, 102, 0.4); }
            }

            /* ---------- CELULAR ----------
               A janela e montada por JS com estilo inline, e estilo inline
               vence folha de estilo — dai o !important.

               Sem isto, num aparelho de 360px de largura os 360px fixos da
               janela mais 24px de margem estouravam a tela.

               Aqui a janela comeca a 160px do rodape porque ha dois botoes
               flutuantes empilhados (bot e WhatsApp), e nao um so. */
            @media (max-width: 600px) {
                #chat-frame {
                    left: 12px !important;
                    right: 12px !important;
                    width: auto !important;
                    bottom: 156px !important;

                    /* dvh, e nao vh: no iOS o vh ignora a barra de endereco,
                       e o campo de digitar acabava escondido atras dela. */
                    height: calc(100dvh - 168px) !important;
                    max-height: none !important;
                }

                /* 16px e o minimo que o Safari aceita sem dar zoom na pagina
                   quando o dedo toca no campo. */
                #chat-frame #chat-input {
                    font-size: 16px !important;
                }
            }

            @supports not (height: 100dvh) {
                @media (max-width: 600px) {
                    #chat-frame { height: calc(100vh - 168px) !important; }
                }
            }
        `;
        document.head.appendChild(waGlowStyle);

        const frame = document.createElement('div');
        frame.id = 'chat-frame';   // alvo das regras de celular acima
        frame.style.cssText = `
            position:fixed; bottom:160px; right:24px;
            width:360px; height:520px;
            /* com os dois botoes (bot + whatsapp) a janela comeca a 160px do
               rodape; em telas de 13" (~640px uteis) o topo com o botao X
               ficava fora da tela. O limite abaixo encolhe a janela em vez
               de deixar o cabecalho escapar para cima. */
            max-height:calc(100vh - 180px);
            min-height:260px;
            background:#161618; color:#fff;
            border-radius:14px; display:none;
            flex-direction:column;
            box-shadow:0 12px 32px rgba(0,0,0,.4);
            font-family:system-ui,sans-serif;
            z-index:9998;
        `;

        frame.innerHTML = `
            <div style="
                padding:14px 16px;
                background:linear-gradient(135deg,#111113,#1b1b1f);
                display:flex;
                justify-content:space-between;
                align-items:center;
                color:#6ee7c8;
                border-bottom:1px solid #2a2a2f;
            ">
                <div style="display:flex;align-items:center;gap:10px;font-weight:600">
                    <i class="fa-solid fa-feather-pointed"></i>
                    <span>AssistentePje</span>
                </div>
                <button id="close-chat" aria-label="Fechar chat" style="
                    background:none;
                    border:none;
                    color:#6ee7c8;
                    font-size:22px;
                    cursor:pointer;
                    line-height:1;
                    padding:0 4px;
                    flex-shrink:0;
                ">×</button>
            </div>
            <div id="chat-messages" style="flex:1;padding:12px;overflow-y:auto;font-size:14px"></div>
            <div style="display:flex;padding:10px;border-top:1px solid #2a2a2e">
                <input id="chat-input" placeholder="Digite sua pergunta..."
                    style="flex:1;border:none;border-radius:8px;
                           padding:10px;font-size:14px;
                           background:#1f1f22;color:#fff;outline:none">
                <button id="send-btn"
                    style="margin-left:8px;padding:0 16px;
                           border:1px solid rgba(110, 231, 200, 0.35);border-radius:8px;
                           background:rgba(110, 231, 200, 0.12);color:#6ee7c8;
                           fontSize:16px;cursor:pointer">➤</button>
            </div>
        `;

        // Nas páginas que já têm um botão de WhatsApp próprio na página
        // (agradecimento, contato), não duplica o botão flutuante.
        const paginasComWhatsAppProprio = ['agradecimento-free.html', 'agradecimento-premium.html', 'contato.html'];
        const paginaAtual = location.pathname.split('/').pop();
        const temWhatsFlutuante = !paginasComWhatsAppProprio.includes(paginaAtual);

        if (temWhatsFlutuante) {
            document.body.append(btn, waBtn, frame);
        } else {
            document.body.append(btn, frame);
        }

        // A janela sobe o suficiente para passar dos botões que existem de fato:
        // com WhatsApp são dois empilhados (160px), sem ele é só o robô (92px).
        // Sem esse ajuste, sobrava um vão vazio nas páginas sem o WhatsApp.
        frame.style.bottom = temWhatsFlutuante ? '160px' : '92px';

        const msgs = frame.querySelector('#chat-messages');
        const input = frame.querySelector('#chat-input');
        const send = frame.querySelector('#send-btn');

        let chatHistory = [];
        let conversaAtiva = false;

        btn.onclick = () => {
            const wasClosed = frame.style.display === 'none' || frame.style.display === '';
            frame.style.display = wasClosed ? 'flex' : 'none';
            if (wasClosed) {
                input.focus();
                if (!conversaAtiva) {
                    chatHistory = [];
                    conversaAtiva = true;
                }
            }
        };
        function fecharChat() {
            frame.style.display = 'none';
            conversaAtiva = false;
        }

        frame.querySelector('#close-chat').onclick = fecharChat;

        // Esc fecha o chat — saida garantida se o cabecalho ficar fora da tela
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && frame.style.display === 'flex') fecharChat();
        });

        function limparMarkdown(text) {
            return text
                .replace(/```[\s\S]*?```/g, m => m.replace(/```/g, ''))
                .replace(/^#{1,6}\s*/gm, '')
                .replace(/^\s*[-*]{3,}\s*$/gm, '')
                .replace(/\*\*\*(.+?)\*\*\*/g, '$1')
                .replace(/\*\*(.+?)\*\*/g, '$1')
                .replace(/\*(.+?)\*/g, '$1')
                .replace(/`([^`]+)`/g, '$1')
                .replace(/^\s*[-*]\s+/gm, '- ')
                .replace(/\*/g, '');
            // NÃO troque "algo.html" por "aba Algo" aqui. Essa regra existia
            // de quando o bot citava nomes de arquivo, e passou a destruir os
            // endereços: "www.agentej.us/contato.html" virava
            // "www.agentej.us/aba Contato", que não abre nada.
        }

        function addMsg(text, who, typing = false) {
            if (who === 'bot') text = limparMarkdown(text);
            const div = document.createElement('div');
            div.style.cssText = `
                margin:6px 0;
                padding:8px 10px;
                border-radius:10px;
                white-space:pre-wrap;
                /* endereço é uma palavra só, sem espaço onde quebrar: sem isto
                   ele passa da largura do balão e sai pela lateral da janela */
                overflow-wrap:anywhere;
                ${who === 'user'
                    ? 'max-width:80%;margin-left:auto;background:#005c4b;color:#e9edef'
                    /* o bot é quem manda passo a passo e endereço: ganha mais
                       largura que o emissor para o texto caber no cinza */
                    : 'max-width:94%;margin-right:auto;background:#202c33;color:#e9edef'}
            `;
            msgs.appendChild(div);
            msgs.scrollTop = msgs.scrollHeight;

            // escreverComLinks vem do api.js: transforma endereço em link
            // clicável sem usar innerHTML. Só é aplicado no texto do bot.
            const escrever = (alvo, txt) => {
                if (who === 'bot' && window.escreverComLinks) {
                    window.escreverComLinks(alvo, txt);
                } else {
                    alvo.textContent = txt;
                }
            };

            if (!typing) {
                escrever(div, text);
                return;
            }

            let i = 0;
            const speed = 18;
            const timer = setInterval(() => {
                div.textContent += text.charAt(i);
                i++;
                msgs.scrollTop = msgs.scrollHeight;
                if (i >= text.length) {
                    clearInterval(timer);
                    // só no fim: durante a digitação o endereço está pela
                    // metade, e viraria um link quebrado a cada letra
                    escrever(div, text);
                    msgs.scrollTop = msgs.scrollHeight;
                }
            }, speed);
        }

        function isEncerramento(text) {
            const encerramentos = /\b(ok|t[aá] bom?|certo|beleza|valeu|obrigad[oa]|encerr[ao]r?|fechar|tchau|at[eé] mais|flw|vlw|encerrar conversa|finalizar)\b/i;
            return encerramentos.test(text.toLowerCase());
        }

        async function sendMsg() {
            const text = input.value.trim();
            if (!text) return;

            conversaAtiva = true;
            addMsg(text, 'user');
            input.value = '';

            chatHistory.push({ role: 'user', content: text });

            try {
                const r = await fetch(apiUrl('/gpt.php'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messages: chatHistory })
                });
                const j = await r.json();
                const reply = j.reply || 'Sem resposta.';
                chatHistory.push({ role: 'assistant', content: reply });

                addMsg(reply, 'bot', true);

                if (isEncerramento(text)) {
                    conversaAtiva = false;
                }
            } catch {
                addMsg('Erro ao contactar o servidor.', 'bot');
            }
        }

        send.onclick = sendMsg;
        input.onkeydown = e => { if (e.key === 'Enter') sendMsg(); };
    })();

    // ==========================================
    // CHECKOUT / PAGAMENTO DOS PLANOS
    // ==========================================
    // ⚠️ INTEGRAÇÃO FUTURA: este modal é um placeholder de front-end.
    // Quando houver conta InfinityPay (ou outro gateway) configurada,
    // trocar a função `processarPagamento()` abaixo por uma chamada real
    // (ex: POST para um endpoint PHP que cria a cobrança e redireciona
    // para a URL de checkout retornada pela API).
    //
    // ⚠️ SEGURANÇA: enquanto for placeholder, os dados do cartão NÃO saem
    // daqui — nada é enviado nem guardado. Na integração real, o número do
    // cartão deve ir direto para o gateway (tokenização), nunca para o
    // servidor do site.
    (() => {
        // O checkout só existe onde há plano para assinar. Em contato, login,
        // painel e afins, nem o modal é criado — assim não há como ele aparecer.
        const botoesPlano = document.querySelectorAll('[data-plano][data-valor]');
        if (!botoesPlano.length) return;

        function getUsuarioLogado() {
            try {
                return JSON.parse(sessionStorage.getItem('user'));
            } catch {
                return null;
            }
        }

        // --- estilos do checkout (injetados uma vez) ---
        const estilo = document.createElement('style');
        estilo.textContent = `
            .pay-overlay {
                position: fixed; inset: 0; z-index: 10000;
                display: none; align-items: center; justify-content: center;
                padding: 1.5rem;
                background: rgba(6, 6, 8, 0.72);
                backdrop-filter: blur(6px);
                -webkit-backdrop-filter: blur(6px);
                overflow-y: auto;
            }
            .pay-overlay.aberto { display: flex; }

            .pay-modal {
                position: relative;
                width: 100%; max-width: 430px;
                background: #131315;
                border: 1px solid #2a2a2e;
                border-radius: 20px;
                color: #f5f5f5;
                font-family: 'Inter', system-ui, -apple-system, sans-serif;
                box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
                overflow: hidden;
                animation: paySobe 0.28s cubic-bezier(0.16, 1, 0.3, 1);
            }
            @keyframes paySobe {
                from { opacity: 0; transform: translateY(18px) scale(0.98); }
                to   { opacity: 1; transform: none; }
            }

            /* cabeçalho com o mesmo verde da marca */
            .pay-head {
                display: flex; align-items: center; justify-content: space-between;
                gap: 1rem;
                padding: 1.35rem 1.5rem;
                border-bottom: 1px solid #2a2a2e;
                background: linear-gradient(160deg, rgba(110, 231, 200, 0.10), rgba(19, 19, 21, 0) 70%);
            }
            .pay-head-marca {
                display: flex; align-items: center; gap: 0.6rem;
                font-family: 'Outfit', sans-serif;
                font-weight: 600; font-size: 1.05rem;
            }
            .pay-head-marca i { color: #6ee7c8; }
            .pay-fechar {
                background: none; border: none; cursor: pointer;
                color: #8a8a90; font-size: 1.5rem; line-height: 1;
                padding: 0 0.25rem; border-radius: 8px;
                transition: color 0.2s ease;
            }
            .pay-fechar:hover { color: #f5f5f5; }

            .pay-corpo { padding: 1.5rem; }

            /* resumo do plano */
            .pay-resumo {
                border: 1px solid rgba(110, 231, 200, 0.28);
                background: rgba(110, 231, 200, 0.06);
                border-radius: 14px;
                padding: 1.1rem 1.25rem;
                margin-bottom: 1.5rem;
            }
            .pay-resumo-topo {
                display: flex; align-items: baseline; justify-content: space-between;
                gap: 1rem;
            }
            .pay-resumo-rotulo {
                font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase;
                color: #8a8a90;
            }
            .pay-resumo-plano {
                font-family: 'Outfit', sans-serif;
                font-weight: 600; font-size: 1.1rem; margin-top: 0.15rem;
            }
            .pay-resumo-valor {
                font-family: 'Outfit', sans-serif;
                color: #6ee7c8; font-weight: 700; font-size: 1.6rem;
                white-space: nowrap;
            }
            .pay-resumo-valor small { font-size: 0.8rem; font-weight: 500; color: #8a8a90; }
            .pay-resumo ul {
                list-style: none; margin: 0.9rem 0 0; padding: 0.9rem 0 0;
                border-top: 1px solid rgba(110, 231, 200, 0.18);
                display: grid; gap: 0.45rem;
            }
            .pay-resumo li {
                display: flex; align-items: center; gap: 0.5rem;
                font-size: 0.85rem; color: #c9c9ce;
            }
            .pay-resumo li i { color: #6ee7c8; font-size: 0.75rem; }

            /* campos */
            .pay-campo { margin-bottom: 1rem; }
            .pay-campo label {
                display: block; font-size: 0.82rem; color: #8a8a90;
                margin-bottom: 0.4rem;
            }
            .pay-campo input, .pay-campo select {
                width: 100%; box-sizing: border-box;
                padding: 0.9rem 1rem;
                background: #1c1c1f;
                border: 1px solid #2a2a2e;
                border-radius: 11px;
                color: #fff; font-size: 0.98rem;
                font-family: inherit;
                transition: border-color 0.2s ease, box-shadow 0.2s ease;
            }
            .pay-campo input::placeholder { color: #55555c; }
            .pay-campo input:focus, .pay-campo select:focus {
                outline: none;
                border-color: #6ee7c8;
                box-shadow: 0 0 0 3px rgba(110, 231, 200, 0.12);
            }
            .pay-campo input[inputmode="numeric"] {
                font-family: 'JetBrains Mono', ui-monospace, monospace;
                letter-spacing: 0.06em;
            }
            .pay-linha { display: flex; gap: 0.8rem; }
            .pay-linha .pay-campo { flex: 1; min-width: 0; }

            /* bandeira detectada pelo número digitado */
            .pay-numero-wrap { position: relative; }
            .pay-bandeira {
                position: absolute; right: 0.9rem; top: 50%;
                transform: translateY(-50%);
                font-size: 1.35rem; color: #8a8a90;
                opacity: 0; transition: opacity 0.2s ease, color 0.2s ease;
                pointer-events: none;
            }
            .pay-bandeira.visivel { opacity: 1; color: #f5f5f5; }

            .pay-btn {
                width: 100%; padding: 1.05rem;
                border: none; border-radius: 12px;
                font-family: 'Outfit', sans-serif;
                font-weight: 700; font-size: 1rem;
                cursor: pointer;
                background: linear-gradient(135deg, #21b98f, #6ee7c8);
                color: #062018;
                display: flex; align-items: center; justify-content: center; gap: 0.6rem;
                transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
            }
            .pay-btn:hover:not(:disabled) {
                transform: translateY(-2px);
                box-shadow: 0 14px 28px rgba(33, 185, 143, 0.28);
            }
            .pay-btn:disabled { opacity: 0.7; cursor: default; }
            .pay-girando {
                width: 15px; height: 15px;
                border: 2px solid rgba(6, 32, 24, 0.3);
                border-top-color: #062018;
                border-radius: 50%;
                animation: payGira 0.7s linear infinite;
            }
            @keyframes payGira { to { transform: rotate(360deg); } }

            .pay-msg { margin-top: 0.9rem; text-align: center; font-size: 0.88rem; min-height: 1.2em; }

            /* rodapé de confiança */
            .pay-rodape {
                margin-top: 1.25rem; padding-top: 1.1rem;
                border-top: 1px solid #2a2a2e;
                display: grid; gap: 0.5rem;
                font-size: 0.78rem; color: #74747a; text-align: center;
            }
            .pay-selos {
                display: flex; align-items: center; justify-content: center;
                gap: 1.1rem; color: #8a8a90; font-size: 1.15rem;
            }

            @media (max-width: 480px) {
                .pay-overlay { padding: 0; align-items: flex-end; }
                .pay-modal { max-width: none; border-radius: 20px 20px 0 0; }
                .pay-linha { flex-direction: column; gap: 0; }
            }
            @media (prefers-reduced-motion: reduce) {
                .pay-modal { animation: none; }
                .pay-btn:hover:not(:disabled) { transform: none; }
            }
        `;
        document.head.appendChild(estilo);

        const overlay = document.createElement('div');
        overlay.className = 'pay-overlay';

        const modal = document.createElement('div');
        modal.className = 'pay-modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'pay-titulo');

        modal.innerHTML = `
            <div class="pay-head">
                <div class="pay-head-marca" id="pay-titulo">
                    <i class="fa-solid fa-shield-halved"></i>
                    <span>Pagamento seguro</span>
                </div>
                <button type="button" class="pay-fechar" id="checkout-close" aria-label="Fechar">&times;</button>
            </div>

            <div class="pay-corpo">
                <div class="pay-resumo">
                    <div class="pay-resumo-topo">
                        <div>
                            <div class="pay-resumo-rotulo">Você está assinando</div>
                            <div class="pay-resumo-plano" id="checkout-plano"></div>
                        </div>
                        <div class="pay-resumo-valor" id="checkout-valor"></div>
                    </div>
                    <ul>
                        <li><i class="fa-solid fa-check"></i> Chamados ilimitados todo mês</li>
                        <li><i class="fa-solid fa-check"></i> Atendimento em no máximo 30 minutos</li>
                        <li><i class="fa-solid fa-check"></i> Cancele quando quiser, sem multa</li>
                    </ul>
                </div>

                <form id="checkout-form" novalidate>
                    <div class="pay-campo">
                        <label for="checkout-nome">Nome no cartão</label>
                        <input required id="checkout-nome" autocomplete="cc-name"
                               placeholder="Como está impresso no cartão">
                    </div>

                    <div class="pay-campo">
                        <label for="checkout-numero">Número do cartão</label>
                        <div class="pay-numero-wrap">
                            <input required id="checkout-numero" inputmode="numeric" maxlength="19"
                                   autocomplete="cc-number" placeholder="0000 0000 0000 0000">
                            <i class="pay-bandeira" id="checkout-bandeira" aria-hidden="true"></i>
                        </div>
                    </div>

                    <div class="pay-linha">
                        <div class="pay-campo">
                            <label for="checkout-validade">Validade</label>
                            <input required id="checkout-validade" inputmode="numeric" maxlength="5"
                                   autocomplete="cc-exp" placeholder="MM/AA">
                        </div>
                        <div class="pay-campo">
                            <label for="checkout-cvv">CVV</label>
                            <input required id="checkout-cvv" inputmode="numeric" maxlength="4"
                                   autocomplete="cc-csc" placeholder="000">
                        </div>
                    </div>

                    <button type="submit" class="pay-btn" id="checkout-submit">
                        <i class="fa-solid fa-lock" style="font-size:0.85rem;"></i>
                        <span id="checkout-submit-texto">Confirmar pagamento</span>
                    </button>
                    <div class="pay-msg" id="checkout-msg"></div>
                </form>

                <div class="pay-rodape">
                    <div class="pay-selos">
                        <i class="fa-brands fa-cc-visa"></i>
                        <i class="fa-brands fa-cc-mastercard"></i>
                        <i class="fa-brands fa-cc-amex"></i>
                        <i class="fa-solid fa-lock" style="font-size:0.95rem;"></i>
                    </div>
                    <div>Conexão criptografada. Renovação mensal, cancele quando quiser.</div>
                </div>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const campoNumero = modal.querySelector('#checkout-numero');
        const campoValidade = modal.querySelector('#checkout-validade');
        const campoCvv = modal.querySelector('#checkout-cvv');
        const iconeBandeira = modal.querySelector('#checkout-bandeira');
        const btnEnviar = modal.querySelector('#checkout-submit');
        const btnTexto = modal.querySelector('#checkout-submit-texto');
        const msg = modal.querySelector('#checkout-msg');

        // --- máscaras: o cliente digita só números, a formatação é nossa ---
        campoNumero.addEventListener('input', function () {
            const d = this.value.replace(/\D/g, '').slice(0, 16);
            this.value = d.replace(/(\d{4})(?=\d)/g, '$1 ');
            marcarBandeira(d);
        });

        campoValidade.addEventListener('input', function () {
            const d = this.value.replace(/\D/g, '').slice(0, 4);
            this.value = d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d;
        });

        campoCvv.addEventListener('input', function () {
            this.value = this.value.replace(/\D/g, '').slice(0, 4);
        });

        // bandeira pelo prefixo — só para dar retorno visual de que o número foi lido
        function marcarBandeira(digitos) {
            const bandeiras = [
                [/^4/, 'fa-cc-visa'],
                [/^(5[1-5]|2[2-7])/, 'fa-cc-mastercard'],
                [/^3[47]/, 'fa-cc-amex'],
                [/^(4011|4312|4389|5041|6277|6362|6363|650|651|655)/, 'fa-cc-diners-club']
            ];
            const achou = digitos.length >= 2 && bandeiras.find(([re]) => re.test(digitos));
            iconeBandeira.className = achou
                ? `pay-bandeira visivel fa-brands ${achou[1]}`
                : 'pay-bandeira';
        }

        function abrirCheckout(plano, valor) {
            modal.querySelector('#checkout-plano').textContent = plano;
            modal.querySelector('#checkout-valor').innerHTML =
                'R$ ' + Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) +
                ' <small>/ mês</small>';
            msg.textContent = '';
            overlay.classList.add('aberto');
            document.body.style.overflow = 'hidden';   // trava o fundo enquanto o modal está aberto
            setTimeout(() => modal.querySelector('#checkout-nome').focus(), 60);
        }

        function fecharCheckout() {
            overlay.classList.remove('aberto');
            document.body.style.overflow = '';
        }

        overlay.addEventListener('click', e => {
            if (e.target === overlay) fecharCheckout();
        });
        modal.querySelector('#checkout-close').onclick = fecharCheckout;
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && overlay.classList.contains('aberto')) fecharCheckout();
        });

        function processarPagamento(dadosPlano) {
            // Placeholder de processamento — trocar pela integração real
            // com a API de pagamento (InfinityPay ou similar) quando disponível.
            return new Promise(resolve => setTimeout(resolve, 1600));
        }

        modal.querySelector('#checkout-form').addEventListener('submit', function (e) {
            e.preventDefault();

            // conferências básicas antes de mostrar "processando"
            const numero = campoNumero.value.replace(/\D/g, '');
            const validade = campoValidade.value.replace(/\D/g, '');
            const mes = parseInt(validade.slice(0, 2), 10);

            const erro =
                !modal.querySelector('#checkout-nome').value.trim() ? 'Informe o nome impresso no cartão.' :
                numero.length < 13 ? 'Número do cartão incompleto.' :
                validade.length < 4 || mes < 1 || mes > 12 ? 'Validade inválida.' :
                campoCvv.value.length < 3 ? 'CVV incompleto.' : null;

            if (erro) {
                msg.style.color = '#ff6b5e';
                msg.textContent = erro;
                return;
            }

            btnEnviar.disabled = true;
            btnTexto.textContent = 'Processando...';
            btnEnviar.querySelector('i').outerHTML = '<span class="pay-girando"></span>';
            msg.style.color = '#8a8a90';
            msg.textContent = 'Confirmando pagamento com segurança...';

            processarPagamento().then(() => {
                msg.style.color = '#6ee7c8';
                msg.textContent = '✓ Pagamento confirmado! Redirecionando...';
                setTimeout(() => {
                    fecharCheckout();
                    // vai para a confirmação, que explica o passo a passo do
                    // atendimento — antes caía na home sem dizer nada
                    const usuario = getUsuarioLogado();
                    const oab = usuario && usuario.oab ? '?oab=' + encodeURIComponent(usuario.oab) : '';
                    window.location.href = 'agradecimento-premium.html' + oab;
                }, 1500);
            });
        });

        botoesPlano.forEach(btn => {
            btn.addEventListener('click', () => {
                const usuario = getUsuarioLogado();
                if (!usuario) {
                    // Guarda o plano escolhido para retomar o checkout
                    // automaticamente assim que a pessoa logar ou se cadastrar.
                    sessionStorage.setItem('checkoutPendente', JSON.stringify({
                        plano: btn.dataset.plano,
                        valor: btn.dataset.valor,
                        em: Date.now()
                    }));
                    window.location.href = 'login.html?checkout=1';
                    return;
                }
                abrirCheckout(btn.dataset.plano, btn.dataset.valor);
            });
        });

        // ------------------------------------------
        // SUPORTE GRÁTIS — pede a OAB e registra antes de mandar ao WhatsApp
        //
        // Antes o botão levava direto para contato.html: a pessoa ia embora
        // para a conversa e nada ficava registrado, então não havia como saber
        // quem já tinha usado o free. Agora a inscrição é gravada primeiro; o
        // WhatsApp abre depois, na página de confirmação, já com a OAB no texto.
        // ------------------------------------------
        const btnFree = document.getElementById('btn-suporte-free');
        if (btnFree) {
            const overlayFree = document.createElement('div');
            overlayFree.className = 'pay-overlay';
            overlayFree.innerHTML = `
                <div class="pay-modal" role="dialog" aria-modal="true" aria-labelledby="free-titulo">
                    <div class="pay-head">
                        <div class="pay-head-marca" id="free-titulo">1 suporte grátis</div>
                        <button type="button" class="pay-fechar" id="free-close" aria-label="Fechar">&times;</button>
                    </div>
                    <div class="pay-corpo">
                        <form id="free-form" novalidate>
                            <div class="pay-campo">
                                <label for="free-nome">Nome completo</label>
                                <input id="free-nome" placeholder="Como está na sua inscrição" autocomplete="name" required>
                            </div>
                            <div class="pay-campo">
                                <label for="free-oab">Inscrição na OAB</label>
                                <input id="free-oab" placeholder="123456/GO" autocomplete="off" required>
                            </div>
                            <div class="pay-campo">
                                <label for="free-dia">Dia</label>
                                <select id="free-dia"></select>
                            </div>
                            <div class="pay-campo">
                                <label for="free-hora">Horário</label>
                                <select id="free-hora"></select>
                            </div>
                            <button type="submit" class="pay-btn" id="free-enviar">Marcar meu atendimento</button>
                            <div class="pay-msg" id="free-msg">É um por inscrição. Depois de registrar, abrimos o WhatsApp.</div>
                        </form>
                    </div>
                </div>
            `;
            document.body.appendChild(overlayFree);

            const fecharFree = () => {
                overlayFree.classList.remove('aberto');
                document.body.style.overflow = '';
            };

            const selDia = overlayFree.querySelector('#free-dia');
            const selHora = overlayFree.querySelector('#free-hora');
            let agenda = [];

            // Preenche as horas do dia escolhido. A lista vem inteira do
            // servidor de uma vez, então trocar de dia não faz nova consulta.
            function mostrarHorasDoDia() {
                const dia = agenda.find(d => d.dia === selDia.value);
                selHora.innerHTML = (dia ? dia.horarios : [])
                    .map(h => `<option value="${h.inicio}">${h.rotulo}</option>`).join('');
            }
            selDia.addEventListener('change', mostrarHorasDoDia);

            function carregarAgenda() {
                const m = overlayFree.querySelector('#free-msg');
                selDia.innerHTML = '<option>carregando...</option>';
                selHora.innerHTML = '';

                return fetch(apiUrl('/agenda/horarios'))
                    .then(r => r.json())
                    .then(d => {
                        agenda = (d && d.dias) || [];
                        if (!agenda.length) {
                            selDia.innerHTML = '<option>sem horário livre</option>';
                            m.style.color = '#ff6b5e';
                            m.textContent = 'Não há horário livre nos próximos dias. Fale conosco pelo WhatsApp.';
                            return;
                        }
                        selDia.innerHTML = agenda
                            .map(d2 => `<option value="${d2.dia}">${d2.rotulo}</option>`).join('');
                        mostrarHorasDoDia();
                    })
                    .catch(() => {
                        selDia.innerHTML = '<option>erro ao carregar</option>';
                        m.style.color = '#ff6b5e';
                        m.textContent = 'Não foi possível carregar a agenda. Tente de novo.';
                    });
            }

            btnFree.addEventListener('click', () => {
                const u = getUsuarioLogado();
                // quem já entrou tem a inscrição e o nome na conta: vêm preenchidos
                if (u && u.oab) overlayFree.querySelector('#free-oab').value = u.oab;
                if (u && u.nome) overlayFree.querySelector('#free-nome').value = u.nome;
                const m = overlayFree.querySelector('#free-msg');
                m.style.color = '#8a8a90';
                m.textContent = 'É um por inscrição. Escolha dia e hora do seu atendimento.';
                overlayFree.classList.add('aberto');
                document.body.style.overflow = 'hidden';
                carregarAgenda();
                setTimeout(() => overlayFree.querySelector('#free-nome').focus(), 60);
            });

            overlayFree.querySelector('#free-close').onclick = fecharFree;
            overlayFree.addEventListener('click', e => {
                if (e.target === overlayFree) fecharFree();
            });

            overlayFree.querySelector('#free-form').addEventListener('submit', function (e) {
                e.preventDefault();
                const campo = overlayFree.querySelector('#free-oab');
                const msg = overlayFree.querySelector('#free-msg');
                const botao = overlayFree.querySelector('#free-enviar');
                const oab = campo.value.trim().toUpperCase();
                const nome = overlayFree.querySelector('#free-nome').value.trim();

                if (nome.length < 5) {
                    msg.style.color = '#ff6b5e';
                    msg.textContent = 'Informe seu nome completo, como está na inscrição.';
                    return;
                }
                if (!/^\d{2,7}\s*\/?\s*[A-Z]{2}$/.test(oab.replace(/\s+/g, ''))) {
                    msg.style.color = '#ff6b5e';
                    msg.textContent = 'Informe a inscrição no formato 123456/GO.';
                    return;
                }
                if (!selHora.value) {
                    msg.style.color = '#ff6b5e';
                    msg.textContent = 'Escolha o dia e o horário do atendimento.';
                    return;
                }

                const u = getUsuarioLogado();
                botao.disabled = true;
                msg.style.color = '#8a8a90';
                msg.textContent = 'Registrando...';

                fetch(apiUrl('/chamado/free'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        oab: oab,
                        nome: nome,
                        inicio: selHora.value,
                        usuario_id: u ? u.id : null,
                        descricao: 'Suporte gratuito pedido pela página de planos'
                    })
                })
                .then(r => r.json())
                .then(data => {
                    botao.disabled = false;
                    if (!data.success) {
                        msg.style.color = '#ff6b5e';
                        msg.textContent = data.error || 'Não foi possível registrar.';
                        // o horário foi tomado enquanto ela preenchia: a lista
                        // volta atualizada, senão ela tentaria a mesma vaga
                        if (data.recarregar_agenda) carregarAgenda();
                        return;
                    }
                    msg.style.color = '#6ee7c8';
                    msg.textContent = '✓ Atendimento marcado! Abrindo o WhatsApp...';
                    setTimeout(() => {
                        fecharFree();
                        // a página de confirmação já monta o link do WhatsApp
                        // com a inscrição no texto da conversa
                        window.location.href = 'agradecimento-free.html'
                            + '?oab=' + encodeURIComponent(oab.replace(/\s+/g, ''))
                            + '&quando=' + encodeURIComponent(data.inicio);
                    }, 1200);
                })
                .catch(() => {
                    botao.disabled = false;
                    msg.style.color = '#ff6b5e';
                    msg.textContent = 'Erro de conexão com o servidor.';
                });
            });
        }

        // ------------------------------------------
        // RETOMADA DO CHECKOUT — três travas
        // ------------------------------------------
        // A tela de pagamento só pode aparecer por um clique em "Assinar" ou
        // logo depois de um login feito PARA pagar. Antes bastava existir um
        // pendente guardado e a pessoa estar logada, então o modal saltava
        // sozinho em qualquer página, a qualquer momento — inclusive para quem
        // tinha desistido no meio do caminho.
        //   1) exige a marca ?retomar=1, posta só pelo redirecionamento do login
        //   2) o pedido vale por 10 minutos
        //   3) o pendente é apagado sempre, dando certo ou não
        const RETOMADA_TTL = 10 * 60 * 1000;
        const querRetomar = new URLSearchParams(location.search).get('retomar') === '1';
        const pendenteBruto = sessionStorage.getItem('checkoutPendente');

        if (querRetomar) {
            // tira a marca da barra de endereço para um F5 não reabrir o modal
            const params = new URLSearchParams(location.search);
            params.delete('retomar');
            const q = params.toString();
            history.replaceState({}, '', location.pathname + (q ? '?' + q : ''));
        }

        if (pendenteBruto) {
            sessionStorage.removeItem('checkoutPendente');
            try {
                const { plano, valor, em } = JSON.parse(pendenteBruto);
                const recente = em && (Date.now() - em) < RETOMADA_TTL;
                if (querRetomar && recente && getUsuarioLogado()) {
                    abrirCheckout(plano, valor);
                }
            } catch {
                /* pendente corrompido: já foi apagado acima */
            }
        }
    })();
});
