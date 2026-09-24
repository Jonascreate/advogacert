/* ==========================================================================
   BLOCO 02 — MISSÃO  |  JavaScript
   --------------------------------------------------------------------------
   Este arquivo faz UMA coisa só: o botão de play/pause do vídeo.

   O vídeo roda sozinho, em laço e sem som — é decoração de fundo, não é
   um filme para assistir. Mas dar um jeito de PARAR é obrigatório: tem
   gente que se distrai, se incomoda ou precisa economizar bateria.
   Vídeo que roda sem parar e sem botão é falta de educação com o
   visitante (e reprova em qualquer teste de acessibilidade).
   ========================================================================== */

'use strict';

document.addEventListener('DOMContentLoaded', function () {

    var botao = document.querySelector('.missao-video-botao');
    var video = document.querySelector('.missao-video');

    /* Se algum dos dois não existir (a seção foi tirada da página),
       sai em silêncio, sem quebrar nada. */
    if (!botao || !video) {
        return;
    }

    /* --- Trocar o ícone e o aviso -------------------------------------
       A classe .pausado no botão é o que faz o CSS trocar o desenho:
       com ela aparece o ícone de PLAY, sem ela o de PAUSA.

       aria-label é o texto que o leitor de tela do deficiente visual
       fala. Ele precisa mudar junto, senão a pessoa ouve "pausar vídeo"
       num vídeo que já está parado. */
    function atualizarBotao() {
        if (video.paused) {
            botao.classList.add('pausado');
            botao.setAttribute('aria-label', 'Reproduzir vídeo');
        } else {
            botao.classList.remove('pausado');
            botao.setAttribute('aria-label', 'Pausar vídeo');
        }
    }

    /* Guarda se foi A PESSOA que mandou parar.
       Sem isso, o vigia lá do fim do arquivo (o que liga o vídeo quando a
       seção aparece na tela) voltaria a ligar o vídeo que ela acabou de
       desligar, toda vez que ela rolasse a página para cima e para baixo.
       Mandou parar, fica parado. */
    var pausadoPelaPessoa = false;

    /* ► A VELOCIDADE DO VÍDEO.
       1 = a velocidade em que o clipe foi gravado. 1.6 = 60% mais rápido.
       Como o vídeo é decoração de fundo, sem fala nem trilha, acelerar
       não estraga nada: só deixa as partículas mais vivas.
       Não passe muito de 2 — acima disso vira agitação e cansa. */
    video.playbackRate = 1.6;

    /* --- O clique: se está rodando, pausa; se está parado, roda ------- */
    botao.addEventListener('click', function () {
        pausadoPelaPessoa = !video.paused;

        if (video.paused) {
            /* play() pode ser recusado pelo navegador (regra de economia
               de dados, por exemplo). Ele devolve uma "promessa", e o
               .catch evita que a recusa vire um erro vermelho no console. */
            var tentativa = video.play();
            if (tentativa && typeof tentativa.catch === 'function') {
                tentativa.catch(function () { });
            }
        } else {
            video.pause();
        }
    });

    /* O botão também escuta o VÍDEO, e não só o clique. Assim ele fica
       certo mesmo quando quem pausou não foi a pessoa — o navegador
       pausa sozinho ao trocar de aba, por exemplo. */
    video.addEventListener('play', atualizarBotao);
    video.addEventListener('pause', atualizarBotao);

    /* E uma primeira conferida agora, no estado em que o vídeo nasceu. */
    atualizarBotao();


    /* ==================================================================
       APAGANDO O FUNDO PRETO DO VÍDEO
       ------------------------------------------------------------------
       O clipe das partículas foi gravado sobre um fundo preto, e vídeo
       não guarda transparência como um PNG guarda: o preto vem junto,
       sempre.

       Só com CSS não dá. mix-blend-mode (screen, color-dodge) não cria
       transparência — ele MISTURA o vídeo com o que está atrás, e as
       duas receitas que apagam preto só funcionam sobre fundo escuro.
       Sobre o fundo claro do site elas lavavam as partículas até o
       branco, e elas sumiam.

       A saída é copiar o vídeo, quadro a quadro, para dentro de um
       <canvas>, e na cópia mexer na transparência de cada pontinho:

         pontinho quase preto  ->  fica invisível
         pontinho aceso        ->  fica visível

       Ou seja: o brilho de cada pontinho vira a transparência dele.
       O preto some de verdade, e o recorte funciona sobre qualquer
       fundo — claro, escuro ou uma foto.
       ================================================================== */

    var caixa = document.querySelector('.missao-video-caixa');
    var tela  = document.querySelector('.missao-video-tela');

    if (!caixa || !tela) {
        return;
    }

    /* willReadFrequently avisa o navegador que vamos LER os pontinhos a
       todo quadro. Sem esse aviso ele guarda o desenho na placa de vídeo,
       de onde ler é lento, e a animação engasga. */
    var pincel = tela.getContext('2d', { willReadFrequently: true });

    if (!pincel) {
        return;
    }

    /* ► O AJUSTE QUE VOCÊ VAI QUERER MEXER.
       De 0 a 255: todo pontinho com brilho ABAIXO deste número some.
       Sobe se ficar um véu cinza em volta das partículas;
       desce se as partículas mais fracas estiverem sumindo junto. */
    var CORTE = 26;

    var largura = 0;
    var altura  = 0;
    var ligado  = false;

    /* --- O tamanho da tela de desenho ---------------------------------
       Não é o tamanho do vídeo (1280x720), é o tamanho da CAIXA na
       página. Desenhar maior que isso seria trabalho jogado fora.

       devicePixelRatio é quantos pontinhos de verdade a tela do
       aparelho tem para cada ponto do CSS — em tela boa, 2 ou 3.
       Limitamos em 1.5 de propósito: acima disso o recorte fica pesado
       e não melhora nada que o olho perceba. */
    function medir() {
        var densidade = Math.min(window.devicePixelRatio || 1, 1.5);
        var l = Math.round(caixa.clientWidth  * densidade);
        var a = Math.round(caixa.clientHeight * densidade);

        if (l > 0 && a > 0 && (l !== largura || a !== altura)) {
            largura = l;
            altura  = a;
            tela.width  = l;   /* mudar isto já limpa a tela sozinho */
            tela.height = a;
        }
    }

    /* --- O plano B ------------------------------------------------------
       Se der qualquer problema, tiramos a classe: o vídeo normal volta a
       aparecer (com o fundo preto, mas aparece) e a tela some.

       O caso mais comum é abrir o index.html com DOIS CLIQUES. Nesse
       modo o navegador proíbe ler os pontinhos do vídeo por segurança,
       e o recorte é impossível. Rodando pelo servidor, funciona. */
    function desligar() {
        ligado = false;
        caixa.classList.remove('chave-ligada');
    }

    /* --- Um quadro ------------------------------------------------------ */
    function desenharQuadro() {
        var vl = video.videoWidth;
        var va = video.videoHeight;

        if (!vl || !va || !largura || !altura) {
            return true;
        }

        /* A CONTA DO "COVER", feita à mão.
           O CSS resolvia isso com object-fit: cover, mas dentro do canvas
           não existe object-fit — aqui somos nós que decidimos. Pegamos a
           MAIOR das duas escalas: assim o vídeo cobre a caixa inteira sem
           sobrar buraco, e o que passar do tamanho fica de fora. */
        var escala = Math.max(largura / vl, altura / va);
        var dl = vl * escala;
        var da = va * escala;

        pincel.clearRect(0, 0, largura, altura);
        /* dividido por 2 = o corte tira o mesmo tanto dos dois lados,
           e o miolo do vídeo fica centrado */
        pincel.drawImage(video, (largura - dl) / 2, (altura - da) / 2, dl, da);

        var quadro;
        try {
            quadro = pincel.getImageData(0, 0, largura, altura);
        } catch (erro) {
            /* é aqui que cai o caso do "abri com dois cliques" */
            desligar();
            return false;
        }

        /* Os pontinhos vêm numa fila só de números, de quatro em quatro:
           vermelho, verde, azul, transparência, vermelho, verde... Por
           isso o passo do laço é 4. */
        var pontos = quadro.data;
        var i;
        var vermelho, verde, azul, brilho;
        /* calculado uma vez, fora do laço: espicha o que sobrou depois do
           corte de volta para a faixa cheia, senão o clipe inteiro
           ficaria um pouco apagado */
        var espicha = 255 / (255 - CORTE);

        for (i = 0; i < pontos.length; i += 4) {
            vermelho = pontos[i];
            verde    = pontos[i + 1];
            azul     = pontos[i + 2];

            /* brilho = a cor mais forte das três. Serve melhor que a média
               aqui: uma partícula bem azul tem média baixa e sumiria. */
            brilho = vermelho > verde ? vermelho : verde;
            if (azul > brilho) {
                brilho = azul;
            }

            /* E o brilho vira a transparência. Esta linha é o efeito
               inteiro; todo o resto do arquivo é preparação para ela. */
            pontos[i + 3] = brilho <= CORTE ? 0 : (brilho - CORTE) * espicha;
        }

        pincel.putImageData(quadro, 0, 0);
        return true;
    }

    /* ► O SEGUNDO AJUSTE: quantas vezes por segundo refazer o recorte.
       O clipe é de 60 quadros por segundo, e refazer o recorte 60 vezes
       por segundo é trabalho pesado à toa: são cerca de um milhão de
       continhas por quadro. A 30 o olho não vê diferença numa nuvem de
       partículas, e o computador trabalha metade.
       Suba para 60 se algum dia trocar por um clipe com movimento rápido
       de verdade. */
    var QUADROS_POR_SEGUNDO = 30;
    var esperaEntreQuadros = 1000 / QUADROS_POR_SEGUNDO;
    var horaDoUltimoQuadro = 0;

    /* --- O laço ---------------------------------------------------------
       requestVideoFrameCallback é o jeito certo: o navegador chama a
       cada quadro NOVO do vídeo. Como o clipe é de 24 quadros por
       segundo e a tela costuma ser de 60, isso é menos da metade do
       trabalho de redesenhar a cada quadro da tela.

       Nem todo navegador tem essa função (o Firefox mais antigo, por
       exemplo). Nesses, caímos no requestAnimationFrame, que segue a
       tela em vez do vídeo: gasta mais, e dá no mesmo para quem olha. */
    var temCallbackDeVideo = typeof video.requestVideoFrameCallback === 'function';

    function proximoQuadro() {
        if (!ligado) {
            return;
        }

        /* O FREIO.
           O navegador nos chama 60 vezes por segundo, mas só refazemos o
           recorte se já passou tempo suficiente desde o último. Nas outras
           vezes saímos na hora e apenas pedimos para ser chamados de novo:
           o quadro anterior continua na tela e ninguém percebe. */
        var agora = (window.performance && window.performance.now)
                        ? window.performance.now()
                        : Date.now();

        if (agora - horaDoUltimoQuadro >= esperaEntreQuadros) {
            horaDoUltimoQuadro = agora;

            if (!desenharQuadro()) {
                return;   /* deu erro; o desligar() já cuidou de tudo */
            }
        }

        if (temCallbackDeVideo) {
            video.requestVideoFrameCallback(proximoQuadro);
        } else {
            window.requestAnimationFrame(proximoQuadro);
        }
    }

    function ligar() {
        if (ligado) {
            return;
        }

        medir();

        /* Sem medida do vídeo ou da caixa não há o que copiar ainda.
           Saímos sem esconder nada e tentamos de novo no próximo aviso —
           esconder o vídeo agora deixaria a caixa vazia na tela. */
        if (!video.videoWidth || !video.videoHeight || !largura || !altura) {
            return;
        }

        /* O PRIMEIRO QUADRO É DESENHADO ANTES DE ESCONDER O VÍDEO.
           Na ordem contrária a caixa piscaria vazia por um instante. E se
           este primeiro quadro falhar, nem escondemos o vídeo. */
        if (!desenharQuadro()) {
            return;
        }

        ligado = true;
        caixa.classList.add('chave-ligada');
        proximoQuadro();
    }

    /* Quando a pessoa pausa, o laço para junto: o último quadro fica
       parado na tela, e o computador descansa. */
    video.addEventListener('pause', function () {
        ligado = false;
    });

    video.addEventListener('play', function () {
        if (!ligado && caixa.classList.contains('chave-ligada')) {
            ligado = true;
            proximoQuadro();
        }
    });

    /* Se a caixa mudar de tamanho (a pessoa virou o celular, ou puxou a
       beirada da janela), medimos de novo. A conta do cover no próximo
       quadro já se ajusta sozinha. */
    if (typeof window.ResizeObserver === 'function') {
        new window.ResizeObserver(medir).observe(caixa);
    } else {
        window.addEventListener('resize', medir);
    }

    /* readyState >= 2 quer dizer que já existe pelo menos um quadro para
       copiar. Se o vídeo ainda estiver carregando, esperamos o aviso.

       Escutamos DOIS avisos, e não um: se o primeiro chegar cedo demais
       (acontece), o ligar() sai sem fazer nada e o segundo aviso lhe dá
       outra chance. Depois que ele pega, a trava lá dentro impede que o
       trabalho seja refeito. */
    if (video.readyState >= 2) {
        ligar();
    }
    video.addEventListener('loadeddata', ligar);
    video.addEventListener('canplay', ligar);


    /* ==================================================================
       O VIGIA: o vídeo só roda quando a seção está na tela
       ------------------------------------------------------------------
       Antes o vídeo tinha "autoplay" no HTML: ele começava a baixar os
       12 MB assim que a página abria, mesmo para quem nunca descia até
       aqui, e ficava rodando (e recortando) atrás do visitante o tempo
       todo, gastando bateria à toa.

       Agora quem manda tocar é este vigia. Ele avisa quando a caixa
       entra e sai da tela; fora dela o vídeo pausa, e o laço do recorte
       para junto.

       O 0.15 quer dizer "quando 15% da caixa estiver aparecendo" — não
       esperamos ela inteira, senão o vídeo começaria tarde demais.
       ================================================================== */
    function mandarTocar() {
        if (pausadoPelaPessoa) {
            return;
        }
        var tentativa = video.play();
        if (tentativa && typeof tentativa.catch === 'function') {
            tentativa.catch(function () { });
        }
    }

    if (typeof window.IntersectionObserver === 'function') {
        new window.IntersectionObserver(function (avisos) {
            avisos.forEach(function (aviso) {
                if (aviso.isIntersecting) {
                    mandarTocar();
                } else if (!video.paused) {
                    video.pause();
                }
            });
        }, { threshold: 0.15 }).observe(caixa);
    } else {
        /* Navegador velho sem vigia: toca e pronto. Volta a ser como era
           antes, o que é pior, mas nunca deixa a caixa parada. */
        mandarTocar();
    }

});
