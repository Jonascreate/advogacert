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
    // As abas são a linha do tempo de UM atendimento: cada uma é uma etapa
    // que ele atravessa, da verificação da OAB ao chamado fechado.
    //
    // Assinantes não é etapa — é a mesma pessoa em qualquer etapa, ou em
    // nenhuma. Por isso não está aqui: é o botão "Assinantes" no topo, que
    // abre por cima como planilha de controle, sem entrar na esteira.
    var ABAS = [
        { id: 'verificacao', rotulo: 'Verificação de OAB' },
        { id: 'triagem',     rotulo: 'Triagem' },
        { id: 'chamados',    rotulo: 'Chamados' },
        { id: 'indicadores', rotulo: 'Indicadores' },
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

    /**
     * O selo de cada aba, para a esteira ser visível de longe.
     *
     * Cada aba conta APENAS o que está parado nela. Não existe número
     * passando de uma para a outra: quando o item avança, ele some de um
     * contador e aparece no outro, porque os dois foram recalculados do
     * zero pelo servidor.
     *
     * Três estados, e só três:
     *   sem selo — nada a fazer. Bolinha com "0" é ruído: ocupa o mesmo
     *              espaço de um alerta e não pede nada.
     *   âmbar   — tem pendência normal.
     *   vermelho — tem coisa que já devia estar feita: item esperando há
     *              mais de 24h, ou conflito de horário.
     */
    function marcarAba(id, rotulo, n, urgente) {
        var botao = document.getElementById('btn-aba-' + id);
        if (!botao) return;

        var classe = 'span.aba-selo' + (urgente ? '.urgente' : '');
        D.trocar(botao, [
            document.createTextNode(rotulo),
            n > 0 ? el(classe, { texto: String(n), 'aria-hidden': 'true' }) : null
        ]);

        // O número pintado não chega ao leitor de tela — para ele, o botão
        // diria "Triagem 3" sem dizer três do quê. O rótulo completo vai no
        // aria-label.
        botao.setAttribute('aria-label', n > 0
            ? rotulo + ', ' + n + (n === 1 ? ' pendente' : ' pendentes') +
              (urgente ? ', precisa de atenção' : '')
            : rotulo + ', nada pendente');
    }

    /**
     * Todos os selos de uma vez, num pedido só.
     *
     * Roda no polling de 30 segundos E logo depois de qualquer ação minha —
     * aprovar uma OAB, remarcar, fechar um chamado. Sem esse segundo
     * disparo, o número certo levaria meio minuto para aparecer e a tela
     * pareceria não ter registrado o clique.
     */
    var contadoresEmVoo = null;

    function atualizarContadores() {
        // Cada módulo pede a atualização depois de recarregar a sua lista, e
        // no polling os três recarregam juntos. Sem esta trava seriam quatro
        // pedidos idênticos a cada meio minuto para escrever os mesmos
        // números. Quem chega enquanto um está no ar espera esse.
        if (contadoresEmVoo) return contadoresEmVoo;

        contadoresEmVoo = API.contadores().then(function (c) {
            contadoresEmVoo = null;
            if (!c || !c.success) return;
            // A Verificação de OAB carrega os dois: quem ainda não foi
            // conferido (a vez é sua) e quem já foi conferido mas não
            // marcou hora ainda (a vez é do cliente, mas a lembrança de
            // cobrar é sua). A Triagem só conta quem JÁ tem hora marcada —
            // é a régua que decide o que mora em cada aba.
            marcarAba('verificacao', 'Verificação de OAB', c.aguardando_oab + c.aguardando_hora,
                      c.aguardando_oab_urgente || c.aguardando_hora_urgente);
            marcarAba('triagem', 'Triagem', c.triagem, c.triagem_urgente);
            marcarAba('chamados', 'Chamados', c.chamados_abertos, c.chamados_urgente);
            marcarAba('sistema', 'Servidor e banco', c.saude_alertas, c.saude_alertas > 0);
        }).catch(function () {
            // Falha de rede não pode deixar a trava presa: o próximo ciclo
            // precisa poder tentar de novo.
            contadoresEmVoo = null;
        });
        return contadoresEmVoo;
    }

    global.AdminContadores = { atualizar: atualizarContadores };

    function marcarHora() {
        if (relogio) relogio.textContent = 'Atualizado às ' + new Date().toLocaleTimeString('pt-BR');
    }

    // ---------------- ciclo de vida ----------------
    function atualizarTempoReal() {
        return Promise.all([
            global.AdminFilaVerificacao.recarregar(),
            global.AdminTriagem.recarregar(),
            global.AdminFilaChamados.recarregar(),
            atualizarContadores()
        ]).then(marcarHora);
    }

    // ---------------- modal de assinantes ----------------
    // Não faz parte da esteira, então não faz parte de mostrarAba/ABAS. É
    // uma janela por cima: abre, você confere, fecha, e volta pra aba onde
    // estava — nada na tela de trás muda de lugar.
    function ligarModalAssinantes() {
        var modal = document.getElementById('modal-assinantes');
        var abrir = document.getElementById('btn-assinantes');
        var fechar = document.getElementById('btn-fechar-assinantes');
        if (!modal || !abrir || !fechar) return;

        function mostrar() {
            modal.style.display = 'flex';
            // Dados podem ter mudado desde o último boot: refaz na hora de
            // abrir, e não fica reconsultando enquanto ninguém olha.
            global.AdminCadastros.recarregar();
        }
        function esconder() { modal.style.display = 'none'; }

        abrir.addEventListener('click', mostrar);
        fechar.addEventListener('click', esconder);
        modal.addEventListener('click', function (e) { if (e.target === modal) esconder(); });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && modal.style.display !== 'none') esconder();
        });
    }

    function abrirPainel() {
        telaLogin.style.display = 'none';
        telaPainel.style.display = 'block';

        global.AdminFilaVerificacao.montar(document.getElementById('aba-verificacao'));
        global.AdminTriagem.montar(document.getElementById('aba-triagem'));
        global.AdminFilaChamados.montar(document.getElementById('aba-chamados'));
        global.AdminIndicadores.montar(document.getElementById('aba-indicadores'));
        global.AdminCadastros.montar({
            resumo: document.getElementById('resumo'),
            pessoas: document.getElementById('modal-assinantes-conteudo'),
            // o alvo é o div interno, não a seção: o bloco de ajuda embaixo
            // é conteúdo fixo e seria apagado a cada redesenho
            diagnostico: document.getElementById('aba-sistema-diag')
        });

        mostrarAba('verificacao');
        atualizarContadores();
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
        var modal = document.getElementById('modal-assinantes');
        if (modal) modal.style.display = 'none';
    }

    document.addEventListener('DOMContentLoaded', function () {
        telaLogin = document.getElementById('tela-login');
        telaPainel = document.getElementById('tela-painel');
        relogio = document.getElementById('atualizado');

        ligarLogin();
        ligarAbas();
        ligarModalAssinantes();
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
