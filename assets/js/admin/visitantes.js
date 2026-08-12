/* Visitantes e conversões — telemetria anônima agregada.

   A primeira versão listava tudo como pílula + número, inclusive o funil e os
   rankings. Só que número solto não responde a pergunta que essa aba existe
   para responder: onde as pessoas param. Aqui cada bloco tem a forma do que
   ele mede — cards de ícone no topo (os mesmos dos cadastros, para o painel
   ter uma linguagem só), barras decrescentes no funil e barras proporcionais
   nos rankings, que é o que deixa a diferença entre o 1º e o 5º visível sem
   ter de comparar dígitos. */
(function (global) {
    'use strict';
    var D = global.AdminDom, el = D.el;
    var alvo, dias = 30, dados;

    var PERIODOS = [7, 30, 90];

    /* Rótulos do funil na ordem em que o servidor manda — do primeiro toque
       ao pagamento. Nome de evento não se mostra para gente. */
    var NOMES_FUNIL = {
        pagina_visualizada:  'Visitaram o site',
        secao_visualizada:   'Viram uma seção',
        plano_clicado:       'Clicaram em plano',
        formulario_iniciado: 'Iniciaram cadastro',
        formulario_enviado:  'Enviaram cadastro',
        checkout_iniciado:   'Abriram pagamento',
        pagamento_confirmado: 'Pagamentos confirmados'
    };

    function fmtNum(n) {
        return n == null ? '—' : Number(n).toLocaleString('pt-BR');
    }
    /* Segundos crus ("187s") não se leem como duração. Acima de um minuto vira
       "3m 07s", que é como a pessoa pensa em tempo de visita. */
    function fmtTempo(s) {
        if (s == null) return '—';
        s = Number(s);
        if (s < 60) return s + 's';
        var m = Math.floor(s / 60), r = s % 60;
        return m + 'm ' + (r < 10 ? '0' : '') + r + 's';
    }
    function pct(parte, total) {
        if (!total) return 0;
        return Math.round((parte / total) * 100);
    }

    // ---------------- topo: os mesmos cards dos cadastros ----------------
    function cards() {
        var itens = [
            [fmtNum(dados.visitantes),        'Visitantes',         'fas fa-users'],
            [fmtNum(dados.visualizacoes),     'Páginas vistas',     'fas fa-eye'],
            [fmtTempo(dados.tempo_medio_segundos), 'Tempo ativo médio', 'fas fa-clock'],
            [dados.rolagem_media == null ? '—' : dados.rolagem_media + '%', 'Rolagem média', 'fas fa-arrow-down-wide-short'],
            [fmtNum(dados.downloads),         'Downloads',          'fas fa-download'],
            [fmtNum(dados.whatsapp),          'Cliques no WhatsApp', 'fab fa-whatsapp']
        ];
        return el('div.stats', {}, itens.map(function (i, idx) {
            return el('div.stat.' + (idx % 2 === 0 ? 'mac' : 'win'), {}, [
                el('div.stat-icon', {}, el('i.' + i[2].split(' ').join('.'), { 'aria-hidden': 'true' })),
                el('div.stat-texto', {}, [
                    el('div.stat-num', { texto: i[0] }),
                    el('div.stat-lbl', { texto: i[1] })
                ])
            ]);
        }));
    }

    // ---------------- funil ----------------
    /* A barra é proporcional ao topo do funil, não ao passo anterior: assim a
       queda entre etapas aparece como estreitamento contínuo, do jeito que um
       funil de verdade se lê. */
    function funil() {
        var passos = dados.funil || [];
        var base = passos.length ? Number(passos[0].total) || 0 : 0;

        return bloco('Funil', 'fa-filter', el('div.tel-funil', {}, passos.map(function (p, i) {
            var total = Number(p.total) || 0;
            var largura = base ? Math.max(pct(total, base), total > 0 ? 4 : 0) : 0;
            var anterior = i > 0 ? Number(passos[i - 1].total) || 0 : null;
            /* Só marca a perda quando ela é real: sem gente na etapa anterior
               não existe queda, existe ausência de dado. */
            var queda = (anterior && total < anterior) ? '−' + (100 - pct(total, anterior)) + '%' : null;

            return el('div.tel-passo', {}, [
                el('div.tel-passo-barra', { estilo: { width: largura + '%' } }),
                el('div.tel-passo-nome', { texto: NOMES_FUNIL[p.evento] || p.evento }),
                queda ? el('div.tel-passo-queda', { texto: queda, title: 'Perda em relação à etapa anterior' }) : null,
                el('div.tel-passo-num', { texto: fmtNum(total) }),
                el('div.tel-passo-pct', { texto: base ? pct(total, base) + '%' : '—' })
            ]);
        })));
    }

    // ---------------- rankings com barra ----------------
    function ranking(itens, sufixo) {
        itens = itens || [];
        if (!itens.length) return el('p.tel-vazio', { texto: 'Sem registros neste período.' });

        var maior = itens.reduce(function (m, i) { return Math.max(m, Number(i.total) || 0); }, 0);
        return el('div.tel-rank', {}, itens.map(function (i) {
            var total = Number(i.total) || 0;
            var extra = sufixo ? sufixo(i) : null;
            return el('div.tel-linha', {}, [
                el('div.tel-linha-topo', {}, [
                    el('span.tel-linha-nome', { texto: i.nome, title: i.nome }),
                    extra ? el('span.tel-linha-extra', { texto: extra }) : null,
                    el('span.tel-linha-num', { texto: fmtNum(total) })
                ]),
                el('div.tel-barra', {}, el('span', {
                    estilo: { width: (maior ? Math.max(pct(total, maior), 3) : 0) + '%' }
                }))
            ]);
        }));
    }

    function bloco(titulo, icone, conteudo) {
        return el('section.tel-bloco', {}, [
            el('h3.tel-titulo', {}, [
                el('i.fas.' + icone, { 'aria-hidden': 'true' }),
                document.createTextNode(titulo)
            ]),
            conteudo
        ]);
    }

    // ---------------- relatório impresso ----------------
    /* Mesma folha timbrada do relatório de cadastros e do de servidor — o
       módulo dela vive em cadastros.js e é exposto como AdminRelatorio. */
    function imprimir() {
        var R = global.AdminRelatorio;
        if (!R || !dados || !dados.success) return;
        var esc = R.esc, c = R.carimbos('VT');

        var passos = dados.funil || [];
        var base = passos.length ? Number(passos[0].total) || 0 : 0;
        var fim = passos.length ? Number(passos[passos.length - 1].total) || 0 : 0;

        var linhasFunil = passos.map(function (p, i) {
            var total = Number(p.total) || 0;
            var anterior = i > 0 ? Number(passos[i - 1].total) || 0 : null;
            var queda = (anterior && total < anterior) ? '−' + (100 - pct(total, anterior)) + '%' : '—';
            return '<tr>' +
                '<td>' + String(i + 1).padStart(2, '0') + '</td>' +
                '<td>' + esc(NOMES_FUNIL[p.evento] || p.evento) + '</td>' +
                '<td>' + (base ? pct(total, base) + '%' : '—') + '</td>' +
                '<td>' + queda + '</td>' +
                '<td class="num">' + total + '</td>' +
                '</tr>';
        }).join('');

        /* Uma tabela por ranking, cada uma com a sua própria seção: no papel
           não há coluna lateral, então empilhar é o único arranjo que cabe. */
        function tabela(titulo, legenda, itens, colunaExtra) {
            itens = itens || [];
            if (!itens.length) {
                return '<p style="margin:0;color:#787878;font-style:italic;">Sem registros no período.</p>';
            }
            var linhas = itens.map(function (i, n) {
                return '<tr>' +
                    '<td>' + String(n + 1).padStart(2, '0') + '</td>' +
                    '<td>' + esc(i.nome) + '</td>' +
                    (colunaExtra ? '<td>' + esc(colunaExtra(i)) + '</td>' : '') +
                    '<td class="num">' + (Number(i.total) || 0) + '</td>' +
                    '</tr>';
            }).join('');
            return '<table class="ledger"><caption>' + legenda + '</caption><thead><tr>' +
                '<th style="width:40px;">#</th><th>' + titulo + '</th>' +
                (colunaExtra ? '<th style="width:150px;">Tempo médio</th>' : '') +
                '<th style="width:110px;" class="num">Eventos</th>' +
                '</tr></thead><tbody>' + linhas + '</tbody></table>';
        }

        var corpo =
            '<section><div class="section-head"><h3>I. Panorama do período</h3><span class="roman">&sect; 1</span></div><dl class="specs">' +
            '<div class="item"><dt>Visitantes</dt><dd class="answer"><span class="mono">' + fmtNum(dados.visitantes) + '</span></dd><dd><span class="pill neutral">sessões</span></dd></div>' +
            '<div class="item"><dt>Páginas vistas</dt><dd class="answer"><span class="mono">' + fmtNum(dados.visualizacoes) + '</span></dd><dd><span class="pill neutral">aberturas</span></dd></div>' +
            '<div class="item"><dt>Tempo ativo</dt><dd class="answer"><span class="mono">' + fmtTempo(dados.tempo_medio_segundos) + '</span></dd><dd><span class="pill neutral">média</span></dd></div>' +
            '<div class="item"><dt>Rolagem</dt><dd class="answer"><span class="mono">' + (dados.rolagem_media == null ? '—' : dados.rolagem_media + '%') + '</span></dd><dd><span class="pill neutral">média</span></dd></div>' +
            '<div class="item"><dt>Downloads</dt><dd class="answer"><span class="mono">' + fmtNum(dados.downloads) + '</span></dd><dd><span class="pill neutral">AnyDesk e drivers</span></dd></div>' +
            '<div class="item"><dt>WhatsApp</dt><dd class="answer"><span class="mono">' + fmtNum(dados.whatsapp) + '</span></dd><dd><span class="pill neutral">cliques</span></dd></div>' +
            '</dl></section>\n' +
            '<section><div class="section-head"><h3>II. Funil comercial</h3><span class="roman">&sect; 2</span></div>' +
            '<table class="ledger"><caption>Do primeiro acesso ao pagamento &middot; percentual sobre o topo do funil</caption>' +
            '<thead><tr><th style="width:40px;">#</th><th>Etapa</th><th style="width:90px;">% do topo</th><th style="width:110px;">Queda</th><th style="width:100px;" class="num">Pessoas</th></tr></thead>' +
            '<tbody>' + linhasFunil + '</tbody>' +
            '<tfoot><tr><td colspan="4">Conversão do topo ao pagamento</td><td class="num">' + (base ? pct(fim, base) + '%' : '—') + '</td></tr></tfoot>' +
            '</table></section>\n' +
            '<section><div class="section-head"><h3>III. Seções mais vistas</h3><span class="roman">&sect; 3</span></div>' +
            tabela('Seção', 'Trechos da página abertos pelos visitantes', dados.secoes, function (i) {
                return i.tempo_medio_segundos == null ? '—' : fmtTempo(i.tempo_medio_segundos);
            }) + '</section>\n' +
            '<section><div class="section-head"><h3>IV. Origem do tráfego</h3><span class="roman">&sect; 4</span></div>' +
            tabela('Origem', 'De onde vieram os acessos', dados.origens) + '</section>\n' +
            '<section><div class="section-head"><h3>V. Dispositivos</h3><span class="roman">&sect; 5</span></div>' +
            tabela('Dispositivo', 'Aparelho usado no acesso', dados.dispositivos) + '</section>\n';

        R.abrirImpressao(R.montarFolha({
            c: c,
            titulo: 'Relatório de Visitantes · Comportamento e Conversão',
            cabecalho: 'Visitantes e Conversões',
            ref: dias + ' dias',
            subhead: 'Relatório de audiência &middot; emitido automaticamente',
            nota: 'dados anônimos &middot; uso interno',
            tag: 'Audiência e funil &middot; v1.0',
            manchete: 'Comportamento dos visitantes e funil comercial',
            lede: 'Documento consolida a audiência do site no período, o caminho percorrido até o pagamento e a origem dos acessos. Nenhum dado pessoal é coletado: as sessões são anônimas e dependem do aceite do banner de métricas.',
            pin: 'Período de ' + dias + ' dias',
            corpo: corpo,
            assinaturas: [
                ['Marketing', 'leitura de audiência'],
                ['Produto', 'revisão do funil'],
                ['Direção', 'acompanhamento comercial']
            ]
        }));
    }

    function seletorPeriodo() {
        return el('div.tel-periodo', { role: 'group', 'aria-label': 'Período' },
            PERIODOS.map(function (n) {
                return el('button' + (n === dias ? '.ativo' : ''), {
                    type: 'button',
                    'aria-pressed': n === dias ? 'true' : 'false',
                    texto: n + ' dias',
                    aoClicar: function () { if (n !== dias) { dias = n; carregar(); } }
                });
            }));
    }

    function cabecalho() {
        return el('div.bloco-topo', {}, [
            el('div', {}, [
                el('h2', { texto: 'Visitantes e conversões' }),
                el('p.bloco-nota', { texto: 'Dados anônimos; nenhum conteúdo digitado é coletado.' })
            ]),
            seletorPeriodo()
        ]);
    }

    function desenhar() {
        if (!dados) {
            D.trocar(alvo, el('div.vazio', { texto: 'Carregando comportamento dos visitantes…' }));
            return;
        }
        if (!dados.success) {
            D.trocar(alvo, [cabecalho(), el('div.vazio', { texto: dados.error || 'Telemetria indisponível.' })]);
            return;
        }

        /* Zero visitante não é erro: é o estado normal enquanto ninguém navegou
           no período ou ninguém aceitou o banner. Dizer isso evita a leitura de
           que o painel quebrou. */
        var semDados = !dados.visitantes;

        D.trocar(alvo, [
            cabecalho(),
            semDados ? el('p.tel-aviso', {}, [
                el('i.fas.fa-circle-info', { 'aria-hidden': 'true' }),
                document.createTextNode('Nenhum evento nos últimos ' + dias + ' dias. Os números aparecem quando alguém navega no site e aceita o banner de métricas.')
            ]) : null,
            cards(),
            funil(),
            el('div.tel-colunas', {}, [
                bloco('Seções mais vistas', 'fa-list-ul', ranking(dados.secoes, function (i) {
                    return i.tempo_medio_segundos == null ? null : fmtTempo(i.tempo_medio_segundos) + ' em média';
                })),
                bloco('Origens', 'fa-signs-post', ranking(dados.origens)),
                bloco('Dispositivos', 'fa-mobile-screen', ranking(dados.dispositivos))
            ]),
            dados.limitado ? el('p.bloco-nota', { texto: 'Período limitado aos 10.000 eventos mais recentes.' }) : null,
            // Mesmo botão, mesmo canto das outras abas: imprime o período que
            // está à vista, não um recorte diferente do que se está olhando.
            semDados ? null : el('div.diag-tabela-acoes', {},
                el('button.acao.diag-btn-imprimir', {
                    type: 'button',
                    texto: 'Imprimir relatório',
                    aoClicar: imprimir
                })
            )
        ]);
    }

    function carregar() {
        return global.AdminApi.telemetria(dias).then(function (d) { dados = d; desenhar(); }).catch(function () {});
    }

    global.AdminVisitantes = {
        montar: function (no) { alvo = no; desenhar(); return carregar(); },
        recarregar: carregar
    };
})(window);
