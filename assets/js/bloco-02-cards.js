/* ==========================================================================
   BLOCO 02 — EFEITOS NOS CARDS DE VENDA  |  JavaScript
   --------------------------------------------------------------------------
   Vem de Advoga_scroll/novo-site (bloco-02-numeros.js). Faz duas coisas:

     1. MONTA o contador dos preços. No HTML está escrito só "199". Aqui esse
        "199" vira três colunas de dez algarismos empilhados, que é o que
        permite o número rolar. Assim o preço fica escrito UMA vez no HTML,
        do jeito que uma pessoa lê.

     2. ESPERA a seção chegar na tela e então dá a partida no rolo e na
        entrada do título e dos cartões.

   Se este arquivo não rodar, o preço continua escrito em texto puro e os
   cartões ficam no lugar: perde-se a animação, não a informação.
   ========================================================================== */
'use strict';

document.addEventListener('DOMContentLoaded', function () {

    var secao = document.querySelector('.plans-section');
    if (!secao) {
        return;
    }

    /* avisa o CSS que o script está vivo: só com esta classe o título e os
       cartões começam invisíveis */
    secao.classList.add('js-pronto');


    /* ======================================================================
       PARTE 1 — MONTAR AS COLUNAS DE CADA PREÇO
       ====================================================================== */
    var rolos = secao.querySelectorAll('[data-rolo]');

    Array.prototype.forEach.call(rolos, function (rolo) {

        var texto = rolo.textContent.trim();
        var digitos = texto.split('');
        if (digitos.length === 0) {
            return;
        }

        rolo.textContent = '';

        var janela = document.createElement('div');
        janela.className = 'numero-janela';

        var linha = document.createElement('div');
        linha.className = 'numero-linha';

        digitos.forEach(function (digito, posicao) {
            var coluna = document.createElement('div');
            coluna.className = 'numero-coluna';

            /* a escadinha: as colunas de posição ímpar saem 300ms depois */
            if (posicao % 2 === 1) {
                coluna.className += ' atrasada';
            }

            /* nove zeros e, por último, o algarismo de verdade: são os zeros
               passando voando que dão a impressão de rolo girando */
            for (var i = 0; i < 9; i++) {
                var zero = document.createElement('div');
                zero.className = 'numero-digito';
                zero.textContent = '0';
                coluna.appendChild(zero);
            }

            var certo = document.createElement('div');
            certo.className = 'numero-digito';
            certo.textContent = digito;
            coluna.appendChild(certo);

            linha.appendChild(coluna);
        });

        janela.appendChild(linha);
        rolo.appendChild(janela);

        /* o leitor de tela lê o preço de verdade, não a pilha de zeros */
        rolo.setAttribute('aria-label', texto);
        rolo.setAttribute('role', 'text');
        janela.setAttribute('aria-hidden', 'true');
    });


    /* ======================================================================
       PARTE 2 — DAR A PARTIDA QUANDO A SEÇÃO APARECE NA TELA
       Sem IntersectionObserver (navegador muito antigo), liga tudo de uma
       vez: melhor sem animação do que sem conteúdo.
       ====================================================================== */
    function vigiar(alvos, classe) {
        if (!('IntersectionObserver' in window)) {
            Array.prototype.forEach.call(alvos, function (alvo) {
                alvo.classList.add(classe);
            });
            return;
        }

        var vigia = new IntersectionObserver(function (entradas) {
            entradas.forEach(function (entrada) {
                if (!entrada.isIntersecting) {
                    return;
                }
                entrada.target.classList.add(classe);
                /* uma vez só: repetir a cada rolagem viraria enjoo */
                vigia.unobserve(entrada.target);
            });
        }, {
            threshold: 0.25
        });

        Array.prototype.forEach.call(alvos, function (alvo) {
            vigia.observe(alvo);
        });
    }

    vigiar(secao.querySelectorAll('.entra'), 'apareceu');

    /* ► O ROLO SÓ COMEÇA DEPOIS DA ENTRADA DOS CARTÕES.
       Antes ele tinha um vigia próprio, e como o vigia enxerga o elemento
       mesmo com opacidade 0, os números rolavam enquanto o cartão ainda
       estava invisível: quando ele aparecia, o número já estava parado no
       valor final e ninguém via o efeito.
       Os 900ms são a espera da entrada (500ms) mais um respiro. */
    function rolar() {
        setTimeout(function () {
            Array.prototype.forEach.call(rolos, function (rolo) {
                rolo.classList.add('rodou');
            });
        }, 900);
    }

    if (!('IntersectionObserver' in window)) {
        rolar();
    } else {
        var vigiaSecao = new IntersectionObserver(function (entradas) {
            entradas.forEach(function (entrada) {
                if (!entrada.isIntersecting) {
                    return;
                }
                vigiaSecao.disconnect();
                rolar();
            });
        }, { threshold: 0.25 });
        vigiaSecao.observe(secao);
    }
});
