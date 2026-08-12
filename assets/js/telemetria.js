/* Telemetria comercial anônima — nunca envia conteúdo de campos ou dados pessoais. */
(function () {
    'use strict';
    if (!window.apiUrl || document.documentElement.hasAttribute('data-sem-telemetria')) return;

    var consentimento = localStorage.getItem('advogacert_analytics');
    if (consentimento !== 'aceito') {
        if (consentimento !== 'recusado') {
            var mostrarConsentimento = function () {
                var caixa = document.createElement('div');
                caixa.setAttribute('role', 'dialog');
                caixa.setAttribute('aria-label', 'Preferências de privacidade');
                caixa.style.cssText = 'position:fixed;z-index:2147483647;left:1rem;right:1rem;bottom:1rem;max-width:680px;margin:auto;padding:1rem 1.1rem;background:#151518;color:#f4f4f5;border:1px solid rgba(110,231,200,.3);border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,.45);font:14px/1.45 Inter,Arial,sans-serif';
                var texto = document.createElement('p');
                texto.textContent = 'Podemos usar métricas anônimas para entender páginas visitadas, cliques, downloads e tempo de uso. Não coletamos o conteúdo digitado, OAB, telefone ou e-mail.';
                texto.style.margin = '0 0 .85rem';
                var acoes = document.createElement('div');
                acoes.style.cssText = 'display:flex;gap:.6rem;flex-wrap:wrap';
                function botao(rotulo, valor, destaque) {
                    var b = document.createElement('button');
                    b.type = 'button'; b.textContent = rotulo;
                    b.style.cssText = 'padding:.65rem .9rem;border-radius:9px;cursor:pointer;border:1px solid rgba(255,255,255,.18);font-weight:700;' +
                        (destaque ? 'background:#6ee7c8;color:#062018' : 'background:transparent;color:#f4f4f5');
                    b.onclick = function () { localStorage.setItem('advogacert_analytics', valor); caixa.remove(); if (valor === 'aceito') location.reload(); };
                    return b;
                }
                acoes.appendChild(botao('Aceitar métricas', 'aceito', true));
                acoes.appendChild(botao('Recusar', 'recusado', false));
                caixa.appendChild(texto); caixa.appendChild(acoes); document.body.appendChild(caixa);
            };
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mostrarConsentimento);
            else mostrarConsentimento();
        }
        return;
    }

    function uuid() {
        if (crypto.randomUUID) return crypto.randomUUID();
        var b = crypto.getRandomValues(new Uint8Array(16));
        b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
        return Array.from(b).map(function (x, i) {
            return ([4, 6, 8, 10].indexOf(i) >= 0 ? '-' : '') + x.toString(16).padStart(2, '0');
        }).join('');
    }
    var chave = 'advogacert_sessao_anonima';
    var sessao;
    try {
        sessao = sessionStorage.getItem(chave);
        if (!sessao) {
            sessao = uuid();
            sessionStorage.setItem(chave, sessao);
        }
    } catch (_) {
        sessao = uuid();
    }

    var params = new URLSearchParams(location.search);
    var inicioAtivo = Date.now();
    var ativoMs = 0;
    var maiorRolagem = 0;
    var formulariosIniciados = new WeakSet();

    function dispositivo() {
        if (/Mobi|Android/i.test(navigator.userAgent)) return 'celular';
        if (/Tablet|iPad/i.test(navigator.userAgent)) return 'tablet';
        return 'desktop';
    }

    function base(evento, dados) {
        return {
            sessao_id: sessao,
            evento: evento,
            pagina: location.pathname.replace(/^\//, '') || 'index.html',
            secao: dados && dados.secao || null,
            servico: dados && dados.servico || null,
            plano: dados && dados.plano || null,
            origem: params.get('utm_source') || (document.referrer ? 'referencia' : 'direto'),
            referencia: document.referrer ? new URL(document.referrer).hostname : null,
            utm_source: params.get('utm_source'),
            utm_medium: params.get('utm_medium'),
            utm_campaign: params.get('utm_campaign'),
            utm_content: params.get('utm_content'),
            utm_term: params.get('utm_term'),
            tempo_ativo_segundos: dados && dados.tempo_ativo_segundos,
            profundidade_rolagem: dados && dados.profundidade_rolagem,
            dispositivo: dispositivo(),
            largura_tela: window.innerWidth,
            dados: dados && dados.dados || {}
        };
    }

    function enviar(evento, dados, beacon) {
        var corpo = JSON.stringify(base(evento, dados || {}));
        if (beacon && navigator.sendBeacon) {
            navigator.sendBeacon(apiUrl('/telemetria/evento'), new Blob([corpo], { type: 'text/plain' }));
            return;
        }
        fetch(apiUrl('/telemetria/evento'), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: corpo, keepalive: true
        }).catch(function () {});
    }

    window.telemetriaEvento = enviar;
    window.telemetriaSessao = sessao;
    enviar('pagina_visualizada');

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) { ativoMs += Date.now() - inicioAtivo; }
        else { inicioAtivo = Date.now(); }
    });

    addEventListener('scroll', function () {
        var total = Math.max(1, document.documentElement.scrollHeight - innerHeight);
        maiorRolagem = Math.max(maiorRolagem, Math.min(100, Math.round(scrollY / total * 100)));
    }, { passive: true });

    if ('IntersectionObserver' in window) {
        var vistas = new Set();
        var inicioSecoes = new Map();
        var observador = new IntersectionObserver(function (entradas) {
            entradas.forEach(function (e) {
                var id = e.target.id || e.target.getAttribute('data-telemetria-secao');
                if (!id) return;
                if (e.isIntersecting) {
                    inicioSecoes.set(id, Date.now());
                    if (!vistas.has(id)) {
                        vistas.add(id);
                        enviar('secao_visualizada', { secao: id });
                    }
                } else if (inicioSecoes.has(id)) {
                    var segundos = Math.round((Date.now() - inicioSecoes.get(id)) / 1000);
                    inicioSecoes.delete(id);
                    if (segundos > 0) enviar('secao_tempo', { secao: id, tempo_ativo_segundos: segundos });
                }
            });
        }, { threshold: 0.45 });
        document.querySelectorAll('section[id], [data-telemetria-secao]').forEach(function (s) { observador.observe(s); });
    }

    document.addEventListener('click', function (e) {
        var alvo = e.target.closest('a,button');
        if (!alvo) return;
        var plano = alvo.dataset && alvo.dataset.plano;
        if (plano) enviar('plano_clicado', { plano: plano });
        // O anúncio do curso no index e qualquer chamada que leve à página dele.
        if (alvo.matches('.curso-anuncio, [href*="curso.html"]')) enviar('curso_clicado');
        if (alvo.matches('.btn-anydesk, [href*="anydesk.com"]')) enviar('download_anydesk');
        if (alvo.matches('[data-driver], .cert-card[href]')) enviar('download_driver', { servico: alvo.dataset.driver || alvo.getAttribute('aria-label') });
        if (/wa\.me|whatsapp/i.test(alvo.href || '')) enviar('whatsapp_clicado');
    });

    document.addEventListener('focusin', function (e) {
        var form = e.target.closest('form');
        if (!form || formulariosIniciados.has(form)) return;
        formulariosIniciados.add(form);
        enviar('formulario_iniciado', { dados: { formulario: form.id || 'sem_id' } });
    });
    document.addEventListener('submit', function (e) {
        enviar('formulario_enviado', { dados: { formulario: e.target.id || 'sem_id' } });
    });

    addEventListener('pagehide', function () {
        if (!document.hidden) ativoMs += Date.now() - inicioAtivo;
        enviar('pagina_encerrada', {
            tempo_ativo_segundos: Math.min(86400, Math.round(ativoMs / 1000)),
            profundidade_rolagem: maiorRolagem
        }, true);
        if (typeof inicioSecoes !== 'undefined') inicioSecoes.forEach(function (inicio, id) {
            var segundos = Math.round((Date.now() - inicio) / 1000);
            if (segundos > 0) enviar('secao_tempo', { secao: id, tempo_ativo_segundos: segundos }, true);
        });
    });
})();
