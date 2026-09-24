/* ==========================================================================
   BLOCO 03 — A CENA DOS CERTIFICADOS  |  JavaScript
   --------------------------------------------------------------------------
   Porte do bloco-03-servicos.js de Advoga_scroll/novo-site2.

   Este arquivo faz UMA coisa: transformar "quanto a pessoa já rolou" em
   "como o cubo e a fita de cards devem estar".

   COMO FUNCIONA, EM TRÊS PASSOS:
     1. Medimos quanto do percurso já passou. Isso vira um número de 0 a
        100 — a PORCENTAGEM DO PERCURSO.
     2. Uma tabela diz o que cada peça deve estar fazendo em cada
        porcentagem (as TABELAS DE MARCOS, mais abaixo).
     3. Entre um marco e o outro, calculamos o meio do caminho.

   ►►► DE ONDE VEIO A COREOGRAFIA ◄◄◄
   Do site de referência do novo-site2 (um template Webflow). Lá ela se
   chama "Services scroll", ação a-103, e o evento que a dispara é o
   e-521: SCROLLING_IN_VIEW, smoothing 90, startsEntering true,
   startsExiting false, sem offsets. Esses quatro últimos estão
   traduzidos na função medirRolagem(), lá embaixo.
   ========================================================================== */

'use strict';

document.addEventListener('DOMContentLoaded', function () {

    var trilho = document.querySelector('.cena-trilho');
    var palco  = document.querySelector('.cena-palco');
    var cubo   = document.querySelector('.cena-cubo');
    var fita   = document.querySelector('.cena-fita');

    if (!trilho || !palco || !cubo || !fita) {
        return;
    }

    /* --- QUEM NÃO RECEBE O EFEITO ---------------------------------------
       Em tela estreita e para quem pediu menos movimento, o CSS já
       desmontou tudo e virou uma lista comum. Se o script rodasse assim
       mesmo, ele escreveria transform nos elementos e bagunçaria a lista. */
    function efeitoDesligado() {
        return window.matchMedia('(max-width: 767px)').matches ||
               window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }


    /* ==================================================================
       AS TABELAS DE MARCOS
       ------------------------------------------------------------------
       Cada linha é [porcentagem do percurso, valor naquele ponto], em
       ordem crescente de porcentagem.

       Antes do primeiro marco o valor fica parado no primeiro; depois do
       último, parado no último. É por isso que nada pisca nas pontas.
       ================================================================== */

    /* ►►►►►► POR QUE ESTES NÚMEROS NÃO SÃO OS DO NOVO-SITE2 ◄◄◄◄◄◄
       ------------------------------------------------------------------
       Lá são QUATRO cards; aqui são CINCO — as cinco mídias de
       certificado. Cada card a mais é um tombo a mais do cubo e uma
       passagem a mais da fita, e tudo isso tem que caber na MESMA janela
       de palco travado. Então os marcos foram todos recalculados.

       A janela, com a pista de 400vh:

           trava em = tela / (tela + pista) = 1/5 = 20%
           solta em = pista / (tela + pista) = 4/5 = 80%

       Ou seja: há 60 pontos de percurso com o palco firme, e é dentro
       deles que a coreografia inteira precisa acontecer.


       ►►► REGRA 1: AS PASSAGENS TÊM QUE TER A MESMA DURAÇÃO. ◄◄◄

       Esse é o erro que o arquivo original já cometeu uma vez: ao
       reespaçar os marcos, as passagens saíram com durações diferentes, e
       na tela isso vira uma passagem visivelmente mais lenta que as
       outras, com os tombos do cubo caindo em lugares diferentes dentro
       de cada uma. O efeito perde o compasso.

       No template são 16 pontos cada. Aqui são 12 cada — o que importa
       não é o número, é os quatro serem o mesmo número:

           card 1 (G&D)      descansa aos 30   \
           card 2 (SafeNet)  descansa aos 42    |
           card 3 (Cartão)   descansa aos 54    |  12 pontos entre cada um
           card 4 (Bird ID)  descansa aos 66    |
           card 5 (A1)       descansa aos 78   /

       E o cubo faz cada volta nos 7 pontos logo depois de o card chegar,
       ficando parado o resto da passagem:

           30 -> 37  gira     37 -> 42  parado
           42 -> 49  tomba    49 -> 54  parado
           54 -> 61  tomba    61 -> 66  parado
           66 -> 73  gira     73 -> ... parado


       ►►► REGRA 2: O ÚLTIMO TOMBO TEM QUE ACABAR ANTES DA SOLTURA. ◄◄◄

           último tombo acaba aos   73
           palco solta aos          80

       São 7 pontos de folga. Se o tombo passasse dos 80, ele fecharia
       com a seção já subindo, fora da vista — e o defeito que aparece na
       tela é "o efeito da última face não completa, o cubo termina
       subindo". É por isso que a pista NÃO pode encurtar: com cinco
       cards essa folga já é menor que a do original.

       ► AS DUAS REGRAS ANDAM JUNTAS, e é fácil consertar uma quebrando a
         outra. Mexeu em uma, confira as duas.


       ►►► O CUBO NASCE ANTES DE O PALCO TRAVAR. ◄◄◄

       AOS 4%, e esse número foi medido, não chutado.

       Ele era 10%, herdado do novo-site2, e ali ficava um vão morto: a
       pessoa passava o título da seção, olhava para baixo e via uma tela
       inteira de nada antes de o cubo aparecer.

       A conta de onde o percurso está quando o título acaba de subir:

           percurso = (tela - topo da pista) / (tela + pista)

       Numa janela de ~590px, com o título da seção no meio da tela, a
       pista começa uns 460px abaixo do topo. Ou seja:

           (590 - 460) / (590 + 4x590) = 130 / 2950 = 4,4%

       É nesse instante que a pista encosta na tela, e é aí que o cubo
       tem que começar a nascer. Daí o 4.

       ► O QUE ESTRAGA NÃO É NASCER CEDO, É CRESCER CEDO. Cubo em tamanho
         cheio parado fora do centro, com um buraco em cima, fica feio na
         hora. A regra: pode nascer bem antes da trava (20%), mas o fim do
         crescimento tem que cair DEPOIS dela — por isso o 28 continua
         onde estava. Nascer aos 4 e só ficar inteiro aos 28 quer dizer
         que ele cresce durante um quarto do percurso, devagar, em vez de
         brotar pronto.

       ► O PISO É 0. Antes disso a pista nem encostou na tela, e o cubo
         estaria sendo desenhado fora da vista, à toa.
       ================================================================== */

    /* AS FACES QUE VÊM PARA A FRENTE, em ordem, e o card de cada uma:

           rotateX  0   rotateY   0   ->  FRENTE    card 1  G&D
           rotateX  0   rotateY  90   ->  ESQUERDA  card 2  SafeNet
           rotateX 90   rotateY   0   ->  BAIXO     card 3  Cartão
           rotateX  0   rotateY 180   ->  TRÁS      card 4  Bird ID
           rotateX  0   rotateY 270   ->  DIREITA   card 5  A1

       Repare que os dois eixos andam JUNTOS nos tombos do meio. Não é
       erro: é assim que o cubo TOMBA em vez de girar como porta, e é o
       que dá o jeitão de dado rolando.

       ► A face de CIMA não está na lista, mas ela aparece: no meio da
         entrada, quando o cubo desvira os 180° do eixo X, ele passa pelos
         -90° e a mostra de relance. Por isso ela leva imagem própria
         (A_SAFENET) em vez de uma repetição — senão a mesma mídia
         apareceria duas vezes. */

    /* O CUBO no eixo X */
    var giroX = [[4, -180], [28, 0], [30, 0], [37, 0], [42, 0],
                 [49, 90], [54, 90], [61, 0], [66, 0], [73, 0]];

    /* O CUBO no eixo Y — os mesmos marcos, para os dois lerem em par */
    var giroY = [[4, 0], [28, 0], [30, 0], [37, 90], [42, 90],
                 [49, 0], [54, 0], [61, 180], [66, 180], [73, 270]];

    /* ►► BOTÃO 3 DE 3: ONDE O CUBO NASCE.
       Quanto ele nasce ACIMA do centro do palco, em vh. Com o palco
       ocupando a tela inteira, o valor em vh vira porcentagem do palco na
       razão de 1 para 1. Ele desce daqui até o centro (o zero) enquanto
       cresce.

       Era -33, o valor do novo-site2, e ali ficava um vão morto enorme
       entre o título da seção e o cubo. O motivo: NO INÍCIO O PALCO AINDA
       NÃO ESTÁ NA TELA INTEIRA. Ele só gruda no topo aos 20%; antes
       disso está entrando por baixo, e o seu centro fica lá para o pé da
       janela. Com -33 o cubo nascia a um terço de tela acima de um centro
       que já estava fora — ou seja, ainda bem abaixo do título.

       -45 encosta o cubo quase no topo do palco, que é o mais alto que
       ele pode nascer.

       ► O TETO É -50: aí o centro do cubo cai exatamente na beirada de
         cima do palco, e o overflow: hidden começa a cortá-lo pela
         metade. Não passe disso.
       ► PARA ELE NASCER JÁ NO CENTRO: troque o -45 por 0.
       ► Os outros dois botões são o --lado-cubo e o --subir, os dois no
         CSS.


       ►►►►►► O SEGUNDO NÚMERO É 20, E ELE É A TRAVA DO PALCO. ◄◄◄◄◄◄

       Não é um 20 qualquer: é exatamente o instante em que o palco gruda
       no topo (tela / (tela + pista) = 1/5). Os dois movimentos que
       mexem o cubo na vertical terminam JUNTOS, e é isso que faz a
       descida ser reta.

       Ele já foi 28, e aí os dois andavam DESENCONTRADOS: o palco parava
       aos 20 e o cubo continuava descendo até 28. Simulando numa janela
       de 590px, o centro do cubo fazia

           502 -> 207 -> 295px

       ou seja, subia, PASSAVA DO PONTO e voltava. Na tela isso é um
       vaivém no fim da entrada, e foi o que apareceu como "precisa
       sincronizar". Com 20, a mesma simulação dá

           502 -> 450 -> 398 -> 347 -> 295px  e para

       — uma linha reta que morre no meio da tela.

       ► SE MUDAR A ALTURA DA PISTA, este número muda junto: ele é sempre
         1 / (1 + pista_em_telas), a mesma conta da trava que está no
         CSS, em cima de .cena-trilho.
       ► O CRESCIMENTO (a tabela "escala") continua acabando aos 28, e
         isso é de propósito: a regra é que ele termine DEPOIS da trava.
         Posição e tamanho não precisam acabar juntos — quem precisava
         encontrar a trava era a posição. */
    /* ►►►►►► O MARCO DO MEIO (-45 repetido aos 10%) É O QUE TIRA O CUBO
              DO PÉ DA TELA. NÃO APAGUE. ◄◄◄◄◄◄

       O problema que ele resolve: o cubo se posiciona em relação ao
       CENTRO DO PALCO, e no começo o palco ainda está entrando por baixo
       — o centro dele está lá no pé da janela. Com uma descida direta de
       -45 até 0, o cubo já estava em -28 na metade da entrada e seguia
       esse centro, aparecendo bem abaixo do título.

       Segurando os -45 até os 10%, ele gruda no alto do palco enquanto o
       palco sobe, e só então assenta. Numa janela de 588px, o centro do
       cubo faz:

           441 -> 382 -> 323 -> 318 -> 312 -> 306 -> 300 -> 294px

       Sempre descendo, sem passar do ponto, e a partir dos 10% já
       praticamente no meio (294px). Antes essa mesma conta dava 423px
       aos 10% — cem pixels mais abaixo.

       ► POR QUE NÃO SEGURAR MAIS, ATÉ OS 14%: aí o cubo passa acima da
         beirada de cima do PALCO, e o overflow: hidden dele corta o cubo
         pela metade. Conferido: com o platô em 14% ele é cortado aos 12 e
         aos 14, e ainda volta a subir e descer. Os 10% são o limite.
       ► O TETO CONTINUA SENDO -50 pelo mesmo motivo. */
    var descida = [[4, -45], [10, -45], [20, 0]];

    /* O CUBO, de encolhido a tamanho normal */
    var escala = [[4, 0], [28, 1]];

    /* O PALCO INTEIRO, aparecendo.
       ► É seguro mexer em opacidade num grupo que contém um cubo 3D SÓ
         POR CAUSA DO TEMPO: a opacidade termina aos 13%, e nessa altura o
         cubo tem uns 17% do tamanho. Grupo translúcido com cubo 3D dentro
         quer dizer "vejo as faces de trás por transparência", e num cubo
         desse tamanho ninguém nota. Mantenha a regra: a opacidade tem que
         TERMINAR enquanto o cubo ainda é pequeno. */
    var aparicao = [[4, 0], [8, 1]];

    /* A FITA DE CARDS, deslizando para a esquerda (em vw).
       Começa em +100vw — uma tela inteira à direita, fora da vista — e é
       por isso que os textos entram PELA DIREITA.

       ► REPARE NAS TRÊS VELOCIDADES. Elas não são iguais, e no template
         também não são: a proporção é que foi copiada.

             entrada  21 -> 30   150vw em  9 pontos = 16,7 vw/ponto
             cards    12 pontos cada, 100vw         =  8,3 vw/ponto
             saída    78 -> 86    50vw em  8 pontos =  6,3 vw/ponto

         A fita entra rápido, anda no compasso dos cards e sai devagar.
         Depois dos 86% ela não se mexe mais: a seção já está subindo, e
         qualquer movimento ali brigaria com a rolagem da página. */
    var deslize = [[21, 100], [30, -50], [42, -150], [54, -250],
                   [66, -350], [78, -450], [86, -500]];


    /* --- ARREDONDAR IGUAL AO WEBFLOW ------------------------------------
       O motor do Webflow passa todo número por uma funçãozinha que corta
       em 5 casas decimais e zera qualquer coisa menor que 0,0001.
       Copiamos porque é ela que faz o movimento PARAR: quando o resto
       vira zero, o laço tem como saber que chegou. */
    function arredondar(v) {
        var r = Math.round(v * 100000) / 100000;
        return Math.abs(r) > 0.0001 ? r : 0;
    }


    /* --- A CONTA DO MEIO DO CAMINHO -------------------------------------
       Recebe a tabela e a porcentagem atual, devolve o valor.

       O original usa easing vazio em todos os keyframes, e no motor do
       Webflow easing vazio quer dizer LINHA RETA. Então aqui também é
       reta: nada de aceleração entre um marco e outro. A maciez vem toda
       do amaciador, mais abaixo. */
    function valorEm(tabela, porcento) {

        /* antes do primeiro marco: fica parado no primeiro */
        if (porcento <= tabela[0][0]) {
            return tabela[0][1];
        }

        /* depois do último: fica parado no último */
        var ultimo = tabela[tabela.length - 1];
        if (porcento >= ultimo[0]) {
            return ultimo[1];
        }

        /* no meio: acha os dois marcos que cercam a porcentagem atual */
        for (var i = 0; i < tabela.length - 1; i++) {
            var de  = tabela[i];
            var ate = tabela[i + 1];

            if (porcento >= de[0] && porcento <= ate[0]) {
                /* o quanto já andamos ENTRE esses dois marcos, de 0 a 1 */
                var caminho = (porcento - de[0]) / (ate[0] - de[0]);
                return de[1] + (ate[1] - de[1]) * caminho;
            }
        }

        return ultimo[1];
    }


    /* ==================================================================
       O AMACIADOR
       ------------------------------------------------------------------
       A referência usa "smoothing: 90". No motor do Webflow a conta é
       literalmente esta:

           passo = max(1 - smoothing/100, 0.01)      ->  1 - 0.90 = 0.10
           atual = atual + (alvo - atual) * passo

       A cada quadro o efeito anda 10% da distância que falta. Ele
       PERSEGUE a rolagem em vez de obedecer na hora, e é isso que dá peso
       de objeto de verdade — quando a pessoa para de rolar, o cubo ainda
       gira um tico antes de assentar.

       ► ATENÇÃO: este amaciador suaviza O EFEITO, não A ROLAGEM. Se o
         movimento parecer aos trancos, o problema está no passo do rolete
         do mouse, que é grosso por natureza. O site de referência disfarça
         isso com a biblioteca Lenis, que amacia a página inteira; aqui não
         temos Lenis (ela mexeria em todos os outros blocos). */
    var SMOOTHING = 90;
    var PASSO = Math.max(1 - SMOOTHING / 100, 0.01);

    var porcentoAlvo  = 0;   /* onde a rolagem diz que deveríamos estar */
    var porcentoAtual = 0;   /* onde de fato estamos, correndo atrás */
    var rodando       = false;


    /* --- Medir a rolagem ------------------------------------------------
       ► ESTA É A CONTA DA REFERÊNCIA, e ela não é a óbvia.

       Com startsEntering: true, startsExiting: false e sem offsets, a
       conta do progresso no motor do Webflow vira exatamente isto:

           progresso = (altura da tela - topo da caixa)
                       / (altura da tela + altura da caixa)

       Em português: o percurso começa a contar no instante em que a seção
       ENCOSTA NA BEIRADA DE BAIXO DA TELA — e não quando o palco gruda no
       topo. Por isso o percurso total não é a altura da pista: é a altura
       da pista MAIS uma tela.

           0%   = topo da pista encostando na beirada de baixo da tela
           100% = fim da pista saindo pela beirada de cima

       É essa conta que faz os primeiros 20% (onde quase nada acontece)
       caírem exatamente sobre a ENTRADA da seção. */
    function medirRolagem() {
        var caixa = trilho.getBoundingClientRect();
        var tela  = window.innerHeight;

        var total = tela + caixa.height;
        if (total <= 0) {
            return;
        }

        var andado = Math.min(Math.max(0, tela - caixa.top), total) / total;

        porcentoAlvo = andado * 100;
    }


    /* --- Desenhar o quadro ---------------------------------------------- */
    function aplicar() {
        var p = porcentoAtual;

        var s = valorEm(escala, p);
        var y = valorEm(descida, p);

        /* ►►►►►► A ORDEM DESTA LINHA É O CONSERTO MAIS IMPORTANTE DO
                  ARQUIVO INTEIRO. NÃO TROQUE A ORDEM. ◄◄◄◄◄◄

           O motor do Webflow monta o transform SEMPRE nesta ordem fixa:

               translate3d(...) scale3d(...) rotateX(...) rotateY(...) rotateZ(...)

           Repare: a ESCALA VEM ANTES DOS GIROS. Escrever
           "rotateX() rotateY() scale()" parece dar no mesmo e NÃO DÁ:

           - No CSS o transform da direita é aplicado primeiro, e cada um
             à esquerda age sobre o resultado do anterior.
           - scale() mexe em largura e altura, mas NÃO na profundidade.
           - Com a escala por último, ela aperta largura e altura DO CUBO
             JÁ DEITADO. Com o cubo tombado 90°, a "altura" dele aponta
             para o fundo da tela — então a escala aperta a profundidade e
             deixa a altura de fora. Resultado: o cubo chega ESTICADO NA
             VERTICAL, e a imagem da face junto.
           - Com a escala primeiro, o cubo gira inteiro e rígido, e só
             depois o conjunto encolhe por igual.

           rotateZ fica zerado porque a coreografia não mexe nele. Está
           aqui só para o navegador não ter que remontar a matriz de um
           jeito diferente a cada quadro. */
        cubo.style.transform =
            'translate3d(0px, ' + y.toFixed(3) + 'vh, 0px) ' +
            'scale3d(' + s.toFixed(4) + ', ' + s.toFixed(4) + ', 1) ' +
            'rotateX(' + valorEm(giroX, p).toFixed(2) + 'deg) ' +
            'rotateY(' + valorEm(giroY, p).toFixed(2) + 'deg) ' +
            'rotateZ(0deg)';

        /* ►► O PONTO DE FUGA DESCE JUNTO COM O CUBO.
           A perspectiva mira, por padrão, o meio do palco. Se o cubo se
           desloca e a mira fica parada, a câmera passa a olhá-lo de
           ângulo: o rosto inclina e aparece uma face lateral, sem nenhum
           giro ter mudado.

           Como o palco tem exatamente uma tela de altura, o deslocamento
           em vh vira porcentagem do palco na razão de 1 para 1 — por isso
           dá para somar direto no 50%.

           ►► O "- var(--subir)" NÃO É SOBRA: ele é o que faz esta linha
              conviver com a subida fixa do CSS.

              Esta linha SOBRESCREVE o perspective-origin declarado lá, e
              enquanto o --subir era zero isso não fazia diferença. Agora
              que ele vale 6rem, escrever só a porcentagem apagaria a
              subida da mira — o cubo subiria e a câmera continuaria
              olhando o meio do palco, ou seja, passaria a vê-lo DE BAIXO:
              o rosto inclina para trás e aparece a face inferior, sem
              nenhum giro ter mudado.

              O calc() soma as duas coisas: a parte que muda a cada quadro
              (a descida) e a parte fixa (o --subir), esta lida direto da
              variável, em rem. Mexer no --subir no CSS continua bastando. */
        palco.style.perspectiveOrigin =
            '50% calc(' + (50 + y).toFixed(3) + '% - var(--subir))';

        palco.style.opacity = valorEm(aparicao, p).toFixed(3);

        /* A FITA.
           translate3d, e não translateX, de propósito: o "3d" faz o
           navegador entregar o trabalho para a placa de vídeo, e o
           deslize fica liso. */
        fita.style.transform =
            'translate3d(' + valorEm(deslize, p).toFixed(3) + 'vw, 0px, 0px)';
    }


    /* --- O laço --------------------------------------------------------
       Roda a cada quadro ENQUANTO ainda há diferença entre onde estamos e
       onde deveríamos estar. Quando o arredondamento zera o que falta, o
       laço para sozinho e o computador descansa até a próxima rolagem. */
    function laco() {
        var falta = arredondar(porcentoAlvo - porcentoAtual);

        if (falta === 0) {
            porcentoAtual = porcentoAlvo;
            aplicar();
            rodando = false;      /* chegou: para o laço */
            return;
        }

        porcentoAtual = arredondar(porcentoAtual + falta * PASSO);
        aplicar();
        window.requestAnimationFrame(laco);
    }

    function acordar() {
        if (efeitoDesligado()) {
            return;
        }

        medirRolagem();

        if (!rodando) {
            rodando = true;
            window.requestAnimationFrame(laco);
        }
    }


    /* --- Ligando na página ----------------------------------------------
       passive: true avisa o navegador que não vamos atrapalhar a rolagem.
       Sem isso ele espera nosso código terminar antes de rolar a página. */
    window.addEventListener('scroll', acordar, { passive: true });
    window.addEventListener('resize', acordar);

    /* E uma primeira conferida agora: se a pessoa recarregou a página já
       no meio da seção, tudo precisa nascer na posição certa. */
    if (!efeitoDesligado()) {
        medirRolagem();
        porcentoAtual = porcentoAlvo;   /* sem amaciar a primeira vez,
                                           senão a página abre animando */
        aplicar();
    }

});
