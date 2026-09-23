/* ==========================================================================
   EFEITO: REVELAR AO ROLAR  |  JavaScript
   --------------------------------------------------------------------------
   Companheiro do efeito-revelar.css. Faz duas coisas:

   1. Dá a cada item o seu atraso, para eles entrarem em escada
      (0,2s de um para o outro).
   2. Avisa a seção quando ela chegou na tela, para o CSS soltar o efeito.

   Os números vieram do site de referência e estão logo abaixo, com nome,
   para poderem ser mudados num lugar só.
   ========================================================================== */

'use strict';

/* --------------------------------------------------------------------------
   A PRIMEIRA COISA, ANTES DE TUDO
   --------------------------------------------------------------------------
   Esta linha marca o <html> dizendo "o JavaScript está vivo aqui".
   O CSS só esconde os itens quando enxerga essa marca — assim, se este
   arquivo falhar em carregar, a página aparece inteira em vez de vazia.

   Ela fica FORA do "espere a página carregar" de propósito: precisa
   acontecer no primeiro instante, antes de o navegador desenhar, senão
   o conteúdo pisca visível e some.
   -------------------------------------------------------------------------- */
document.documentElement.classList.add('js');


document.addEventListener('DOMContentLoaded', function () {

    /* ======================================================================
       OS NÚMEROS DA REFERÊNCIA
       ====================================================================== */

    /* Quanto tempo cada item espera a mais que o irmão anterior.
       0,2s é bastante — é o que faz o olho conseguir acompanhar um por
       um, em vez de ver tudo aparecer numa nuvem só. */
    var ESCADA = 0.2;   /* segundos */

    /* Quando disparar. Na referência está escrito "top 80%", que quer
       dizer: solte o efeito quando o TOPO da seção alcançar a marca de
       80% da altura da tela — ou seja, quando ela já subiu um quinto
       da tela, e não no exato instante em que espia na borda.

       Traduzido para a linguagem do vigia (item abaixo): encolher a
       borda de baixo da tela em 20%. */
    var MARGEM = '0px 0px -20% 0px';


    /* ======================================================================
       1) DAR O ATRASO A CADA ITEM
       ====================================================================== */

    /* Pega todas as seções marcadas com data-scroll="load" */
    var secoes = document.querySelectorAll('[data-scroll="load"]');

    for (var s = 0; s < secoes.length; s++) {

        /* Dentro de cada seção, os itens que vão aparecer.
           A ordem que o querySelectorAll devolve é a ordem em que eles
           estão escritos no HTML — que é justamente a ordem de leitura,
           de cima para baixo. Por isso a escada sai certa sem esforço. */
        var itens = secoes[s].querySelectorAll('[scroll-item="show"]');

        for (var i = 0; i < itens.length; i++) {
            /* item 0 espera 0s, item 1 espera 0,2s, item 2 espera 0,4s... */
            itens[i].style.transitionDelay = (i * ESCADA) + 's';
        }
    }


    /* ======================================================================
       2) VIGIAR A ROLAGEM
       ----------------------------------------------------------------------
       IntersectionObserver é um "vigia" que o próprio navegador oferece.
       Em vez de perguntarmos a toda hora "já chegou? já chegou?" enquanto
       a pessoa rola (o que trava a página), nós registramos os elementos
       e o navegador nos avisa sozinho quando algum entra na tela.
       ====================================================================== */

    /* Navegador muito antigo pode não ter o vigia. Nesse caso, mostramos
       tudo de uma vez: sem efeito, mas com o conteúdo no lugar. */
    if (!('IntersectionObserver' in window)) {
        for (var n = 0; n < secoes.length; n++) {
            secoes[n].classList.add('revelado');
        }
        return;
    }

    var vigia = new IntersectionObserver(function (entradas) {

        /* O vigia entrega uma lista, porque pode ser que duas seções
           entrem na tela ao mesmo tempo. */
        for (var e = 0; e < entradas.length; e++) {

            /* isIntersecting = "esta seção está aparecendo agora?" */
            if (!entradas[e].isIntersecting) {
                continue;
            }

            /* Solta o efeito: o CSS faz o resto. */
            entradas[e].target.classList.add('revelado');

            /* E para de vigiar ESTA seção.
               Na referência o efeito acontece uma vez e pronto: rolando
               de volta para cima, o conteúdo não se desfaz nem repete.
               Repetir daria um ar de brinquedo; acontecer uma vez dá o
               ar de que a página foi montada na sua frente. */
            vigia.unobserve(entradas[e].target);
        }

    }, {
        root: null,          /* null = a tela do navegador */
        rootMargin: MARGEM,  /* o "top 80%" explicado lá em cima */
        threshold: 0         /* basta um fiozinho aparecer */
    });

    /* Entrega cada seção ao vigia */
    for (var v = 0; v < secoes.length; v++) {
        vigia.observe(secoes[v]);
    }

});
