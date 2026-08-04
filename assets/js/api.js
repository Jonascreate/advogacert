/**
 * api.js — descobre onde fica o servidor
 * ======================================
 *
 * O site vive em dois lugares ao mesmo tempo:
 *
 *   www.agentej.us          → GitHub Pages. Só entrega arquivos. Não existe
 *                             /auth/google, /gpt.php nem /otp/enviar aqui:
 *                             o Pages responde 404/405 a qualquer um deles.
 *   advogacert.onrender.com → Node (server.js). É quem tem as rotas.
 *
 * Por isso os caminhos relativos não podem ser usados direto: no domínio
 * público eles batem no Pages e o login com Google e o chat falham.
 *
 * Este arquivo resolve o endereço uma vez só. Todo fetch do site passa por
 * `apiUrl(...)`, e o valor certo sai sozinho conforme onde a página está
 * aberta — inclusive em localhost, onde o server.js serve tudo junto e o
 * caminho relativo continua sendo o correto.
 *
 * Carregue ANTES de script.js.
 */
(function () {
    'use strict';

    var RENDER = 'https://advogacert.onrender.com';

    var host = window.location.hostname;

    // Quando a própria página já veio do servidor Node, o caminho relativo é o
    // certo — e é melhor que a URL fixa, porque evita uma requisição
    // cross-origin desnecessária e sobrevive a uma futura troca de hospedagem.
    var servidoPeloNode =
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '' ||                       // arquivo aberto direto do disco
        /\.onrender\.com$/.test(host);

    var BASE = servidoPeloNode ? '' : RENDER;

    /**
     * Monta a URL de uma rota do servidor.
     *   apiUrl('/gpt.php')  →  'https://advogacert.onrender.com/gpt.php'
     *                          (ou '/gpt.php' rodando local)
     */
    function apiUrl(caminho) {
        if (!caminho) return BASE;
        return BASE + (caminho.charAt(0) === '/' ? caminho : '/' + caminho);
    }

    window.API_BASE = BASE;
    window.apiUrl = apiUrl;

    /**
     * Endereço para onde o login social deve devolver a pessoa.
     * Sem isto, o Google devolveria em advogacert.onrender.com e o cliente
     * terminaria a compra num domínio que não é o do site.
     */
    window.apiRetornoOrigem = function () {
        return window.location.origin;
    };

    /**
     * Escreve o texto do bot num elemento, transformando endereços em links.
     *
     * POR QUE NÃO innerHTML: o texto vem de um modelo de linguagem, e o que
     * o cliente digita entra no que o modelo responde. Com innerHTML, bastaria
     * alguém pedir ao bot para repetir uma tag <script> e ela rodaria dentro
     * do site. Aqui cada pedaço de texto entra por textContent (que nunca
     * interpreta HTML) e só os links viram elementos de verdade.
     *
     * E o href passa por uma lista: mesmo que o modelo invente um endereço,
     * ele só vira link se apontar para o site, o WhatsApp ou um e-mail —
     * nunca para um domínio qualquer.
     */
    var PADRAO_LINK = /(https?:\/\/[^\s<>()]+|www\.[^\s<>()]+|wa\.me\/[0-9]+|mailto:[^\s<>()]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;

    var HOSTS_PERMITIDOS = ['agentej.us', 'www.agentej.us', 'wa.me', 'advogacert.onrender.com'];

    function hrefSeguro(bruto) {
        var texto = bruto.replace(/[.,;:!?]+$/, '');   // pontuação final não faz parte do endereço

        // e-mail solto vira mailto:
        if (/^[a-zA-Z0-9._%+-]+@/.test(texto)) return 'mailto:' + texto;
        if (/^mailto:/i.test(texto)) return texto;

        var comEsquema = /^https?:\/\//i.test(texto) ? texto : 'https://' + texto;

        try {
            var u = new URL(comEsquema);
            if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
            return HOSTS_PERMITIDOS.indexOf(u.hostname) === -1 ? null : u.href;
        } catch (e) {
            return null;
        }
    }

    window.escreverComLinks = function (el, texto) {
        el.textContent = '';

        var ultimo = 0;
        var m;
        PADRAO_LINK.lastIndex = 0;

        while ((m = PADRAO_LINK.exec(texto)) !== null) {
            if (m.index > ultimo) {
                el.appendChild(document.createTextNode(texto.slice(ultimo, m.index)));
            }

            var href = hrefSeguro(m[0]);

            if (href) {
                // a pontuação que veio grudada fica fora do link
                var visivel = m[0].replace(/[.,;:!?]+$/, '');
                var sobra = m[0].slice(visivel.length);

                var a = document.createElement('a');
                a.href = href;
                a.textContent = visivel;
                a.target = '_blank';
                // sem isto, a página aberta ganha acesso a esta pela window.opener
                a.rel = 'noopener noreferrer';
                a.style.color = '#6ee7c8';
                a.style.textDecoration = 'underline';
                el.appendChild(a);

                if (sobra) el.appendChild(document.createTextNode(sobra));
            } else {
                // endereço fora da lista: fica como texto, sem virar link
                el.appendChild(document.createTextNode(m[0]));
            }

            ultimo = m.index + m[0].length;
        }

        if (ultimo < texto.length) {
            el.appendChild(document.createTextNode(texto.slice(ultimo)));
        }
    };

    /**
     * Aponta os botões de login social para o servidor.
     *
     * O href fica "/auth/google" no HTML de propósito: se o JS não carregar,
     * o link ainda é visível e clicável em vez de virar um botão morto.
     * Aqui ele vira a URL completa do Node, com `retorno` dizendo em que
     * domínio a pessoa começou — é por ele que o servidor sabe devolver
     * para www.agentej.us no fim do fluxo.
     */
    function ligarBotoesSociais() {
        var links = document.querySelectorAll('a[data-auth]');
        for (var i = 0; i < links.length; i++) {
            var provider = links[i].getAttribute('data-auth');
            links[i].href = apiUrl('/auth/' + provider) +
                '?retorno=' + encodeURIComponent(window.location.origin);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ligarBotoesSociais);
    } else {
        ligarBotoesSociais();
    }
})();
