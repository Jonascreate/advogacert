/* Questionário do botão de WhatsApp do topo (.nav-status).
 *
 * O botão abria a conversa com o Jonas direto, sem saber quem chamava. Agora
 * abre este questionário: e-mail, WhatsApp e OAB. Sem OAB, avisa e pede o
 * perfil (perito, juiz, contador, médico, PJ) e o nome. As respostas vão
 * para /contato/whatsapp no servidor, que repassa ao n8n: o Jonas recebe o
 * resumo e o cliente recebe uma confirmação no próprio WhatsApp.
 *
 * Se este script não carregar, o link continua levando ao wa.me — o
 * questionário só intercepta o clique.
 */
(function () {
    'use strict';

    var botao = document.querySelector('.nav-status');
    if (!botao || !window.apiUrl) return;

    var PERFIS = ['Perito', 'Juiz', 'Contador', 'Médico', 'Pessoa jurídica'];

    var fundo = document.createElement('div');
    fundo.className = 'cr-fundo';
    fundo.innerHTML =
        '<div class="cr-caixa" role="dialog" aria-modal="true" aria-labelledby="cr-titulo">' +
            '<button type="button" class="cr-fechar" aria-label="Fechar">&times;</button>' +
            '<h2 class="cr-titulo" id="cr-titulo">Fale com o suporte</h2>' +

            '<form class="cr-passo ativo" data-passo="contato" novalidate>' +
                '<p class="cr-sub">Responda rapidinho e a gente chama você no WhatsApp.</p>' +
                '<div class="cr-campo"><label for="cr-email">E-mail</label>' +
                    '<input id="cr-email" type="email" autocomplete="email" placeholder="seu@email.com"></div>' +
                '<div class="cr-campo"><label for="cr-whats">WhatsApp</label>' +
                    '<input id="cr-whats" type="tel" inputmode="tel" autocomplete="tel" placeholder="(DDD) 99999-9999"></div>' +
                '<div class="cr-campo"><label for="cr-oab">OAB <small>(se for advogado)</small></label>' +
                    '<input id="cr-oab" autocomplete="off" placeholder="123456/GO"></div>' +
                '<button type="submit" class="cr-btn">Continuar</button>' +
            '</form>' +

            '<form class="cr-passo" data-passo="perfil" novalidate>' +
                '<p class="cr-aviso">Vimos que não é advogado, ou esqueceu a sua OAB.</p>' +
                '<p class="cr-sub">Escolha na lista:</p>' +
                '<div class="cr-perfis"></div>' +
                '<div class="cr-campo cr-campo-nome" hidden><label for="cr-nome">Seu nome</label>' +
                    '<input id="cr-nome" autocomplete="name" placeholder="Como gosta de ser chamado"></div>' +
                '<button type="submit" class="cr-btn" hidden>Enviar</button>' +
                '<button type="button" class="cr-link" data-voltar>Tenho OAB, voltar</button>' +
            '</form>' +

            '<div class="cr-passo" data-passo="pronto">' +
                '<p class="cr-sub" style="margin-top:6px">Pronto. Mandamos uma mensagem no seu WhatsApp e o Jonas vai falar com você por lá.</p>' +
                '<button type="button" class="cr-btn" data-fechar>Fechar</button>' +
            '</div>' +

            '<div class="cr-msg" role="status" aria-live="polite"></div>' +
        '</div>';
    document.body.appendChild(fundo);

    var q = function (s) { return fundo.querySelector(s); };
    var msg = q('.cr-msg');
    var formContato = q('[data-passo="contato"]');
    var formPerfil = q('[data-passo="perfil"]');
    var campoNome = q('.cr-campo-nome');
    var botaoEnviar = formPerfil.querySelector('.cr-btn');
    var perfilEscolhido = null;

    PERFIS.forEach(function (p) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'cr-perfil';
        b.textContent = p;
        b.addEventListener('click', function () {
            perfilEscolhido = p;
            fundo.querySelectorAll('.cr-perfil').forEach(function (x) { x.classList.toggle('ativo', x === b); });
            campoNome.hidden = false;
            botaoEnviar.hidden = false;
            q('#cr-nome').focus();
            aviso('');
        });
        q('.cr-perfis').appendChild(b);
    });

    function aviso(texto) { msg.textContent = texto; }

    function mostrar(passo) {
        fundo.querySelectorAll('.cr-passo').forEach(function (p) {
            p.classList.toggle('ativo', p.getAttribute('data-passo') === passo);
        });
        aviso('');
    }

    function abrir() {
        // quem já entrou no site não precisa digitar de novo
        try {
            var u = JSON.parse(sessionStorage.getItem('user') || 'null');
            if (u) {
                if (u.email && !q('#cr-email').value) q('#cr-email').value = u.email;
                if (u.telefone && !q('#cr-whats').value) q('#cr-whats').value = u.telefone;
                if (u.oab && !q('#cr-oab').value) q('#cr-oab').value = u.oab;
                if (u.nome && !q('#cr-nome').value) q('#cr-nome').value = u.nome;
            }
        } catch (_) {}
        mostrar('contato');
        fundo.classList.add('aberto');
        document.body.style.overflow = 'hidden';
        setTimeout(function () { q('#cr-email').focus(); }, 50);
    }

    function fechar() {
        fundo.classList.remove('aberto');
        document.body.style.overflow = '';
    }

    function dadosContato() {
        return {
            email: q('#cr-email').value.trim(),
            whatsapp: q('#cr-whats').value.trim(),
            oab: q('#cr-oab').value.trim()
        };
    }

    function enviar(dados, botaoAtivo) {
        botaoAtivo.disabled = true;
        aviso('');
        botaoAtivo.dataset.texto = botaoAtivo.textContent;
        botaoAtivo.textContent = 'Enviando...';
        fetch(window.apiUrl('/contato/whatsapp'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                botaoAtivo.disabled = false;
                botaoAtivo.textContent = botaoAtivo.dataset.texto;
                if (d && d.success) {
                    if (window.telemetriaEvento) window.telemetriaEvento('contato_rapido_enviado');
                    mostrar('pronto');
                    return;
                }
                aviso((d && d.error) || 'Não foi possível enviar agora.');
            })
            .catch(function () {
                botaoAtivo.disabled = false;
                botaoAtivo.textContent = botaoAtivo.dataset.texto;
                aviso('Sem conexão com o servidor. Tente de novo.');
            });
    }

    formContato.addEventListener('submit', function (e) {
        e.preventDefault();
        var d = dadosContato();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) { aviso('Informe um e-mail válido.'); return; }
        if (d.whatsapp.replace(/\D/g, '').length < 10) { aviso('Informe o WhatsApp com DDD.'); return; }
        if (d.oab) {
            if (!/^\d{3,6}\s*\/?\s*[A-Za-z]{2}$/.test(d.oab.replace(/\s/g, ''))) {
                aviso('Confira a OAB no formato 123456/GO.');
                return;
            }
            enviar(d, formContato.querySelector('.cr-btn'));
            return;
        }
        // sem OAB: pergunta o perfil e, depois, o nome
        perfilEscolhido = null;
        fundo.querySelectorAll('.cr-perfil').forEach(function (x) { x.classList.remove('ativo'); });
        campoNome.hidden = true;
        botaoEnviar.hidden = true;
        mostrar('perfil');
    });

    formPerfil.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!perfilEscolhido) { aviso('Escolha uma opção da lista.'); return; }
        var nome = q('#cr-nome').value.trim();
        if (nome.length < 2) { aviso('Informe seu nome.'); return; }
        var d = dadosContato();
        d.oab = '';
        d.perfil = perfilEscolhido;
        d.nome = nome;
        enviar(d, botaoEnviar);
    });

    q('[data-voltar]').addEventListener('click', function () {
        mostrar('contato');
        q('#cr-oab').focus();
    });

    botao.addEventListener('click', function (e) {
        e.preventDefault();
        abrir();
    });
    q('.cr-fechar').addEventListener('click', fechar);
    q('[data-fechar]').addEventListener('click', fechar);
    fundo.addEventListener('click', function (e) { if (e.target === fundo) fechar(); });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && fundo.classList.contains('aberto')) fechar();
    });
})();
