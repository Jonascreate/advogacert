/* Visitantes e conversões — telemetria anônima agregada. */
(function (global) {
    'use strict';
    var D = global.AdminDom, el = D.el;
    var alvo, dias = 30, dados;

    function card(rotulo, valor) {
        return el('div.ind-item', {}, [
            el('div.ind-rot', { texto: rotulo }),
            el('div.ind-val', { texto: valor == null ? '—' : String(valor) })
        ]);
    }
    function lista(titulo, itens) {
        return el('div', { estilo: { marginTop: '1.5rem' } }, [
            el('h3', { texto: titulo }),
            el('div.ind-grid', {}, (itens || []).map(function (i) { return card(i.nome, i.total); }))
        ]);
    }
    function desenhar() {
        if (!dados) { D.trocar(alvo, el('div.vazio', { texto: 'Carregando comportamento dos visitantes…' })); return; }
        if (!dados.success) { D.trocar(alvo, el('div.vazio', { texto: dados.error || 'Telemetria indisponível.' })); return; }
        var nomes = {
            pagina_visualizada: 'Visitaram o site', secao_visualizada: 'Viram uma seção',
            plano_clicado: 'Clicaram em plano', formulario_iniciado: 'Iniciaram cadastro',
            formulario_enviado: 'Enviaram cadastro', checkout_iniciado: 'Abriram pagamento',
            pagamento_confirmado: 'Pagamentos confirmados'
        };
        D.trocar(alvo, [
            el('div.bloco-topo', {}, [
                el('div', {}, [el('h2', { texto: 'Visitantes e conversões' }), el('p.bloco-nota', { texto: 'Dados anônimos; nenhum conteúdo digitado é coletado.' })]),
                el('select.acao', {
                    'aria-label': 'Período', valor: String(dias),
                    aoMudar: function (e) { dias = Number(e.target.value); carregar(); }
                }, [7, 30, 90].map(function (n) { return el('option', { value: n, selected: n === dias, texto: n + ' dias' }); }))
            ]),
            el('div.ind-grid', {}, [
                card('Visitantes', dados.visitantes), card('Páginas vistas', dados.visualizacoes),
                card('Tempo ativo médio', dados.tempo_medio_segundos == null ? '—' : dados.tempo_medio_segundos + 's'),
                card('Rolagem média', dados.rolagem_media == null ? '—' : dados.rolagem_media + '%'),
                card('Downloads', dados.downloads), card('Cliques no WhatsApp', dados.whatsapp)
            ]),
            lista('Funil', (dados.funil || []).map(function (i) { return { nome: nomes[i.evento] || i.evento, total: i.total }; })),
            lista('Seções mais vistas', (dados.secoes || []).map(function (i) {
                return { nome: i.nome, total: i.total + (i.tempo_medio_segundos == null ? '' : ' · ' + i.tempo_medio_segundos + 's em média') };
            })),
            lista('Origens', dados.origens),
            lista('Dispositivos', dados.dispositivos),
            dados.limitado ? el('p.bloco-nota', { texto: 'Período limitado aos 10.000 eventos mais recentes.' }) : null
        ]);
    }
    function carregar() {
        return global.AdminApi.telemetria(dias).then(function (d) { dados = d; desenhar(); }).catch(function () {});
    }
    global.AdminVisitantes = { montar: function (no) { alvo = no; desenhar(); return carregar(); }, recarregar: carregar };
})(window);
