/* ==========================================================
   admin/dom.js — construção de tela sem innerHTML
   ==========================================================
   O painel antigo montava as linhas com template string e innerHTML,
   interpolando nome, e-mail, OAB e a descrição do chamado — todos digitados
   por quem está do outro lado. Um nome cadastrado como

       <img src=x onerror="fetch('/admin/dados').then(...)">

   viraria código rodando dentro do painel logado, com a sessão do dono.

   Aqui nada disso é possível: texto entra sempre por textContent, que o
   navegador trata como texto e nunca como marcação. Não há caminho para
   HTML vindo de dado.
   ========================================================== */
(function (global) {
    'use strict';

    /**
     * el('div.classe', { attrs }, [filhos | texto])
     * O primeiro argumento aceita "tag.classe1.classe2" para encurtar.
     */
    function el(seletor, attrs, filhos) {
        var partes = String(seletor).split('.');
        var no = document.createElement(partes[0] || 'div');
        for (var i = 1; i < partes.length; i++) no.classList.add(partes[i]);

        if (attrs) {
            Object.keys(attrs).forEach(function (k) {
                var v = attrs[k];
                if (v == null || v === false) return;
                if (k === 'texto') {
                    no.textContent = v;                 // nunca innerHTML
                } else if (k === 'aoClicar') {
                    no.addEventListener('click', v);
                } else if (k === 'aoMudar') {
                    no.addEventListener('change', v);
                } else if (k === 'estilo') {
                    Object.assign(no.style, v);
                } else if (k === 'valor') {
                    no.value = v;
                } else {
                    no.setAttribute(k, v === true ? '' : v);
                }
            });
        }

        if (filhos != null) {
            (Array.isArray(filhos) ? filhos : [filhos]).forEach(function (f) {
                if (f == null || f === false) return;
                no.appendChild(typeof f === 'string' ? document.createTextNode(f) : f);
            });
        }
        return no;
    }

    /** Troca todo o conteúdo de um nó pelos filhos dados. */
    function trocar(alvo, filhos) {
        alvo.textContent = '';
        (Array.isArray(filhos) ? filhos : [filhos]).forEach(function (f) {
            if (f) alvo.appendChild(f);
        });
    }

    /** Etiqueta arredondada, no padrão do painel. */
    function tag(texto, classe) {
        return el('span.tag' + (classe ? '.' + classe : ''), { texto: texto });
    }

    /** Pílula de status, para os cards de diagnóstico. */
    function badge(texto, classe) {
        return el('span.badge.' + classe, {}, [
            document.createTextNode(texto)
        ]);
    }

    var SVG_NS = 'http://www.w3.org/2000/svg';

    /**
     * Ícone de contorno (24x24, mesmo estilo em toda parte). `formas` é uma
     * lista de [tagSvg, { atributos }] — nunca vem de dado, só de listas
     * fixas escritas aqui, então não passa por textContent/innerHTML.
     */
    function svg(formas) {
        var s = document.createElementNS(SVG_NS, 'svg');
        s.setAttribute('viewBox', '0 0 24 24');
        s.setAttribute('fill', 'none');
        s.setAttribute('stroke', 'currentColor');
        s.setAttribute('stroke-width', '2');
        s.setAttribute('stroke-linecap', 'round');
        s.setAttribute('stroke-linejoin', 'round');
        formas.forEach(function (f) {
            var no = document.createElementNS(SVG_NS, f[0]);
            Object.keys(f[1]).forEach(function (k) { no.setAttribute(k, f[1][k]); });
            s.appendChild(no);
        });
        return s;
    }

    // ---- formatação ----
    function fmtData(iso) {
        if (!iso) return '—';
        var d = new Date(iso);
        return d.toLocaleDateString('pt-BR') + ' ' +
               d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    function fmtDia(iso) {
        return iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';
    }

    /** "3 h", "2 d 4 h" — idade legível a partir de horas. */
    function fmtEspera(horas) {
        if (horas == null) return '—';
        if (horas < 1) return 'menos de 1 h';
        if (horas < 24) return horas + ' h';
        var d = Math.floor(horas / 24);
        var h = horas % 24;
        return d + ' d' + (h ? ' ' + h + ' h' : '');
    }

    function fmtHoras(v) {
        return v == null ? '—' : (v < 1 ? Math.round(v * 60) + ' min' : v + ' h');
    }

    /** Copia para a área de transferência e dá o retorno visual no botão. */
    function copiar(texto, botao) {
        var antes = botao.textContent;
        var fim = function () {
            botao.textContent = 'copiado';
            setTimeout(function () { botao.textContent = antes; }, 1400);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(texto).then(fim, function () {});
            return;
        }
        // navegador sem clipboard API (ou página sem https)
        var campo = document.createElement('textarea');
        campo.value = texto;
        document.body.appendChild(campo);
        campo.select();
        try { document.execCommand('copy'); fim(); } catch (e) {}
        document.body.removeChild(campo);
    }

    global.AdminDom = {
        el: el, trocar: trocar, tag: tag, badge: badge, svg: svg,
        fmtData: fmtData, fmtDia: fmtDia, fmtEspera: fmtEspera, fmtHoras: fmtHoras,
        copiar: copiar
    };
})(window);
