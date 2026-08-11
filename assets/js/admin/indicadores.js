/* ==========================================================
   admin/indicadores.js — números da janela escolhida
   ==========================================================
   Tudo aqui é JANELA, não tempo real, e a interface diz isso na cara: o
   backlog conta chamados abertos agora, mas entrada, fechamento, FRT e MTTR
   olham só o período selecionado. Misturar os dois sem avisar faz a pessoa
   ler "3 h de resposta" achando que é de hoje quando é a média de 30 dias.

   Quando não há dado suficiente para uma média, mostramos "—" em vez de
   zero: zero significaria "responde instantaneamente", que é mentira.
   ========================================================== */
(function (global) {
    'use strict';

    var D = global.AdminDom;
    var el = D.el;

    var estado = { janela: '7d', dados: null };
    var alvo;

    function bloco(rotulo, valor, dica) {
        // a dica vira título (dica ao passar o mouse) em vez de linha visível:
        // só ela empurrava a altura de alguns cards, deixando uns finos e
        // outros quadrados dentro do mesmo grid
        return el('div.ind-item', dica ? { title: dica } : {}, [
            el('div.ind-rot', { texto: rotulo }),
            el('div.ind-val', { texto: valor })
        ]);
    }

    function desenhar() {
        var d = estado.dados;
        if (!d) { D.trocar(alvo, el('div.vazio', { texto: 'Carregando indicadores...' })); return; }

        var b = d.backlog || {};
        var v = d.verificacao || {};

        D.trocar(alvo, [
            el('div.bloco-topo', {}, [
                el('div', {}, [
                    el('h2', { texto: 'Indicadores' }),
                    el('p.bloco-nota', { texto: 'Backlog e fila de verificação, de agora.' })
                ])
            ]),

            el('div.ind-grid', {}, [
                bloco('Backlog até 2 dias', String(b.ate_2d != null ? b.ate_2d : '—')),
                bloco('Backlog 3 a 7 dias', String(b.de_3_a_7d != null ? b.de_3_a_7d : '—')),
                bloco('Backlog mais de 7 dias', String(b.mais_7d != null ? b.mais_7d : '—'),
                      'Os mais velhos: comece por aqui'),
                bloco('Verificações pendentes', String(v.pendentes != null ? v.pendentes : '—')),
                bloco('Espera média na fila', D.fmtHoras(v.espera_media_horas)),
                bloco('Taxa de reprovação', (v.reprovacao_pct != null ? v.reprovacao_pct : '—') + '%',
                      'Inscrições que não conferiram')
            ])
        ]);
    }

    function carregar() {
        return global.AdminApi.indicadores(estado.janela)
            .then(function (d) {
                if (d && d.success) { estado.dados = d; desenhar(); }
            })
            .catch(function () {});
    }

    global.AdminIndicadores = {
        montar: function (no) { alvo = no; desenhar(); return carregar(); },
        recarregar: carregar
    };
})(window);
