/* ==========================================================
   admin/app.js — login, navegação e atualização automática
   ==========================================================
   O polling de 30 segundos vale só para o que muda sozinho e exige ação:
   a fila de verificação e os chamados abertos. Cadastros, agenda e estado
   do servidor só recarregam quando você pede — atualizar tudo a cada meio
   minuto seria trafegar a base inteira para ver o mesmo número.

   O "atualizado às" fica sempre visível: sem ele não dá para saber se a
   tela está viva ou congelou numa falha de rede.
   ========================================================== */
(function (global) {
    'use strict';

    var D = global.AdminDom;
    var el = D.el;
    var API = global.AdminApi;

    var POLLING_MS = 30000;
    var telaLogin, telaPainel, relogio, tempoPolling;

    // ---------------- login ----------------
    function ligarLogin() {
        var form = document.getElementById('form-login');
        var campoSenha = document.getElementById('senha');
        var campoCodigo = document.getElementById('codigo');
        var blocoCodigo = document.getElementById('campo-codigo');
        var erro = document.getElementById('erro-login');
        var botao = document.getElementById('btn-entrar');
        var botaoTexto = document.getElementById('btn-entrar-texto');

        // Aberto com duplo clique no arquivo? Não há servidor para chamar.
        if (location.protocol === 'file:') {
            erro.textContent = 'Abra pelo servidor: http://localhost:3000/admin.html';
            return;
        }

        function ocupado(sim) {
            botao.disabled = sim;
            botaoTexto.textContent = sim ? 'Conferindo...' : 'Entrar no painel';
        }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (!campoSenha.value) { erro.textContent = 'Digite a senha do painel'; return; }
            erro.textContent = '';
            ocupado(true);

            API.entrar(campoSenha.value, campoCodigo.value.trim())
                .then(function (d) {
                    ocupado(false);
                    if (!d.success) {
                        erro.textContent = d.error || 'Não foi possível entrar';
                        if (d.precisa_codigo) {
                            blocoCodigo.style.display = 'block';
                            campoCodigo.value = '';
                            campoCodigo.focus();
                            return;
                        }
                        campoSenha.select();
                        return;
                    }
                    // Nada é guardado aqui: a sessão veio em cookie httpOnly,
                    // que este script não lê nem precisa ler.
                    campoSenha.value = '';
                    abrirPainel();
                })
                .catch(function () {
                    ocupado(false);
                    erro.textContent = 'Não consegui falar com o servidor.';
                });
        });

        document.getElementById('ver-senha').onclick = function () {
            var vendo = campoSenha.type === 'text';
            campoSenha.type = vendo ? 'password' : 'text';
            this.setAttribute('aria-label', vendo ? 'Mostrar senha' : 'Ocultar senha');
            campoSenha.focus();
        };
    }

    // ---------------- navegação ----------------
    // A ordem conta a esteira: confere a OAB, tria, e só então o trabalho na
    // fila de chamados. "Cadastros e agenda" fecha a fila, depois de "Servidor
    // e banco": é aba na barra, mas abre o modal em vez de trocar de seção
    // (mostrarAba, abaixo). A SECTION é a mesma de sempre, com os mesmos ids;
    // só a moldura ao redor mudou. Nada do fluxo (server.js, cadastros.js)
    // foi tocado.
    var ABAS = [
        { id: 'verificacao',  rotulo: 'Verificação de OAB' },
        { id: 'triagem',      rotulo: 'Triagem' },
        { id: 'chamados',     rotulo: 'Chamados' },
        { id: 'indicadores',  rotulo: 'Indicadores' },
        { id: 'visitantes',   rotulo: 'Visitantes e conversões' },
        { id: 'curso',        rotulo: 'Inscrições do curso' },
        { id: 'sistema',      rotulo: 'Servidor e banco' },
        { id: 'cadastros-tab', rotulo: 'Cadastros e agenda' }
    ];

    function mostrarAba(id) {
        ABAS.forEach(function (a) {
            var secao = document.getElementById('aba-' + a.id);
            var botao = document.getElementById('btn-aba-' + a.id);
            if (a.id === 'cadastros-tab') {
                // Cadastros e agenda: abre o modal em vez de trocar de seção.
                // O modal já carrega via carregar() dentro de ligarModalCadastros.
                if (id === 'cadastros-tab') abrirModalCadastros();
                if (botao) botao.classList.remove('ativa');
                return;
            }
            if (secao) secao.style.display = a.id === id ? 'block' : 'none';
            if (botao) {
                botao.classList.toggle('ativa', a.id === id);
                if (a.id === id) botao.setAttribute('aria-current', 'page');
                else botao.removeAttribute('aria-current');
            }
        });
    }

    function ligarAbas() {
        var barra = document.getElementById('abas');
        D.trocar(barra, ABAS.map(function (a) {
            return el('button.aba', {
                type: 'button',
                id: 'btn-aba-' + a.id,
                'aria-controls': a.id === 'cadastros-tab' ? 'aba-cadastros' : 'aba-' + a.id,
                texto: a.rotulo,
                aoClicar: function () { mostrarAba(a.id); }
            });
        }));
    }

    /**
     * O contador de cada aba, para a esteira ser visível de longe.
     *
     * É o mesmo número andando: sai da Verificação quando você confere, entra
     * na Triagem, e de lá vai para Chamados quando o horário é marcado. Sem
     * isso, o item some de uma aba e você precisa abrir a outra para saber
     * que ele continua existindo.
     *
     * Âmbar quando a vez é sua; cinza quando a bola está com o cliente.
     */
    function marcarAba(id, rotulo, n, urgente) {
        var botao = document.getElementById('btn-aba-' + id);
        if (!botao) return;
        D.trocar(botao, [
            document.createTextNode(rotulo),
            n > 0 ? el('span.aba-selo' + (urgente ? '' : '.calmo'), { texto: String(n) }) : null
        ]);
    }

    global.AdminBadge = marcarAba;

    function marcarHora() {
        if (relogio) relogio.textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR');
    }

    // ---------------- ciclo de vida ----------------
    function atualizarTempoReal() {
        return Promise.all([
            global.AdminFilaVerificacao.recarregar(),
            global.AdminTriagem.recarregar(),
            global.AdminFilaChamados.recarregar()
        ]).then(marcarHora);
    }

    // ---------------- modal de cadastros e agenda ----------------
    // Aberto pela aba "Cadastros e agenda", a última da barra de navegação.
    var modalCadastros, btnAbrirCadastros, btnFecharCadastros, focoAntesDoModal;

    function abrirModalCadastros() {
        if (!modalCadastros) return;
        focoAntesDoModal = document.activeElement;
        modalCadastros.style.display = 'flex';
        modalCadastros.querySelector('.admin-modal-caixa').focus();
        global.AdminCadastros.recarregar();
    }
    function fecharModalCadastros() {
        if (modalCadastros) modalCadastros.style.display = 'none';
        if (focoAntesDoModal && typeof focoAntesDoModal.focus === 'function') focoAntesDoModal.focus();
    }

    function ligarModalCadastros() {
        modalCadastros = document.getElementById('aba-cadastros');
        btnAbrirCadastros = document.getElementById('btn-cadastros');
        btnFecharCadastros = document.getElementById('btn-fechar-cadastros');
        if (!modalCadastros || !btnFecharCadastros) return;

        if (btnAbrirCadastros) btnAbrirCadastros.addEventListener('click', abrirModalCadastros);
        btnFecharCadastros.addEventListener('click', fecharModalCadastros);
        modalCadastros.addEventListener('click', function (e) { if (e.target === modalCadastros) fecharModalCadastros(); });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && modalCadastros.style.display !== 'none') fecharModalCadastros();
        });
    }

    function abrirPainel() {
        telaLogin.style.display = 'none';
        telaPainel.style.display = 'block';
        telaPainel.focus();

        global.AdminFilaVerificacao.montar(
            document.getElementById('aba-verificacao'),
            function (n) { marcarAba('verificacao', 'Verificação de OAB', n, true); }
        );
        global.AdminTriagem.montar(document.getElementById('aba-triagem'));
        global.AdminFilaChamados.montar(document.getElementById('aba-chamados'));
        global.AdminIndicadores.montar(document.getElementById('aba-indicadores'));
        global.AdminVisitantes.montar(document.getElementById('aba-visitantes'));
        global.AdminCurso.montar(document.getElementById('aba-curso'));
        global.AdminCadastros.montar({
            resumo: document.getElementById('resumo'),
            pessoas: document.getElementById('aba-cadastros-pessoas'),
            agenda: document.getElementById('aba-cadastros-agenda'),
            // o alvo é o div interno, não a seção: o bloco de ajuda embaixo
            // é conteúdo fixo e seria apagado a cada redesenho
            diagnostico: document.getElementById('aba-sistema-diag')
        });

        mostrarAba('verificacao');
        marcarHora();

        clearInterval(tempoPolling);
        tempoPolling = setInterval(function () {
            // Aba escondida não precisa de atualização: economiza chamada e
            // não acorda o servidor do Render à toa.
            if (!document.hidden) atualizarTempoReal();
        }, POLLING_MS);
    }

    function voltarAoLogin() {
        clearInterval(tempoPolling);
        telaPainel.style.display = 'none';
        telaLogin.style.display = 'flex';
        var modal = document.getElementById('aba-cadastros');
        if (modal) modal.style.display = 'none';
    }

    document.addEventListener('DOMContentLoaded', function () {
        telaLogin = document.getElementById('tela-login');
        telaPainel = document.getElementById('tela-painel');
        relogio = document.getElementById('atualizado');

        ligarLogin();
        ligarAbas();
        ligarModalCadastros();
        API.aoExpirarSessao(voltarAoLogin);

        // O botão recarregava tudo, mas em silêncio: sem travar, sem dizer que
        // está buscando e sem avisar se falhou. Numa tela que não mudou nada,
        // isso é indistinguível de um botão morto — e era assim que parecia.
        var btnRecarregar = document.getElementById('btn-recarregar');
        if (btnRecarregar) {
            var textoOriginal = btnRecarregar.innerHTML;
            btnRecarregar.onclick = function () {
                if (btnRecarregar.disabled) return;      // clique repetido não empilha
                btnRecarregar.disabled = true;
                btnRecarregar.classList.add('carregando');
                btnRecarregar.innerHTML =
                    '<i class="fas fa-arrows-rotate" aria-hidden="true"></i> Atualizando…';

                Promise.all([
                    atualizarTempoReal(),
                    global.AdminCadastros.recarregar(),
                    global.AdminIndicadores.recarregar(),
                    global.AdminVisitantes.recarregar(),
                    global.AdminCurso.recarregar()
                ]).then(function () {
                    marcarHora();
                }).catch(function () {
                    if (relogio) relogio.textContent = 'Não foi possível atualizar. Tente de novo.';
                }).then(function () {
                    btnRecarregar.disabled = false;
                    btnRecarregar.classList.remove('carregando');
                    btnRecarregar.innerHTML = textoOriginal;
                });
            };
        }

        // Já havia sessão viva? O cookie responde por si: se /admin/dados
        // devolver 200, entra direto; se der 401, cai no login.
        API.dados()
            .then(function (d) { if (d && d.success !== false) abrirPainel(); })
            .catch(function () {});
    });
})(window);
