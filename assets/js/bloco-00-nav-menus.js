/* ==========================================================================
   BLOCO 00 — MENUS SUSPENSOS DA BARRA  |  JavaScript
   --------------------------------------------------------------------------
   Companheiro do bloco-00-nav-menus.css. Ele faz DUAS coisas:

   1. No computador: abre e fecha os painéis que descem da barra quando se
      clica em Downloads, Curso, Quem sou eu ou Contato.
   2. No celular: copia a lista de cada painel para dentro do menu do
      hambúrguer, onde ela vira uma sanfona.

   A regra continua a mesma do resto do site: o JS decide QUANDO, o CSS
   decide COMO. Aqui o JS não mexe em nenhum estilo — ele só põe e tira a
   classe .aberto, e o CSS faz o painel descer.

   SOBRE A ORDEM DOS <script> NA PÁGINA:
   este arquivo não depende do bloco-00-header.js nem o contrário. Os dois
   podem entrar em qualquer ordem. Foi de propósito: o fechamento do menu
   do celular está repetido aqui embaixo (três linhas) justamente para não
   criar essa amarração invisível entre os dois arquivos.
   ========================================================================== */

'use strict';

document.addEventListener('DOMContentLoaded', function () {

    /* Todos os itens da barra que têm painel. Se não houver nenhum (a barra
       foi trocada), o resto do arquivo simplesmente não faz nada. */
    var itens = document.querySelectorAll('.nav-item');

    /* ======================================================================
       PARTE 1 — ABRIR E FECHAR OS PAINÉIS DO COMPUTADOR
       ====================================================================== */

    function fecharTodos(menosEste) {
        for (var n = 0; n < itens.length; n++) {
            if (itens[n] === menosEste) {
                continue;
            }
            itens[n].classList.remove('aberto');

            var gatilhoDele = itens[n].querySelector('.nav-link');
            if (gatilhoDele) {
                gatilhoDele.setAttribute('aria-expanded', 'false');
            }
        }
    }

    for (var i = 0; i < itens.length; i++) {
        prepararItem(itens[i]);
    }

    function prepararItem(item) {

        var gatilho = item.querySelector('.nav-link');
        var painel  = item.querySelector('.nav-drop');

        if (!gatilho || !painel) {
            return;
        }

        function abrir() {
            /* Um de cada vez. Dois painéis abertos se sobrepõem e a pessoa
               não sabe mais qual pertence a qual palavra da barra. */
            fecharTodos(item);
            item.classList.add('aberto');
            gatilho.setAttribute('aria-expanded', 'true');
        }

        function fechar() {
            item.classList.remove('aberto');
            gatilho.setAttribute('aria-expanded', 'false');
        }

        function estaAberto() {
            return item.classList.contains('aberto');
        }

        /* --- O CLIQUE ----------------------------------------------------
           Escutamos o ITEM inteiro, e não só o botão, porque a setinha ao
           lado também faz parte do alvo — clicar nela tem que abrir.

           E por isso mesmo precisamos ignorar os cliques que vêm de DENTRO
           do painel: lá dentro só há links, e um clique num link não pode
           fechar o menu antes de o navegador segui-lo. */
        item.addEventListener('click', function (evento) {
            if (painel.contains(evento.target)) {
                return;
            }

            evento.preventDefault();

            if (estaAberto()) {
                fechar();
            } else {
                abrir();
            }
        });

        /* Clicou num link de dentro? O painel fecha.
           Sem isto, quem clica em "Minha história" vê a página descer até
           a seção... com o painel ainda pendurado na frente. */
        var linksDoPainel = painel.querySelectorAll('a');
        for (var k = 0; k < linksDoPainel.length; k++) {
            linksDoPainel[k].addEventListener('click', fechar);
        }

        /* --- O TECLADO ---------------------------------------------------
           Seta para baixo no gatilho abre o painel E pula para o primeiro
           link. É o que um menu deste tipo tem que fazer para quem navega
           sem mouse — e o que todo leitor de tela espera. */
        gatilho.addEventListener('keydown', function (evento) {
            if (evento.key === 'ArrowDown') {
                evento.preventDefault();
                if (!estaAberto()) {
                    abrir();
                }
                focarLink(painel, 0);
            }
        });

        /* Dentro do painel, as setas andam de link em link, e Home/End vão
           para as pontas. */
        painel.addEventListener('keydown', function (evento) {
            var links = painel.querySelectorAll('a');
            var atual = -1;

            for (var n = 0; n < links.length; n++) {
                if (links[n] === document.activeElement) {
                    atual = n;
                    break;
                }
            }

            if (evento.key === 'ArrowDown') {
                evento.preventDefault();
                focarLink(painel, atual + 1);
            } else if (evento.key === 'ArrowUp') {
                evento.preventDefault();
                /* do primeiro para cima, volta para o gatilho */
                if (atual <= 0) {
                    gatilho.focus();
                } else {
                    focarLink(painel, atual - 1);
                }
            } else if (evento.key === 'Home') {
                evento.preventDefault();
                focarLink(painel, 0);
            } else if (evento.key === 'End') {
                evento.preventDefault();
                focarLink(painel, links.length - 1);
            }
        });

        /* SAIU DO ITEM COM O TAB? Fecha.
           focusout avisa quando o foco deixa qualquer coisa lá de dentro,
           mas ele chega ANTES de o foco novo pousar — por isso o setTimeout
           de 0: ele empurra a conferência para o instante seguinte, quando
           já dá para saber onde o foco foi parar. */
        item.addEventListener('focusout', function () {
            setTimeout(function () {
                if (!item.contains(document.activeElement)) {
                    fechar();
                }
            }, 0);
        });
    }

    /* Põe o foco no link de número tal, dando a volta quando passa do fim. */
    function focarLink(painel, numero) {
        var links = painel.querySelectorAll('a');

        if (links.length === 0) {
            return;
        }

        if (numero < 0) {
            numero = links.length - 1;
        } else if (numero >= links.length) {
            numero = 0;
        }

        /* preventScroll é obrigatório aqui, e não é detalhe: sem ele o
           navegador rola a página até o link que acabou de receber o foco,
           a rolagem dispara o vigia lá embaixo — e o painel fecharia
           sozinho no meio da navegação pelo teclado. */
        links[numero].focus({ preventScroll: true });
    }

    /* --- Fechar por fora -------------------------------------------------
       Clicou em qualquer lugar que não seja um item com painel? Fecha tudo.
       .closest sobe a árvore procurando um .nav-item: se não achar, o
       clique veio de fora. */
    document.addEventListener('click', function (evento) {
        if (!evento.target.closest || !evento.target.closest('.nav-item')) {
            fecharTodos(null);
        }
    });

    /* Esc fecha e devolve o foco para o gatilho de quem estava aberto —
       senão quem navega pelo teclado perde o lugar e volta para o começo
       da página. */
    document.addEventListener('keydown', function (evento) {
        if (evento.key !== 'Escape') {
            return;
        }

        for (var n = 0; n < itens.length; n++) {
            if (itens[n].classList.contains('aberto')) {
                var gatilho = itens[n].querySelector('.nav-link');
                if (gatilho) {
                    gatilho.focus({ preventScroll: true });
                }
            }
        }

        fecharTodos(null);
    });

    /* A página rolou com um painel aberto? Fecha.
       O painel é preso na barra, então ele acompanharia a rolagem
       flutuando sobre o conteúdo — e ninguém rola a página querendo ler o
       menu. { passive: true }: este código nunca trava a rolagem. */
    window.addEventListener('scroll', function () {
        fecharTodos(null);
    }, { passive: true });


    /* ======================================================================
       PARTE 2 — OS MESMOS MENUS NO CELULAR
       ----------------------------------------------------------------------
       Em vez de escrever tudo de novo no HTML, copiamos a lista de cada
       painel para dentro do menu do hambúrguer. Uma fonte da verdade só:
       mexeu no link lá em cima, mudou nos dois lugares.

       cloneNode(true) = copia o elemento COM tudo que está dentro dele.
       Sem o "true" viria a caixa vazia.
       ====================================================================== */

    var painelMobile = document.querySelector('.menu-mobile');

    if (!painelMobile) {
        return;
    }

    var sanfonas = painelMobile.querySelectorAll('.menu-mobile-item');

    for (var s = 0; s < sanfonas.length; s++) {
        prepararSanfona(sanfonas[s]);
    }

    function prepararSanfona(sanfona) {

        var gatilho = sanfona.querySelector('.menu-mobile-link');
        var caixa   = sanfona.querySelector('.menu-mobile-sub');

        if (!gatilho || !caixa) {
            return;
        }

        /* data-menu diz de qual painel do computador vem o conteúdo */
        var origem = document.getElementById(caixa.getAttribute('data-menu'));

        if (origem) {
            var lista = origem.querySelector('.nav-drop-lista');
            if (lista) {
                caixa.appendChild(lista.cloneNode(true));
            }
        }

        gatilho.addEventListener('click', function () {
            var jaAberta = sanfona.classList.contains('aberto');

            /* uma sanfona por vez: com duas abertas o painel do celular
               passa da altura da tela e a pessoa perde a referência */
            for (var n = 0; n < sanfonas.length; n++) {
                sanfonas[n].classList.remove('aberto');
                var g = sanfonas[n].querySelector('.menu-mobile-link');
                if (g) {
                    g.setAttribute('aria-expanded', 'false');
                }
            }

            if (!jaAberta) {
                sanfona.classList.add('aberto');
                gatilho.setAttribute('aria-expanded', 'true');
            }
        });

        /* Os links copiados são novos na página: o bloco-00-header.js já
           tinha recolhido os links do painel quando eles ainda não
           existiam, então o fechamento de lá não vale para eles. São três
           linhas repetidas, e é de propósito — ver o cabeçalho do arquivo. */
        var copiados = caixa.querySelectorAll('a');
        for (var c = 0; c < copiados.length; c++) {
            copiados[c].addEventListener('click', function () {
                painelMobile.classList.remove('aberto');
                document.body.classList.remove('menu-travado');

                var hamburguer = document.querySelector('.menu-open-block');
                if (hamburguer) {
                    hamburguer.classList.remove('aberto');
                    hamburguer.setAttribute('aria-expanded', 'false');
                    hamburguer.setAttribute('aria-label', 'Abrir menu');
                }
            });
        }
    }

});
