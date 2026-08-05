/* ==========================================================
   admin/api.js — a única porta de saída do painel
   ==========================================================
   Todo fetch do painel passa por aqui. Antes cada tela montava a sua
   chamada, e o tratamento de sessão expirada estava repetido em cada uma —
   quando um esquecia, a tela ficava em branco sem dizer por quê.

   A sessão vai por cookie httpOnly, posto pelo servidor no /admin/entrar.
   O JavaScript não lê nem manda esse cookie à mão: quem faz isso é o
   navegador, desde que a chamada use credentials 'same-origin'.
   ========================================================== */
(function (global) {
    'use strict';

    // Quem escuta o fim da sessão. A API não conhece a interface: ela avisa,
    // e quem desenha decide o que fazer.
    var aoExpirar = [];

    function base(caminho) {
        // O painel é servido pelo próprio servidor, então caminho relativo
        // basta — e mantém painel e API na mesma origem, que é o que permite
        // o cookie httpOnly funcionar sem afrouxar o SameSite.
        return caminho;
    }

    function pedir(caminho, opcoes) {
        opcoes = opcoes || {};
        return fetch(base(caminho), {
            method: opcoes.metodo || 'GET',
            headers: opcoes.corpo ? { 'Content-Type': 'application/json' } : {},
            body: opcoes.corpo ? JSON.stringify(opcoes.corpo) : undefined,
            credentials: 'same-origin'
        }).then(function (r) {
            if (r.status === 401) {
                aoExpirar.forEach(function (fn) { fn(); });
                throw new Error('sessao_expirada');
            }
            return r.json();
        });
    }

    function query(params) {
        var partes = [];
        Object.keys(params || {}).forEach(function (k) {
            if (params[k] === '' || params[k] == null) return;
            partes.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
        });
        return partes.length ? '?' + partes.join('&') : '';
    }

    global.AdminApi = {
        aoExpirarSessao: function (fn) { aoExpirar.push(fn); },

        entrar: function (senha, codigo) {
            return pedir('/admin/entrar', { metodo: 'POST', corpo: { senha: senha, codigo: codigo } });
        },

        dados: function () {
            return pedir('/admin/dados');
        },

        verificacoes: function (filtros) {
            return pedir('/admin/verificacoes' + query(filtros));
        },

        decidirVerificacao: function (id, decisao, observacao) {
            return pedir('/admin/verificacao/decidir', {
                metodo: 'POST',
                corpo: { id: id, decisao: decisao, observacao: observacao }
            });
        },

        triagem: function () {
            return pedir('/admin/triagem');
        },

        /**
         * Todos os selos das abas num pedido só.
         * Antes cada módulo mandava o seu depois de carregar a lista inteira:
         * três respostas grandes para mostrar três números, e a aba que você
         * nunca abria ficava sem contador nenhum.
         */
        contadores: function () {
            return pedir('/admin/contadores');
        },

        // ---- agenda ----
        // O navegador não calcula agenda: pede a ocupação já classificada
        // (livre, cheio, bloqueado) e desenha.
        ocupacao: function (de, ate) {
            return pedir('/admin/agenda/ocupacao' + query({ de: de, ate: ate }));
        },

        agendaConfig: function () {
            return pedir('/admin/agenda/config');
        },

        salvarAgendaConfig: function (config) {
            return pedir('/admin/agenda/config', { metodo: 'POST', corpo: config });
        },

        bloquear: function (inicio, fim, motivo) {
            return pedir('/admin/agenda/bloqueio', {
                metodo: 'POST',
                corpo: { acao: 'criar', inicio: inicio, fim: fim, motivo: motivo }
            });
        },

        desbloquear: function (id) {
            return pedir('/admin/agenda/bloqueio', {
                metodo: 'POST',
                corpo: { acao: 'remover', id: id }
            });
        },

        /**
         * Três opções ao cliente, em vez de impor uma.
         * Com apenas_calcular, só devolve os horários — é o que monta a
         * prévia do aviso antes de qualquer coisa sair.
         */
        sugerirHorarios: function (agendamento_id, opcoes) {
            opcoes = opcoes || {};
            return pedir('/admin/sugerir-horarios', {
                metodo: 'POST',
                corpo: {
                    agendamento_id: agendamento_id,
                    atualizado_em: opcoes.atualizado_em,
                    texto: opcoes.texto,
                    apenas_calcular: opcoes.apenas_calcular === true
                }
            });
        },

        horariosLivres: function () {
            // mesma rota que a tela pública usa: uma fonte só de verdade
            // sobre o que está livre
            return pedir('/agenda/horarios');
        },

        agendar: function (verificacao_id, inicio) {
            return pedir('/admin/agendar', {
                metodo: 'POST',
                corpo: { verificacao_id: verificacao_id, inicio: inicio }
            });
        },

        /**
         * opcoes.atualizado_em é o carimbo que a tela leu. Se o registro
         * mudou desde então — o cliente remarcou pelo site, outra aba
         * confirmou — o servidor recusa em vez de sobrescrever.
         * opcoes.avisar false remarca sem mandar nada ao cliente.
         */
        remarcar: function (agendamento_id, inicio, opcoes) {
            opcoes = opcoes || {};
            return pedir('/admin/remarcar', {
                metodo: 'POST',
                corpo: {
                    agendamento_id: agendamento_id,
                    inicio: inicio,
                    atualizado_em: opcoes.atualizado_em,
                    motivo: opcoes.motivo,
                    aviso: opcoes.aviso,
                    avisar: opcoes.avisar !== false
                }
            });
        },

        confirmar: function (agendamento_id, voltar, atualizado_em) {
            return pedir('/admin/confirmar', {
                metodo: 'POST',
                corpo: {
                    agendamento_id: agendamento_id,
                    voltar: voltar === true,
                    atualizado_em: atualizado_em
                }
            });
        },

        linhaTempo: function (inscricao) {
            return pedir('/admin/linha-tempo' + query({ inscricao: inscricao }));
        },

        chamados: function (filtros) {
            return pedir('/admin/chamados' + query(filtros));
        },

        apagarChamados: function (opcoes) {
            return pedir('/admin/chamado/apagar', { metodo: 'POST', corpo: opcoes });
        },

        mudarStatusChamado: function (id, status) {
            return pedir('/admin/chamado/status', { metodo: 'POST', corpo: { id: id, status: status } });
        },

        indicadores: function (janela) {
            return pedir('/admin/indicadores' + query({ janela: janela }));
        },

        assinatura: function (usuario_id, acao) {
            return pedir('/admin/assinatura', {
                metodo: 'POST',
                corpo: { usuario_id: usuario_id, acao: acao, meses: 1 }
            });
        }
    };
})(window);
