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

        remarcar: function (agendamento_id, inicio) {
            return pedir('/admin/remarcar', {
                metodo: 'POST',
                corpo: { agendamento_id: agendamento_id, inicio: inicio }
            });
        },

        confirmar: function (agendamento_id, voltar) {
            return pedir('/admin/confirmar', {
                metodo: 'POST',
                corpo: { agendamento_id: agendamento_id, voltar: voltar === true }
            });
        },

        /** Baixa do atendimento gratuito. desfazer === true volta atrás. */
        atendido: function (agendamento_id, desfazer) {
            return pedir('/admin/atendido', {
                metodo: 'POST',
                corpo: { agendamento_id: agendamento_id, desfazer: desfazer === true }
            });
        },

        /** Atendimento sem hora combinada: entra direto, fora da grade. */
        agendarSemHorario: function (verificacao_id) {
            return pedir('/admin/agendar', {
                metodo: 'POST',
                corpo: { verificacao_id: verificacao_id, sem_horario: true }
            });
        },

        promover: function (agendamento_id, prioridade) {
            return pedir('/admin/promover', {
                metodo: 'POST',
                corpo: { agendamento_id: agendamento_id, prioridade: prioridade }
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

        telemetria: function (dias) {
            return pedir('/admin/telemetria' + query({ dias: dias }));
        },

        assinatura: function (usuario_id, acao) {
            return pedir('/admin/assinatura', {
                metodo: 'POST',
                corpo: { usuario_id: usuario_id, acao: acao, meses: 1 }
            });
        },

        observacao: function (usuario_id, texto) {
            return pedir('/admin/observacao', {
                metodo: 'POST',
                corpo: { usuario_id: usuario_id, texto: texto }
            });
        },

        solicitarPremium: function (usuario_id, descricao) {
            return pedir('/admin/premium/solicitar', {
                metodo: 'POST',
                corpo: { usuario_id: usuario_id, descricao: descricao }
            });
        }
    };
})(window);
