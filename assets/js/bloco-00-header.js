/* ==========================================================================
   BLOCO 00 — HEADER  |  JavaScript
   --------------------------------------------------------------------------
   Este arquivo faz TRÊS coisas, e mais nada:

   1. Avisa a barra quando a página foi rolada, para ela ganhar o fundo
      branco de vidro fosco (no topo ela é transparente).
   2. Faz o efeito dos links do menu: quebra cada palavra em letras e
      manda uma de cada vez subir, além de controlar o risquinho.
   3. Abre e fecha o painel de menu do celular.

   A regra geral é: o JS decide QUANDO e em que ORDEM, o CSS decide COMO.
   A parte 2 é a única exceção, porque o CSS sozinho não sabe diferenciar
   "o mouse está entrando" de "o mouse está saindo" — e essa diferença é
   justamente o que faz o efeito ficar igual ao da referência.
   ========================================================================== */

'use strict';

document.addEventListener('DOMContentLoaded', function () {

    /* ======================================================================
       PARTE 1 — A BARRA GANHA FUNDO AO ROLAR
       ====================================================================== */

    var barra = document.querySelector('.navbar');

    if (barra) {

        /* A partir de quantos pixels rolados a barra muda de aparência.
           10px é pouco de propósito: a mudança acontece no primeiro
           movimento do dedo, e não depois de meia tela. */
        var LIMITE = 10;

        function conferirRolagem() {
            /* window.scrollY = quantos pixels a página já rolou.
               classList.toggle('rolou', true/false) põe ou tira a classe
               conforme o verdadeiro/falso — é um if escrito em uma linha. */
            barra.classList.toggle('rolou', window.scrollY > LIMITE);
        }

        /* Roda uma vez agora, porque a pessoa pode ter recarregado a página
           já no meio dela (o navegador guarda a posição da rolagem). */
        conferirRolagem();

        /* E roda de novo toda vez que ela rolar.
           { passive: true } avisa o navegador que este código NUNCA vai
           travar a rolagem — com isso ele não precisa esperar por nós, e
           a página rola mais leve. */
        window.addEventListener('scroll', conferirRolagem, { passive: true });
    }


    /* ======================================================================
       PARTE 2 — O EFEITO DOS LINKS DO MENU (letra por letra)
       ----------------------------------------------------------------------
       Os números aqui foram lidos de dentro do site de referência:
         cada letra leva 0,25s para subir
         e cada uma começa 0,03s depois da anterior
       É esse atraso mínimo que faz a palavra ondular em vez de deslizar
       como um bloco só.
       ====================================================================== */

    var DURACAO_LETRA = 0.25;   /* segundos que cada letra leva subindo */
    var ATRASO_LETRA  = 0.03;   /* segundos entre uma letra e a seguinte */
    var DURACAO_LINHA = 400;    /* milissegundos do risquinho atravessar */

    /* --- 2.1) Quebrar um texto em letras ---------------------------------
       Recebe um elemento com "Serviços" dentro e devolve
       <span>S</span><span>e</span><span>r</span>... um span por letra.
       Cada span vira uma peça que pode ser movida sozinha. */
    function quebrarEmLetras(elemento) {
        var texto = elemento.textContent;
        var letras = [];

        /* textContent = '' esvazia a caixa antes de remontar */
        elemento.textContent = '';

        for (var i = 0; i < texto.length; i++) {
            var span = document.createElement('span');
            span.className = 'nav-link-letra';
            span.textContent = texto[i];

            /* espaço em branco precisa de tratamento próprio, senão
               o navegador o engole e as palavras grudam */
            if (texto[i] === ' ') {
                span.className += ' nav-link-letra-espaco';
            }

            elemento.appendChild(span);
            letras.push(span);
        }

        return letras;
    }

    /* --- 2.2) Preparar cada link ----------------------------------------- */
    var links = document.querySelectorAll('.nav-link');

    for (var i = 0; i < links.length; i++) {
        prepararLink(links[i]);
    }

    function prepararLink(link) {

        /* Junta as letras das DUAS cópias de texto numa lista só.
           As duas se movem ao mesmo tempo — é isso que faz a de baixo
           entrar exatamente no lugar da de cima. */
        var letras = [];
        var textos = link.querySelectorAll('.nav-link-text');

        for (var t = 0; t < textos.length; t++) {
            var doTexto = quebrarEmLetras(textos[t]);
            for (var k = 0; k < doTexto.length; k++) {
                letras.push(doTexto[k]);
            }
        }

        /* Quantas letras tem UMA cópia. Precisamos deste número porque a
           letra nº 3 da cópia de baixo tem que sair junto com a letra
           nº 3 da de cima — e não depois de todas as de cima. */
        var porCopia = textos.length > 0 ? letras.length / textos.length : 0;

        var linha = link.querySelector('.nav-link-line');

        /* Dá a cada letra o seu atraso.
           "reverso" inverte a ordem da fila: ao SAIR o mouse, a referência
           toca o efeito de trás para frente, então a última letra é a
           primeira a voltar. */
        function darAtrasos(reverso) {
            for (var n = 0; n < letras.length; n++) {
                var posicao = n % porCopia;               /* 0,1,2... dentro da cópia */
                if (reverso) {
                    posicao = (porCopia - 1) - posicao;   /* de trás para frente */
                }
                letras[n].style.transitionDelay = (posicao * ATRASO_LETRA) + 's';
                letras[n].style.transitionDuration = DURACAO_LETRA + 's';
            }
        }

        /* --- MOUSE ENTRANDO --- */
        function entrar() {
            darAtrasos(false);
            link.classList.add('passando');       /* o CSS sobe as letras */

            if (linha) {
                /* o risquinho vem da esquerda até o lugar */
                linha.style.transition = 'transform ' + DURACAO_LINHA + 'ms ease';
                linha.style.transform  = 'translateX(0%)';
            }
        }

        /* --- MOUSE SAINDO --- */
        function sair() {
            darAtrasos(true);
            link.classList.remove('passando');    /* as letras voltam */

            if (linha) {
                /* O risquinho NÃO volta pela esquerda: ele segue em frente
                   e sai pela direita. Depois, já fora da janela e sem
                   ninguém ver, pula de volta para a esquerda para estar
                   pronto da próxima vez.

                   É esse ciclo que faz o traço sempre andar para a frente,
                   em vez de quicar de volta pelo mesmo caminho.          */
                linha.style.transition = 'transform ' + DURACAO_LINHA + 'ms ease';
                linha.style.transform  = 'translateX(100%)';

                /* setTimeout = "faça isto daqui a tantos milissegundos".
                   Esperamos a saída terminar para então dar o pulo. */
                setTimeout(function () {
                    linha.style.transition = 'none';        /* sem animação */
                    linha.style.transform  = 'translateX(-100%)';

                    /* Ler offsetWidth obriga o navegador a aplicar a linha
                       de cima AGORA. Sem esta linha aparentemente inútil,
                       ele juntaria as duas mudanças e o pulo apareceria. */
                    void linha.offsetWidth;

                    linha.style.transition = '';            /* devolve ao CSS */
                }, DURACAO_LINHA);
            }
        }

        link.addEventListener('mouseenter', entrar);
        link.addEventListener('mouseleave', sair);

        /* o mesmo efeito para quem navega pelo teclado (tecla Tab) */
        link.addEventListener('focus', entrar);
        link.addEventListener('blur', sair);
    }


    /* ======================================================================
       PARTE 3 — O MENU DO CELULAR
       ====================================================================== */

    var botao  = document.querySelector('.menu-open-block');
    var painel = document.querySelector('.menu-mobile');

    /* Se não existirem (foram tirados da página), sai sem quebrar nada. */
    if (!botao || !painel) {
        return;
    }

    /* Uma função só para abrir e outra para fechar deixa o código claro,
       mas as duas fazem exatamente a mesma lista de coisas ao contrário. */

    function abrirMenu() {
        painel.classList.add('aberto');
        botao.classList.add('aberto');            /* vira o "X"           */
        document.body.classList.add('menu-travado'); /* trava a rolagem   */
        botao.setAttribute('aria-expanded', 'true');
        botao.setAttribute('aria-label', 'Fechar menu');
    }

    function fecharMenu() {
        painel.classList.remove('aberto');
        botao.classList.remove('aberto');
        document.body.classList.remove('menu-travado');
        botao.setAttribute('aria-expanded', 'false');
        botao.setAttribute('aria-label', 'Abrir menu');
    }

    /* O clique no hambúrguer: se está aberto fecha, se está fechado abre. */
    botao.addEventListener('click', function () {
        if (painel.classList.contains('aberto')) {
            fecharMenu();
        } else {
            abrirMenu();
        }
    });

    /* Clicou num link de dentro do painel? Fecha o painel.
       Sem isto, a pessoa clica em "Contato", a página desce até lá...
       e o menu continua tapando tudo. */
    var linksDoPainel = painel.querySelectorAll('a');
    for (var i = 0; i < linksDoPainel.length; i++) {
        linksDoPainel[i].addEventListener('click', fecharMenu);
    }

    /* Apertou Esc? Fecha também. É o que todo mundo espera que aconteça. */
    document.addEventListener('keydown', function (evento) {
        if (evento.key === 'Escape') {
            fecharMenu();
        }
    });

    /* Se a janela foi alargada até virar "computador", o painel não faz
       mais sentido (os links voltaram para a barra). Fecha para não
       deixar a rolagem travada sem motivo. */
    window.addEventListener('resize', function () {
        if (window.innerWidth > 991) {
            fecharMenu();
        }
    });

});
