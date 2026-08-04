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
