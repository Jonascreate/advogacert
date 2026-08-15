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
        // Com plano escolhido, volta e abre o pagamento. Sem plano, cai na
        // seção de planos — quem acabou de entrar veio fazer alguma coisa, e
        // largar a pessoa no topo da home a obriga a procurar sozinha.
        const pendente = sessionStorage.getItem('checkoutPendente') ||
            localStorage.getItem('checkoutPendente');
        if (!pendente) return 'index.html#planos';

        // O curso não mora na index: quem sai de curso.html tem de voltar para
        // lá, senão cai na home sem entender por que o pagamento não abriu —
        // e o retomador do curso, que só existe naquela página, nunca roda.
        //
        // A origem é comparada contra uma lista fixa em vez de ser usada como
        // veio: `checkoutPendente` está no localStorage, que a própria pessoa
        // (ou um script de terceiro) consegue editar, e um endereço qualquer
        // aqui viraria redirecionamento aberto logo depois do login.
        let origem = null;
        try {
            origem = JSON.parse(pendente).origem;
        } catch {
            origem = null;
        }
        return (origem === 'curso.html' ? 'curso.html' : 'index.html') + '?retomar=1';
    };

    // ==========================================
    // AVISO DE CHECKOUT PENDENTE (veio do botão "Assinar agora")
    // ==========================================
    const checkoutSolicitado = new URLSearchParams(location.search).get('checkout') === '1';
    if (checkoutSolicitado) {
        // Quem veio de um plano pago e ainda não tem conta precisa passar
        // primeiro pelo cadastro completo que já existia no projeto. Ele grava
        // e-mail, WhatsApp e OAB no servidor antes de enviar o código de acesso.
        window.showRegisterForm();
        const tituloCadastro = document.querySelector('.login-container h2');
        const botaoCadastro = document.querySelector('#registerForm .login-btn');
        if (tituloCadastro) tituloCadastro.textContent = 'Dados para contato';
        if (botaoCadastro) botaoCadastro.textContent = 'Salvar e confirmar e-mail';
        const grupoOab = document.getElementById('register-oab-grupo');
        const dicaOab = document.getElementById('register-oab-dica');
        const campoOab = document.getElementById('register-oab');
        if (grupoOab) grupoOab.style.display = '';
        if (dicaOab) dicaOab.style.display = '';
        if (campoOab) campoOab.required = true;
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
            aviso.textContent = 'Informe seu e-mail e WhatsApp. Salvamos o contato, confirmamos o e-mail e abrimos o pagamento.';
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
    // Entrada por código enviado ao e-mail. O campo pedia "celular ou e-mail",
    // mas o envio por SMS está desligado no servidor: quem digitava o telefone
    // só descobria isso depois de tentar. Agora o campo é de e-mail.
    // "Receber código por e-mail" abre o campo ali mesmo, sem trocar de tela:
    // duas opções à vista, e a segunda se desdobra quando escolhida.
    const btnMostrarCodigo = document.getElementById('btn-mostrar-codigo');
    if (btnMostrarCodigo) {
        btnMostrarCodigo.addEventListener('click', function () {
            const bloco = document.getElementById('bloco-codigo');
            const campo = document.getElementById('login-telefone');
            if (!bloco) return;
            bloco.style.display = 'block';
            btnMostrarCodigo.classList.add('ativo');
            if (campo) campo.focus();
        });
    }

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const campo = document.getElementById('login-telefone');
            const messageDiv = document.getElementById('login-message');
            if (!campo) return;

            const destino = campo.value.trim();
            if (!destino) {
                messageDiv.style.color = '#ef4444';
                messageDiv.textContent = '✗ Informe seu e-mail';
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

            // A senha saiu da tela: a conta nasce sem ela e a entrada é por
            // código no e-mail ou pelo Google. As validações abaixo só valem
            // para quem ainda vê os campos (outra página que os use).
            if (senha) {
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
            }

            if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
                messageDiv.style.color = '#ef4444';
                messageDiv.textContent = '✗ Informe um e-mail válido — é nele que chega seu código';
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
                    senha: senha,
                    origem: checkoutSolicitado ? 'checkout' : 'cadastro'
                })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    messageDiv.style.color = '#10b981';
                    messageDiv.textContent = '✓ Conta criada com sucesso! Redirecionando...';

                    // A conta nasce sem senha, então não há como logar sozinho
                    // com credenciais: em vez disso, manda-se o código para o
                    // e-mail recém-cadastrado e a pessoa entra por ele. É o
                    // mesmo passo que confirma que o endereço existe.
                    messageDiv.style.color = '#10b981';
                    messageDiv.textContent = '✓ Conta criada. Enviando seu código de acesso...';

                    if (typeof showOtpForm === 'function') showOtpForm();
                    const campoDestino = document.getElementById('otp-destino-input');
                    if (campoDestino) campoDestino.value = email;
                    iniciarOtp(email, document.getElementById('otp-btn-enviar'));
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
        // O id existe só para dar alça ao CSS: o estilo daqui é inline, e
        // inline vence folha de estilo. O painel repinta este botão na sua
        // paleta pelo #chat-bot-btn (com !important, pelo mesmo motivo).
        btn.id = 'chat-bot-btn';
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
        // No painel também não: lá você é o atendente, não o cliente — falar
        // com o próprio WhatsApp não serve para nada.
        const paginasComWhatsAppProprio = [
            'agradecimento-free.html', 'agradecimento-premium.html', 'contato.html', 'admin.html'
        ];
        const paginaAtual = location.pathname.split('/').pop();
        const temWhatsFlutuante = !paginasComWhatsAppProprio.includes(paginaAtual);
        // No painel o bot muda de assunto: em vez de vender plano, ele explica
        // o painel, o banco e o servidor. Quem decide isso é o servidor, pelo
        // "contexto" que vai junto da pergunta.
        const contextoChat = paginaAtual === 'admin.html' ? 'admin' : 'site';

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
        let botMedido = false;   // uma conversa por página, não uma por mensagem

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

            /* O funil quer saber quem falou com o bot, não quanto falou: só o
               primeiro envio da página conta. O texto da pergunta nunca sai
               daqui — vai apenas o fato de ter havido conversa. */
            if (!botMedido && window.telemetriaEvento) {
                botMedido = true;
                window.telemetriaEvento('bot_conversou');
            }

            conversaAtiva = true;
            addMsg(text, 'user');
            input.value = '';

            chatHistory.push({ role: 'user', content: text });

            try {
                const r = await fetch(apiUrl('/gpt.php'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ messages: chatHistory, contexto: contextoChat })
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
                /* coluna, e não linha: com o eixo principal na vertical, a
                   margem automática do modal centraliza sem cortar. Com
                   align-items:center, o que passa da altura da tela fica
                   ACIMA da área rolável e não há como alcançar — era assim
                   que o cabeçalho sumia no celular. */
                display: none; flex-direction: column; align-items: center;
                padding: 1.5rem;
                background: rgba(6, 6, 8, 0.72);
                backdrop-filter: blur(6px);
                -webkit-backdrop-filter: blur(6px);
                overflow-y: auto;
                -webkit-overflow-scrolling: touch;
            }
            .pay-overlay.aberto { display: flex; }

            .pay-modal {
                position: relative;
                width: 100%; max-width: 430px;
                /* centraliza quando cabe; encosta no topo e rola quando não cabe */
                margin: auto;
                /* o modal nunca passa da tela: quem rola é o corpo, por dentro,
                   então o cabeçalho e o botão de pagar ficam sempre visíveis */
                max-height: calc(100dvh - 3rem);
                display: flex; flex-direction: column;
                background: #131315;
                border: 1px solid #2a2a2e;
                border-radius: 20px;
                color: #f5f5f5;
                font-family: 'Inter', system-ui, -apple-system, sans-serif;
                box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
                overflow: hidden;
                animation: paySobe 0.28s cubic-bezier(0.16, 1, 0.3, 1);
            }
            /* navegador sem dvh: cai no vh, que erra a barra de endereço do
               iOS por alguns pixels, mas não deixa o modal maior que a tela */
            @supports not (height: 100dvh) {
                .pay-modal { max-height: calc(100vh - 3rem); }
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

            /* é o corpo que rola, não a página: o cabeçalho fica parado em
               cima e o botão de pagar continua alcançável */
            .pay-head { flex-shrink: 0; }
            .pay-corpo {
                padding: 1.5rem;
                overflow-y: auto;
                -webkit-overflow-scrolling: touch;
            }

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

            /* 600px, e não 480: aparelhos de 540 a 600 ficavam de fora e
               recebiam o layout de computador espremido */
            /* celular: tela cheia, pelo mesmo motivo da caixa do gratuito —
               em caixa flutuante o rodapé com o botão de pagar saía da tela */
            @media (max-width: 600px) {
                .pay-overlay { padding: 0; align-items: stretch; overflow: hidden; }
                .pay-modal {
                    max-width: none;
                    width: 100%;
                    height: 100dvh;
                    max-height: none;
                    margin: 0;
                    border: none;
                    border-radius: 0;
                }
                @supports not (height: 100dvh) {
                    .pay-modal { height: 100vh; }
                }
                .pay-head { padding: 1.1rem 1.15rem; }
                /* o respiro de baixo tira o botão de trás da barra do navegador */
                .pay-corpo { padding: 1.15rem 1.15rem 3.5rem; }
                .pay-linha { flex-direction: column; gap: 0; }
                /* abaixo de 16px o Safari dá zoom na página inteira quando o
                   dedo toca no campo, e o modal sai do lugar */
                .pay-campo input { font-size: 16px; }
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

                <div id="checkout-agenda">
                    <div class="pay-resumo-rotulo">Escolha o horário do atendimento</div>
                    <div id="checkout-horarios" style="margin-top:.8rem;color:#8a8a90">Carregando horários disponíveis…</div>
                    <button type="button" class="pay-btn" id="checkout-continuar" disabled style="margin-top:1rem">Continuar para o pagamento</button>
                    <div class="pay-msg" id="checkout-status"></div>
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
        const msg = modal.querySelector('#checkout-status');
        const horariosCheckout = modal.querySelector('#checkout-horarios');
        const continuarCheckout = modal.querySelector('#checkout-continuar');
        let checkoutAtual = null;
        let horarioEscolhido = null;

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

        /**
         * Leva ao Mercado Pago.
         *
         * O site NÃO recebe dados de cartão. O formulário que existia aqui era
         * um placeholder: validava o formato, esperava 1,6s e anunciava
         * "pagamento confirmado" sem falar com servidor nenhum — ninguém era
         * cobrado e nada chegava ao painel. Além de não cobrar, receber cartão
         * no próprio site traria obrigações de PCI que não se quer ter.
         *
         * Agora o servidor diz qual link usar (um por plano, porque o valor
         * mora dentro do link), e quem confirma o pagamento é o webhook.
         */
        function abrirCheckout(plano, valor) {
            var ehPlus = /plus/i.test(plano || '');
            checkoutAtual = { plano, valor, ehPlus };
            horarioEscolhido = null;
            modal.querySelector('#checkout-plano').textContent = plano;
            modal.querySelector('#checkout-valor').innerHTML =
                'R$ ' + Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) +
                ' <small>/ ' + (ehPlus ? 'mês' : 'dia') + '</small>';
            msg.style.color = '#8a8a90';
            msg.textContent = '';
            overlay.classList.add('aberto');
            document.body.style.overflow = 'hidden';   // trava o fundo enquanto o modal está aberto

            continuarCheckout.disabled = true;
            horariosCheckout.textContent = 'Carregando horários disponíveis…';
            fetch(window.apiUrl('/agenda/horarios'))
                .then(r => r.json())
                .then(d => {
                    const dias = (d && d.dias) || [];
                    horariosCheckout.textContent = '';
                    dias.forEach(dia => {
                        const bloco = document.createElement('div');
                        bloco.style.marginBottom = '.75rem';
                        const titulo = document.createElement('div');
                        titulo.textContent = dia.rotulo || dia.dia;
                        titulo.style.cssText = 'font-size:.82rem;margin-bottom:.35rem;color:#d4d4d8';
                        bloco.appendChild(titulo);
                        (dia.horarios || []).forEach(h => {
                            const b = document.createElement('button');
                            b.type = 'button';
                            b.textContent = h.rotulo;
                            b.style.cssText = 'margin:0 .35rem .35rem 0;padding:.5rem .7rem;border:1px solid rgba(110,231,200,.35);border-radius:8px;background:transparent;color:#d4d4d8;cursor:pointer';
                            b.onclick = function () {
                                horariosCheckout.querySelectorAll('button').forEach(x => x.style.background = 'transparent');
                                b.style.background = 'rgba(110,231,200,.22)';
                                horarioEscolhido = h.inicio;
                                continuarCheckout.disabled = false;
                            };
                            bloco.appendChild(b);
                        });
                        horariosCheckout.appendChild(bloco);
                    });
                    if (!dias.length) horariosCheckout.textContent = 'Não há horários disponíveis agora.';
                })
                .catch(() => { horariosCheckout.textContent = 'Não foi possível carregar os horários.'; });
        }

        continuarCheckout.onclick = function () {
            if (!checkoutAtual || !horarioEscolhido) return;
            continuarCheckout.disabled = true;
            msg.textContent = 'Salvando plano e horário…';
            const usuario = getUsuarioLogado();
            fetch(window.apiUrl('/pagamento/iniciar'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    plano: checkoutAtual.ehPlus ? 'plus' : 'premium',
                    usuario_id: usuario && usuario.id,
                    email: usuario && usuario.email,
                    inicio: horarioEscolhido
                })
            })
                .then(function (r) { return r.json(); })
                .then(function (d) {
                    if (d && d.success && d.url) {
                        if (window.telemetriaEvento) {
                            window.telemetriaEvento('checkout_iniciado', {
                                plano: checkoutAtual.plano,
                                dados: { valor: Number(checkoutAtual.valor) }
                            });
                        }
                        window.location.href = d.url;
                        return;
                    }
                    msg.style.color = '#ffb020';
                    msg.textContent = (d && d.error) ||
                        'Não foi possível abrir o pagamento agora.';
                })
                .catch(function () {
                    continuarCheckout.disabled = false;
                    msg.style.color = '#ff6b5e';
                    msg.textContent = 'Sem conexão com o servidor. Tente de novo.';
                });
        };

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

        // O formulário de cartão sai da tela: quem pede cartão é o Mercado
        // Pago, na página dele. Sobra o resumo do plano e o aviso de que o
        // cliente está sendo levado para lá. O <form> continua no HTML para
        // não quebrar as referências de campo criadas acima.
        var formCartao = modal.querySelector('#checkout-form');
        if (formCartao) {
            formCartao.style.display = 'none';
            formCartao.addEventListener('submit', function (e) { e.preventDefault(); });
        }

        botoesPlano.forEach(btn => {
            btn.addEventListener('click', () => {
                const usuario = getUsuarioLogado();
                if (!usuario) {
                    // Guarda o plano escolhido para retomar o checkout
                    // automaticamente assim que a pessoa logar ou se cadastrar.
                    const checkoutPendente = JSON.stringify({
                        plano: btn.dataset.plano,
                        valor: btn.dataset.valor,
                        em: Date.now()
                    });
                    // Alguns navegadores móveis descartam sessionStorage ao
                    // passar pelo login social. O fallback só guarda o plano,
                    // o valor e o horário — nenhum dado pessoal ou de cartão.
                    sessionStorage.setItem('checkoutPendente', checkoutPendente);
                    localStorage.setItem('checkoutPendente', checkoutPendente);
                    window.location.href = 'login.html?checkout=1';
                    return;
                }
                abrirCheckout(btn.dataset.plano, btn.dataset.valor);
            });
        });

        // ------------------------------------------
        // SUPORTE GRÁTIS — identificação, conferência e só então a agenda
        //
        // São dois passos, e a ordem importa: primeiro a pessoa se identifica,
        // e o atendimento fica retido até você conferir a inscrição no CNA.
        // Só quem já foi conferido antes cai direto na escolha do horário.
        //
        // Antes o botão levava para contato.html: a pessoa ia embora para a
        // conversa, nada ficava registrado e não havia como saber quem já
        // tinha usado o gratuito — nem se era mesmo advogado.
        // ------------------------------------------
        const btnFree = document.getElementById('btn-suporte-free');
        if (btnFree) {
            const UFS_BR = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
                            'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

            // O visual segue o card da tela de login: mesma moldura, mesma
            // borda em degradê correndo, mesmos campos.
            const estiloFree = document.createElement('style');
            estiloFree.textContent = `
                /* a borda animada depende destes dois, que só existiam no
                   login.html — aqui a caixa é montada por JS noutra página */
                @property --border-angle {
                    syntax: '<angle>';
                    inherits: false;
                    initial-value: 0deg;
                }
                @keyframes borderRun { to { --border-angle: 360deg; } }

                .free-overlay {
                    position: fixed; inset: 0; z-index: 10000;
                    /* mesma razão do modal de pagamento: em coluna, o que não
                       cabe fica abaixo e rola. Com align-items:center, o topo
                       do cartão saía da área rolável e sumia no celular. */
                    display: none; flex-direction: column; align-items: center;
                    padding: 1.5rem;
                    background: rgba(6, 6, 8, 0.72);
                    backdrop-filter: blur(6px);
                    overflow-y: auto;
                    -webkit-overflow-scrolling: touch;
                }
                .free-overlay.aberto { display: flex; }

                .free-card {
                    position: relative;
                    display: flex; flex-direction: column;
                    box-sizing: border-box;
                    max-width: 520px; width: 100%;
                    background: var(--bg-secondary, #161618);
                    border: 1px solid var(--border-color, #2a2a2e);
                    border-radius: 16px;
                    padding: 2.5rem 2.5rem 2rem;
                    margin: auto;
                }
                .free-card > * { position: relative; z-index: 1; width: 100%; }
                .free-card::after {
                    content: '';
                    position: absolute; inset: 0;
                    border-radius: inherit; padding: 1px;
                    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
                    -webkit-mask-composite: xor;
                    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
                    mask-composite: exclude;
                    pointer-events: none;
                    animation: borderRun 4s linear infinite;
                    background: conic-gradient(from var(--border-angle),
                        transparent 0deg, transparent 190deg,
                        rgba(79, 163, 255, 0) 210deg,
                        #1f6fd1 250deg, #6ee7c8 300deg, #fff 330deg,
                        #4fa3ff 350deg, rgba(110, 231, 200, 0) 360deg);
                    opacity: 0.6;
                    filter: drop-shadow(0 0 2px rgba(79, 163, 255, 0.5));
                }

                /* o mesmo halo pulsante do ícone da tela de login; sem ele o
                   quadrado ficava chapado ao lado do resto da caixa */
                @keyframes freeIconeGlow {
                    0%, 100% { box-shadow: 0 0 20px rgba(110, 231, 200, 0.15); }
                    50%      { box-shadow: 0 0 40px rgba(110, 231, 200, 0.4); }
                }
                .free-icone {
                    display: flex; align-items: center; justify-content: center;
                    width: 68px; height: 68px; margin: 0 auto 1.4rem;
                    border-radius: 18px;
                    background: rgba(110, 231, 200, 0.12);
                    border: 1px solid rgba(110, 231, 200, 0.25);
                    color: #6ee7c8; font-size: 2rem;
                    animation: freeIconeGlow 3.2s ease-in-out infinite;
                }
                @media (prefers-reduced-motion: reduce) {
                    .free-icone { animation: none; }
                }
                .free-card h2 {
                    font-family: 'Outfit', sans-serif;
                    font-size: 1.8rem; text-align: center; margin-bottom: 0.5rem;
                }
                .free-card h2 span {
                    background: linear-gradient(135deg, #6ee7c8, #4fa3ff);
                    -webkit-background-clip: text; background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
                .free-sub {
                    text-align: center; color: var(--text-secondary, #a1a1a8);
                    font-size: 0.92rem; margin-bottom: 1.8rem;
                }

                .free-grupo { display: flex; flex-direction: column; margin-bottom: 1.1rem; flex: 1; min-width: 0; }
                .free-grupo label { margin-bottom: 0.5rem; font-size: 0.9rem; color: var(--text-secondary, #a1a1a8); }
                .free-grupo input, .free-grupo select {
                    width: 100%; box-sizing: border-box;
                    padding: 1rem 1.25rem;
                    background: var(--bg-card, #1c1c1f);
                    border: 1px solid var(--border-color, #2a2a2e);
                    border-radius: 12px;
                    color: var(--text-primary, #fff);
                    font-size: 1rem; font-family: inherit;
                    transition: all 0.3s ease;
                }
                .free-grupo input::placeholder { color: var(--text-muted, #55555c); }
                .free-grupo input:focus, .free-grupo select:focus {
                    outline: none; border-color: #6ee7c8;
                    box-shadow: 0 0 0 3px rgba(110, 231, 200, 0.1);
                }
                .free-linha { display: flex; gap: 1rem; }
                .free-linha .free-uf { flex: 0 0 7.5rem; }

                /* ---- grade de dias e horários ---- */
                .free-rotulo {
                    font-size: 0.9rem;
                    color: var(--text-secondary, #a1a1a8);
                    margin-bottom: 0.7rem;
                }
                .free-dias {
                    display: flex; gap: 0.6rem;
                    overflow-x: auto;
                    padding-bottom: 0.5rem;
                    margin-bottom: 1.4rem;
                    scroll-snap-type: x mandatory;
                    -webkit-overflow-scrolling: touch;
                }
                .free-dias::-webkit-scrollbar { height: 4px; }
                .free-dias::-webkit-scrollbar-thumb {
                    background: rgba(110, 231, 200, 0.3); border-radius: 4px;
                }
                .free-dia {
                    flex: 0 0 auto;
                    scroll-snap-align: start;
                    display: flex; flex-direction: column;
                    align-items: center; gap: 0.1rem;
                    min-width: 4.6rem;
                    padding: 0.75rem 0.6rem;
                    background: var(--bg-card, #1c1c1f);
                    border: 1px solid var(--border-color, #2a2a2e);
                    border-radius: 14px;
                    color: var(--text-primary, #fff);
                    font-family: inherit; cursor: pointer;
                    transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease;
                }
                .free-dia:hover { border-color: rgba(110, 231, 200, 0.5); transform: translateY(-2px); }
                .free-dia.ativo {
                    border-color: #6ee7c8;
                    background: rgba(110, 231, 200, 0.1);
                    box-shadow: 0 0 0 3px rgba(110, 231, 200, 0.12);
                }
                .free-dia-sem {
                    font-size: 0.68rem; letter-spacing: 0.06em;
                    color: var(--text-muted, #8a8a90);
                }
                .free-dia-num {
                    font-family: 'Outfit', sans-serif;
                    font-size: 1.35rem; font-weight: 700; line-height: 1.1;
                }
                .free-dia-mes {
                    font-size: 0.7rem; color: var(--text-muted, #8a8a90);
                }
                .free-dia-vagas {
                    margin-top: 0.25rem;
                    font-size: 0.62rem; color: #6ee7c8;
                }
                .free-dia.ativo .free-dia-sem,
                .free-dia.ativo .free-dia-mes { color: var(--text-secondary, #a1a1a8); }

                .free-horas {
                    display: flex; flex-wrap: wrap; gap: 0.5rem;
                    margin-bottom: 1.6rem;
                }
                .free-hora {
                    padding: 0.6rem 1rem;
                    background: var(--bg-card, #1c1c1f);
                    border: 1px solid var(--border-color, #2a2a2e);
                    border-radius: 10px;
                    color: var(--text-primary, #fff);
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 0.88rem; cursor: pointer;
                    transition: border-color 0.2s ease, background 0.2s ease;
                }
                .free-hora:hover { border-color: rgba(110, 231, 200, 0.5); }
                .free-hora.ativo {
                    border-color: #6ee7c8;
                    background: rgba(110, 231, 200, 0.14);
                    color: #6ee7c8; font-weight: 700;
                }

                .free-btn {
                    width: 100%; padding: 1rem;
                    background: linear-gradient(135deg, #21b98f, #6ee7c8);
                    color: #062018; border: none; border-radius: 12px;
                    font-size: 1rem; font-weight: 700; cursor: pointer;
                    font-family: inherit; transition: all 0.3s ease;
                }
                .free-btn:hover:not(:disabled) {
                    transform: translateY(-2px);
                    box-shadow: 0 15px 30px rgba(110, 231, 200, 0.3);
                }
                .free-btn:disabled { opacity: 0.6; cursor: default; }

                .free-msg { margin-top: 1rem; text-align: center; font-size: 0.86rem; min-height: 1.2em; }
                .free-fechar {
                    position: absolute; top: 1rem; right: 1.2rem;
                    width: auto;
                    background: none; border: none; color: #8a8a90;
                    font-size: 1.6rem; line-height: 1; cursor: pointer;
                    padding: 0 4px; z-index: 2;
                }
                .free-fechar:hover { color: #f5f5f5; }

                /* aviso de espera: a pessoa saiu da tela sem hora marcada */
                .free-aviso {
                    text-align: center; line-height: 1.7;
                    color: var(--text-secondary, #a1a1a8); font-size: 0.95rem;
                }
                .free-aviso strong { color: #6ee7c8; }

                /* ---- celular: folha em tela cheia ----
                   São cinco campos, mais a grade de dias e as fichas de
                   horário. Numa tela de 360px isso não cabe em caixa flutuante
                   de jeito nenhum — e o que não cabia ficava fora do alcance
                   do dedo, com o botão de enviar escondido.

                   Em tela cheia não há como transbordar: a folha ocupa a
                   janela inteira e o conteúdo rola dentro dela. */
                @media (max-width: 600px) {
                    .free-overlay {
                        padding: 0;
                        align-items: stretch;
                        overflow: hidden;          /* quem rola é a folha */
                    }
                    .free-card {
                        max-width: none;
                        width: 100%;
                        height: 100dvh;
                        max-height: none;
                        margin: 0;
                        border: none;
                        border-radius: 0;
                        /* o respiro de baixo tira o botão de trás da barra do
                           navegador, que no celular cobre o rodapé da página */
                        padding: 1.75rem 1.25rem 4rem;
                        overflow-y: auto;
                        -webkit-overflow-scrolling: touch;
                        overscroll-behavior: contain;
                    }
                    /* a borda animada é posicionada sobre a caixa inteira; num
                       container que rola ela fica parada enquanto o conteúdo
                       anda, e aparece cortando o texto */
                    .free-card::after { display: none; }

                    .free-icone { width: 52px; height: 52px; font-size: 1.5rem; margin-bottom: 1rem; }
                    .free-card h2 { font-size: 1.45rem; }
                    .free-sub { font-size: 0.86rem; margin-bottom: 1.25rem; }
                    .free-grupo { margin-bottom: 0.9rem; }
                    .free-linha { flex-direction: column; gap: 0; }
                    .free-linha .free-uf { flex: 1; }
                    /* abaixo de 16px o Safari dá zoom na página ao tocar no
                       campo, e a folha sai do lugar */
                    .free-grupo input, .free-grupo select {
                        font-size: 16px;
                        padding: 0.85rem 1rem;
                    }
                    .free-fechar { top: 0.75rem; right: 0.9rem; font-size: 1.8rem; }
                    .free-dia { min-width: 4.1rem; padding: 0.6rem 0.5rem; }
                    .free-hora { padding: 0.7rem 0.9rem; }
                }
                @supports not (height: 100dvh) {
                    @media (max-width: 600px) {
                        .free-card { height: 100vh; }
                    }
                }
            `;
            document.head.appendChild(estiloFree);

            const overlayFree = document.createElement('div');
            overlayFree.className = 'free-overlay';
            overlayFree.innerHTML = `
                <div class="free-card" role="dialog" aria-modal="true" aria-labelledby="free-titulo">
                    <button type="button" class="free-fechar" id="free-close" aria-label="Fechar">&times;</button>
                    <div class="free-icone"><i class="fas fa-headset"></i></div>
                    <h2 id="free-titulo">1 <span>suporte grátis</span></h2>
                    <p class="free-sub" id="free-sub">Um por inscrição na OAB. Preencha seus dados para solicitar.</p>

                    <form id="free-form-id" novalidate>
                        <div class="free-grupo">
                            <label for="free-nome">Nome completo</label>
                            <input id="free-nome" placeholder="Como está na sua inscrição" autocomplete="name" required>
                        </div>
                        <div class="free-linha">
                            <div class="free-grupo">
                                <label for="free-inscricao">Número da inscrição</label>
                                <input id="free-inscricao" inputmode="numeric" placeholder="123456" autocomplete="off" required>
                            </div>
                            <div class="free-grupo free-uf">
                                <label for="free-uf">Seccional</label>
                                <select id="free-uf"></select>
                            </div>
                        </div>
                        <div class="free-grupo">
                            <label for="free-whats">WhatsApp</label>
                            <input id="free-whats" inputmode="tel" placeholder="(DDD) 99999-9999" autocomplete="tel" required>
                        </div>
                        <div class="free-grupo">
                            <label for="free-email">E-mail</label>
                            <input id="free-email" type="email" placeholder="seu@email.com" autocomplete="email" required>
                        </div>
                        <button type="submit" class="free-btn" id="free-enviar-id">Continuar</button>
                    </form>

                    <form id="free-form-agenda" novalidate style="display:none;">
                        <div class="free-rotulo">Escolha o dia</div>
                        <div class="free-dias" id="free-dias"></div>
                        <div class="free-rotulo">Escolha o horário</div>
                        <div class="free-horas" id="free-horas"></div>
                        <button type="submit" class="free-btn" id="free-enviar-agenda">Marcar meu atendimento</button>
                    </form>

                    <div id="free-espera" style="display:none;"></div>
                    <div class="free-msg" id="free-msg"></div>
                </div>
            `;
            document.body.appendChild(overlayFree);

            const q = s => overlayFree.querySelector(s);
            const formId = q('#free-form-id');
            const formAgenda = q('#free-form-agenda');
            const blocoEspera = q('#free-espera');
            const msg = q('#free-msg');
            const selUf = q('#free-uf');
            const gradeDias = q('#free-dias');
            const gradeHoras = q('#free-horas');

            selUf.innerHTML = '<option value="">UF</option>' +
                UFS_BR.map(u => `<option value="${u}">${u}</option>`).join('');

            let agenda = [];
            let verificacaoId = null;

            const aviso = (texto, cor) => {
                msg.style.color = cor || '#8a8a90';
                msg.textContent = texto;
            };

            const fecharFree = () => {
                overlayFree.classList.remove('aberto');
                document.body.style.overflow = '';
            };

            function mostrarPasso(qual) {
                formId.style.display = qual === 'identificacao' ? 'block' : 'none';
                formAgenda.style.display = qual === 'agenda' ? 'block' : 'none';
                blocoEspera.style.display = qual === 'espera' ? 'block' : 'none';
            }

            function mostrarEspera(texto) {
                blocoEspera.textContent = '';
                const p = document.createElement('p');
                p.className = 'free-aviso';
                p.textContent = texto;
                blocoEspera.appendChild(p);
                mostrarPasso('espera');
                q('#free-sub').textContent = 'Pedido recebido';
            }

            // ---- passo 1: identificação ----
            formId.addEventListener('submit', function (e) {
                e.preventDefault();
                const nome = q('#free-nome').value.trim();
                const inscricao = q('#free-inscricao').value.replace(/\D/g, '');
                const uf = selUf.value;
                const whats = q('#free-whats').value.replace(/\D/g, '');
                const email = q('#free-email').value.trim();
                const botao = q('#free-enviar-id');

                if (nome.length < 5) { aviso('Informe seu nome completo.', '#ff6b5e'); return; }
                if (!inscricao || inscricao.length > 6) { aviso('Informe o número da inscrição (até 6 dígitos).', '#ff6b5e'); return; }
                if (!uf) { aviso('Escolha a seccional.', '#ff6b5e'); return; }
                if (whats.length < 10) { aviso('Informe o WhatsApp com DDD.', '#ff6b5e'); return; }
                if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { aviso('Informe um e-mail válido.', '#ff6b5e'); return; }

                botao.disabled = true;
                aviso('Conferindo...');

                fetch(apiUrl('/verificacao/solicitar'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nome, inscricao, uf, contato: whats, email })
                })
                .then(r => r.json())
                .then(data => {
                    botao.disabled = false;

                    if (data.situacao === 'liberado') {
                        verificacaoId = data.verificacao_id;
                        aviso('');
                        q('#free-sub').textContent = 'Tudo certo. Escolha o horário.';
                        mostrarPasso('agenda');
                        carregarAgenda();
                        return;
                    }

                    if (data.situacao === 'pendente') {
                        mostrarEspera(data.msg ||
                            'Recebemos seu pedido. Conferimos sua inscrição na OAB e avisamos por e-mail.');
                        aviso('');
                        return;
                    }

                    // ja_usou e recusado terminam aqui
                    aviso(data.error || 'Não foi possível seguir.', '#ff6b5e');
                })
                .catch(() => {
                    botao.disabled = false;
                    aviso('Erro de conexão com o servidor.', '#ff6b5e');
                });
            });

            // ---- passo 2: agenda em grade, no estilo de reserva ----
            // Só aparece o que está de fato livre: a lista é calculada pelo
            // servidor, que é o único que enxerga o que já foi marcado. No
            // navegador, duas pessoas veriam a mesma vaga como disponível.
            let diaEscolhido = null;
            let horaEscolhida = null;

            function pintarDias() {
                gradeDias.textContent = '';
                agenda.forEach(d => {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.className = 'free-dia' + (d.dia === diaEscolhido ? ' ativo' : '');
                    b.innerHTML =
                        '<span class="free-dia-sem"></span>' +
                        '<span class="free-dia-num"></span>' +
                        '<span class="free-dia-mes"></span>' +
                        '<span class="free-dia-vagas"></span>';
                    b.querySelector('.free-dia-sem').textContent = d.semana;
                    b.querySelector('.free-dia-num').textContent = d.numero;
                    b.querySelector('.free-dia-mes').textContent = d.mes;
                    b.querySelector('.free-dia-vagas').textContent =
                        d.vagas === 1 ? '1 vaga' : d.vagas + ' vagas';
                    b.addEventListener('click', () => {
                        diaEscolhido = d.dia;
                        horaEscolhida = null;
                        pintarDias();
                        pintarHoras();
                    });
                    gradeDias.appendChild(b);
                });
            }

            function pintarHoras() {
                gradeHoras.textContent = '';
                const d = agenda.find(x => x.dia === diaEscolhido);
                if (!d) return;
                d.horarios.forEach(h => {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.className = 'free-hora' + (h.inicio === horaEscolhida ? ' ativo' : '');
                    b.textContent = h.rotulo;
                    b.addEventListener('click', () => {
                        horaEscolhida = h.inicio;
                        pintarHoras();
                        aviso('');
                    });
                    gradeHoras.appendChild(b);
                });
            }

            function carregarAgenda() {
                gradeDias.textContent = 'Carregando...';
                gradeHoras.textContent = '';
                return fetch(apiUrl('/agenda/horarios'))
                    .then(r => r.json())
                    .then(d => {
                        agenda = (d && d.dias) || [];
                        diaEscolhido = agenda.length ? agenda[0].dia : null;
                        horaEscolhida = null;
                        if (!agenda.length) {
                            gradeDias.textContent = '';
                            aviso('Não há horário livre nos próximos dias. Fale conosco pelo WhatsApp.', '#ff6b5e');
                            return;
                        }
                        pintarDias();
                        pintarHoras();
                    })
                    .catch(() => aviso('Não foi possível carregar a agenda.', '#ff6b5e'));
            }

            formAgenda.addEventListener('submit', function (e) {
                e.preventDefault();
                if (!horaEscolhida) { aviso('Escolha o dia e o horário.', '#ff6b5e'); return; }

                const botao = q('#free-enviar-agenda');
                const u = getUsuarioLogado();
                botao.disabled = true;
                aviso('Marcando...');

                fetch(apiUrl('/chamado/free'), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        verificacao_id: verificacaoId,
                        inicio: horaEscolhida,
                        usuario_id: u ? u.id : null,
                        descricao: 'Suporte gratuito pedido pela página de planos'
                    })
                })
                .then(r => r.json())
                .then(data => {
                    botao.disabled = false;
                    if (!data.success) {
                        aviso(data.error || 'Não foi possível marcar.', '#ff6b5e');
                        // o horário foi tomado enquanto ela preenchia
                        if (data.recarregar_agenda) carregarAgenda();
                        return;
                    }
                    aviso('Atendimento marcado! Abrindo o WhatsApp...', '#6ee7c8');
                    setTimeout(() => {
                        fecharFree();
                        window.location.href = 'agradecimento-free.html'
                            + '?oab=' + encodeURIComponent(q('#free-inscricao').value.replace(/\D/g, '') + '/' + selUf.value)
                            + '&quando=' + encodeURIComponent(data.inicio);
                    }, 1200);
                })
                .catch(() => {
                    botao.disabled = false;
                    aviso('Erro de conexão com o servidor.', '#ff6b5e');
                });
            });

            // ---- abertura ----
            btnFree.addEventListener('click', () => {
                const u = getUsuarioLogado();
                if (u && u.nome) q('#free-nome').value = u.nome;
                if (u && u.email) q('#free-email').value = u.email;
                if (u && u.telefone) q('#free-whats').value = u.telefone;
                if (u && u.oab) {
                    const partes = String(u.oab).split('/');
                    q('#free-inscricao').value = (partes[0] || '').replace(/\D/g, '');
                    if (partes[1]) selUf.value = partes[1].toUpperCase();
                }

                verificacaoId = null;
                mostrarPasso('identificacao');
                q('#free-sub').textContent = 'Um por inscrição na OAB. Preencha seus dados para solicitar.';
                aviso('');
                overlayFree.classList.add('aberto');
                document.body.style.overflow = 'hidden';
                setTimeout(() => q('#free-nome').focus(), 60);
            });

            q('#free-close').onclick = fecharFree;
            overlayFree.addEventListener('click', e => {
                if (e.target === overlayFree) fecharFree();
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
        //   3) o pendente só é apagado ao abrir ou quando expira
        const RETOMADA_TTL = 10 * 60 * 1000;
        const querRetomar = new URLSearchParams(location.search).get('retomar') === '1';
        const pendenteBruto = sessionStorage.getItem('checkoutPendente') ||
            localStorage.getItem('checkoutPendente');

        if (querRetomar) {
            // tira a marca da barra de endereço para um F5 não reabrir o modal
            const params = new URLSearchParams(location.search);
            params.delete('retomar');
            const q = params.toString();
            history.replaceState({}, '', location.pathname + (q ? '?' + q : ''));
        }

        if (pendenteBruto) {
            try {
                const { plano, valor, em } = JSON.parse(pendenteBruto);
                const recente = em && (Date.now() - em) < RETOMADA_TTL;
                if (querRetomar && recente && getUsuarioLogado()) {
                    // Consome a intenção somente quando o checkout realmente
                    // vai abrir. Uma visita intermediária à home não pode mais
                    // apagar a compra iniciada antes do cadastro/login.
                    sessionStorage.removeItem('checkoutPendente');
                    localStorage.removeItem('checkoutPendente');
                    abrirCheckout(plano, valor);
                } else if (!recente) {
                    sessionStorage.removeItem('checkoutPendente');
                    localStorage.removeItem('checkoutPendente');
                }
            } catch {
                sessionStorage.removeItem('checkoutPendente');
                localStorage.removeItem('checkoutPendente');
            }
        }
    })();
});
