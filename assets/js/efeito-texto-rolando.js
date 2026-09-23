/* ==========================================================================
   EFEITO: TEXTO ROLANDO LETRA POR LETRA  |  JavaScript
   --------------------------------------------------------------------------
   Companheiro do efeito-texto-rolando.css.

   Faz duas coisas:
   1. Quebra cada palavra em letras, uma dentro de um <span> próprio.
   2. No hover, dá a cada letra o seu atraso e manda todas subirem.

   Vale para QUALQUER elemento marcado com data-texto-rolando — botão,
   link do menu, link do rodapé. É por isso que este arquivo é um EFEITO
   e não parte de um bloco.

   OS NÚMEROS SÃO OS DA REFERÊNCIA: 0,25s por letra, 0,03s entre elas.
   ========================================================================== */

'use strict';

document.addEventListener('DOMContentLoaded', function () {

    var DURACAO = 0.25;   /* segundos que cada letra leva subindo   */
    var ATRASO  = 0.03;   /* segundos entre uma letra e a seguinte  */


    /* --- Quebra um texto em letras -------------------------------------
       Recebe uma caixa com "Ver como funciona" dentro e devolve
       <span>V</span><span>e</span><span>r</span>... um span por letra.
       Cada span vira uma peça que pode ser movida sozinha.             */
    function quebrarEmLetras(caixa) {
        var texto = caixa.textContent;
        var letras = [];

        caixa.textContent = '';   /* esvazia antes de remontar */

        for (var i = 0; i < texto.length; i++) {
            var span = document.createElement('span');
            span.className = 'texto-rolando-letra';
            span.textContent = texto[i];

            /* espaço precisa de tratamento próprio, senão o navegador
               o engole e as palavras grudam umas nas outras */
            if (texto[i] === ' ') {
                span.className += ' texto-rolando-espaco';
            }

            caixa.appendChild(span);
            letras.push(span);
        }

        return letras;
    }


    /* --- Prepara um elemento ------------------------------------------- */
    function preparar(elemento) {

        /* Junta as letras das DUAS cópias numa lista só. As duas se movem
           ao mesmo tempo — é isso que faz a de baixo entrar exatamente no
           lugar que a de cima deixou. */
        var linhas = elemento.querySelectorAll('.texto-rolando-linha');
        if (linhas.length === 0) {
            return;
        }

        var letras = [];
        for (var l = 0; l < linhas.length; l++) {
            var daLinha = quebrarEmLetras(linhas[l]);
            for (var k = 0; k < daLinha.length; k++) {
                letras.push(daLinha[k]);
            }
        }

        /* Quantas letras tem UMA cópia. Precisamos deste número porque a
           letra nº 3 da cópia de baixo tem que sair junto com a letra
           nº 3 da de cima — e não depois de todas as de cima. */
        var porCopia = letras.length / linhas.length;

        /* Dá a cada letra o seu atraso.
           "reverso" inverte a fila: ao SAIR o mouse, a referência toca o
           efeito de trás para frente, então a última letra volta primeiro. */
        function darAtrasos(reverso) {
            for (var n = 0; n < letras.length; n++) {
                var posicao = n % porCopia;              /* 0,1,2... dentro da cópia */
                if (reverso) {
                    posicao = (porCopia - 1) - posicao;
                }
                letras[n].style.transitionDelay = (posicao * ATRASO) + 's';
                letras[n].style.transitionDuration = DURACAO + 's';
            }
        }

        function entrar() {
            darAtrasos(false);
            elemento.classList.add('rolando');
        }

        function sair() {
            darAtrasos(true);
            elemento.classList.remove('rolando');
        }

        elemento.addEventListener('mouseenter', entrar);
        elemento.addEventListener('mouseleave', sair);

        /* o mesmo efeito para quem navega pelo teclado (tecla Tab) */
        elemento.addEventListener('focus', entrar);
        elemento.addEventListener('blur', sair);
    }


    /* --- Liga em todo mundo que estiver marcado ------------------------- */
    var alvos = document.querySelectorAll('[data-texto-rolando]');
    for (var i = 0; i < alvos.length; i++) {
        preparar(alvos[i]);
    }

});
