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
    var ABAS = [
        { id: 'verificacao', rotulo: 'Verificação de OAB' },
        { id: 'chamados',    rotulo: 'Chamados' },
        { id: 'indicadores', rotulo: 'Indicadores' },
        { id: 'cadastros',   rotulo: 'Cadastros e agenda' },
        { id: 'sistema',     rotulo: 'Servidor e banco' }
    ];

    function mostrarAba(id) {
        ABAS.forEach(function (a) {
            var secao = document.getElementById('aba-' + a.id);
            var botao = document.getElementById('btn-aba-' + a.id);
            if (secao) secao.style.display = a.id === id ? 'block' : 'none';
            if (botao) botao.classList.toggle('ativa', a.id === id);
        });
    }

    function ligarAbas() {
        var barra = document.getElementById('abas');
        D.trocar(barra, ABAS.map(function (a) {
            return el('button.aba', {
                type: 'button',
                id: 'btn-aba-' + a.id,
                texto: a.rotulo,
                aoClicar: function () { mostrarAba(a.id); }
            });
        }));
    }

    /** A contagem de pendentes aparece na aba: é o que exige ação sua. */
    function marcarPendentes(n) {
        var botao = document.getElementById('btn-aba-verificacao');
        if (!botao) return;
        D.trocar(botao, [
            document.createTextNode('Verificação de OAB'),
            n > 0 ? el('span.aba-selo', { texto: String(n) }) : null
        ]);
    }

    function marcarHora() {
        if (relogio) relogio.textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR');
    }

    // ---------------- ciclo de vida ----------------
    function atualizarTempoReal() {
        return Promise.all([
            global.AdminFilaVerificacao.recarregar(),
            global.AdminFilaChamados.recarregar()
        ]).then(marcarHora);
    }

    function abrirPainel() {
        telaLogin.style.display = 'none';
        telaPainel.style.display = 'block';

        global.AdminFilaVerificacao.montar(document.getElementById('aba-verificacao'), marcarPendentes);
        global.AdminFilaChamados.montar(document.getElementById('aba-chamados'));
        global.AdminIndicadores.montar(document.getElementById('aba-indicadores'));
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
    }

    document.addEventListener('DOMContentLoaded', function () {
        telaLogin = document.getElementById('tela-login');
        telaPainel = document.getElementById('tela-painel');
        relogio = document.getElementById('atualizado');

        ligarLogin();
        ligarAbas();
        API.aoExpirarSessao(voltarAoLogin);

        document.getElementById('btn-recarregar').onclick = function () {
            atualizarTempoReal();
            global.AdminCadastros.recarregar();
            global.AdminIndicadores.recarregar();
        };

        // Já havia sessão viva? O cookie responde por si: se /admin/dados
        // devolver 200, entra direto; se der 401, cai no login.
        API.dados()
            .then(function (d) { if (d && d.success !== false) abrirPainel(); })
            .catch(function () {});
    });
})(window);
