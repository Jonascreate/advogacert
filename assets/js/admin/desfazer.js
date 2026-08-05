/* ==========================================================
   admin/desfazer.js — janela de 10 segundos antes de valer
   ==========================================================
   Ações que saem do painel e chegam no cliente — como o e-mail que avisa
   "sua inscrição foi confirmada" — não têm volta depois de enviadas.

   Em vez de mandar na hora e tentar consertar depois, a ação fica retida
   por 10 segundos. Se você não desfizer, ela vai. Se desfizer, nada saiu:
   nenhuma chamada chegou a ser feita.
   ========================================================== */
(function (global) {
    'use strict';

    var D = global.AdminDom;
    var el = D.el;
    var PRAZO = 10;   // segundos

    var caixa = null;
    var tempo = null;

    function fechar() {
        if (tempo) { clearInterval(tempo); tempo = null; }
        if (caixa && caixa.parentNode) caixa.parentNode.removeChild(caixa);
        caixa = null;
    }

    /**
     * agendar({ texto, aoConfirmar })
     * aoConfirmar só é chamada se o prazo terminar sem desfazer.
     */
    function agendar(opcoes) {
        // Uma ação de cada vez: se outra chega antes, a anterior é executada
        // imediatamente em vez de sumir sem acontecer.
        if (caixa && caixa.pendente) {
            var anterior = caixa.pendente;
            fechar();
            anterior();
        }

        var restante = PRAZO;
        var contador = el('strong', { texto: restante + 's' });

        var botao = el('button.desfazer-btn', {
            type: 'button',
            texto: 'Desfazer',
            aoClicar: fechar
        });

        caixa = el('div.desfazer', {}, [
            el('span', {}, [opcoes.texto + ' — aplicando em '] ),
            contador,
            botao
        ]);
        caixa.pendente = opcoes.aoConfirmar;
        document.body.appendChild(caixa);

        tempo = setInterval(function () {
            restante--;
            contador.textContent = restante + 's';
            if (restante <= 0) {
                var executar = caixa.pendente;
                fechar();
                executar();
            }
        }, 1000);
    }

    global.AdminDesfazer = { agendar: agendar };
})(window);
