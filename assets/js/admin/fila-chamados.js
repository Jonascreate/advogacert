/* ==========================================================
   admin/fila-chamados.js — fila de trabalho, não relatório
   ==========================================================
   O status muda aqui mesmo, na linha, sem abrir outra tela. Filtro, busca,
   ordenação e paginação são resolvidos pelo servidor: com a fila crescendo,
   mandar a base inteira para o navegador filtrar seria trafegar tudo a cada
   30 segundos do polling.

   Premium fica sempre acima do grátis. Dentro de cada grupo, o mais velho
   primeiro — quem espera há mais tempo aparece antes.
   ========================================================== */
(function (global) {
    'use strict';

    var D = global.AdminDom;
    var el = D.el;

    var estado = {
        status: 'abertos', tipo: 'todos', dias: 0, q: '',
        pagina: 1, total: 0, itens: [], semDonoHoras: 8
    };
    var alvo, buscaTempo;

    function filtros() {
        var busca = el('input.busca-chamados', {
            type: 'search',
            placeholder: 'Por OAB, por nome e por WhatsApp',
            valor: estado.q
        });
        // espera a digitação parar: sem isso cada tecla vira uma consulta
        busca.addEventListener('input', function (e) {
            clearTimeout(buscaTempo);
            var v = e.target.value;
            buscaTempo = setTimeout(function () {
                estado.q = v; estado.pagina = 1; carregar();
            }, 350);
        });

        return el('div.filtros', {}, busca);
    }

    function fechar(item) {
        if (!confirm('Fechar o chamado #' + item.id + '?')) return;
        global.AdminApi.mudarStatusChamado(item.id, 'fechado')
            .then(function (d) {
                if (d && d.success) { item.status = 'fechado'; carregar(); }
            })
            .catch(function () {});
    }

    function linha(item) {
        var abandonado = item.status === 'aberto' && item.idade_horas >= estado.semDonoHoras;

        // Em telas estreitas o CSS transforma isto em cartão; os rótulos
        // ficam no data-rotulo de cada célula, para a informação não virar
        // uma coluna de números sem cabeçalho.
        function td(rotulo, conteudo, classe) {
            return el('td' + (classe ? '.' + classe : ''),
                { 'data-rotulo': rotulo },
                typeof conteudo === 'string' ? [document.createTextNode(conteudo)] : [conteudo]);
        }

        // Fechado só pode apagar; em aberto (qualquer estado intermediário)
        // só pode fechar — um clique errado em "apagar" custaria o
        // atendimento de alguém, então essa ação some assim que fecha.
        var acoes = item.status === 'fechado'
            ? el('button.acao.acao-nao', {
                type: 'button',
                texto: 'Apagar',
                aoClicar: function () { apagar([item]); }
              })
            : el('button.acao', {
                type: 'button',
                texto: 'Fechar',
                aoClicar: function () { fechar(item); }
              });

        // Só existe quando o pedido veio da agenda do site (grátis, ou
        // premium que também marcou hora). Aberto direto pelo painel ou pela
        // rota /chamado/premium fica sem horário — e isso fica visível em
        // vez de deixar a célula em branco, pra não parecer esquecimento.
        var horario = item.horario_marcado
            ? el('span.mono', { texto: D.fmtData(item.horario_marcado) })
            : el('span.fraco', { texto: 'Sem horário (aberto direto)' });

        var tagTipo = el('span.tag-tipo.' + (item.tipo === 'premium' ? 'premium' : 'gratis'), {}, [
            el('i.fas.' + (item.tipo === 'premium' ? 'fa-crown' : 'fa-gift'), { 'aria-hidden': 'true' }),
            document.createTextNode(item.tipo === 'premium' ? 'Premium' : 'Grátis')
        ]);

        return el('tr' + (abandonado ? '.abandonado' : ''), {}, [
            td('Quem', el('div', {}, [
                el('div.forte', { texto: item.nome || '—' }),
                el('div.fraco', { texto: item.contato || '' })
            ])),
            td('OAB', el('span.mono', { texto: item.oab || '—' })),
            td('Tipo', tagTipo),
            td('Horário marcado', horario),
            td('Pedido', el('span.pedido', { texto: item.descricao || '—' })),
            td('', acoes)
        ]);
    }

    /**
     * Apagar é irreversível e leva junto o que alimenta os indicadores —
     * MTTR, "fechados no período" e taxa de reabertura saem dos fechados.
     * Por isso: aviso explícito, confirmação, e 10 segundos para desfazer
     * antes de qualquer coisa sair do banco.
     */
    function apagar(itens) {
        var quantos = itens.length;
        var texto = quantos === 1
            ? 'Apagar o chamado #' + itens[0].id + '?'
            : 'Apagar ' + quantos + ' chamados fechados?';

        if (!confirm(texto + '\n\nIsso é definitivo. Os indicadores de tempo de ' +
                     'resolução e de reabertura perdem esses registros.')) return;

        return global.AdminApi.apagarChamados({ ids: itens.map(function (c) { return c.id; }) })
            .then(carregar);
    }

    function paginacao() {
        var porPagina = 25;
        var paginas = Math.max(1, Math.ceil(estado.total / porPagina));
        if (paginas <= 1) return null;

        return el('div.paginacao', {}, [
            el('button.acao', {
                type: 'button', texto: 'Anterior',
                disabled: estado.pagina <= 1 || undefined,
                aoClicar: function () { estado.pagina--; carregar(); }
            }),
            el('span.pag-info', { texto: 'Página ' + estado.pagina + ' de ' + paginas + ' · ' + estado.total + ' chamados' }),
            el('button.acao', {
                type: 'button', texto: 'Próxima',
                disabled: estado.pagina >= paginas || undefined,
                aoClicar: function () { estado.pagina++; carregar(); }
            })
        ]);
    }

    function desenhar() {
        var cabecalhos = ['Quem', 'OAB', 'Tipo', 'Horário marcado', 'Pedido', ''];
        var tabela = el('table', {}, [
            el('thead', {}, el('tr', {}, cabecalhos.map(function (t) {
                return el('th', { texto: t });
            }))),
            el('tbody', {}, estado.itens.map(linha))
        ]);

        var fechados = estado.itens.filter(function (c) { return c.status === 'fechado'; });

        D.trocar(alvo, [
            el('div.bloco-topo', {}, [
                el('div', {}, [
                    el('h2', { texto: 'Chamados' }),
                    el('p.bloco-nota', { texto: 'Tempo real. Premium sempre acima do grátis.' })
                ]),
                // só aparece quando há fechados à vista: botão de limpeza em
                // tela sem nada para limpar é convite a clique errado
                fechados.length > 1
                    ? el('button.acao.acao-nao', {
                        type: 'button',
                        texto: 'Apagar os ' + fechados.length + ' fechados',
                        aoClicar: function () { apagar(fechados); }
                      })
                    : null
            ]),
            filtros(),
            el('div.tabela-wrap.responsiva', {}, [
                tabela,
                estado.itens.length ? null : el('div.vazio', { texto: 'Nenhum chamado com esses filtros.' })
            ]),
            paginacao()
        ]);
    }

    function carregar() {
        return global.AdminApi.chamados({
            status: estado.status, tipo: estado.tipo, dias: estado.dias,
            q: estado.q, pagina: estado.pagina
        })
        .then(function (d) {
            if (!d || !d.success) return;
            estado.itens = d.itens || [];
            estado.total = d.total || 0;
            estado.semDonoHoras = d.sem_dono_horas || 8;

            // só conta quando a lista é a dos abertos: com filtro de fechados
            // o número deixaria de significar "o que falta fazer"
            // Âmbar sempre que houver chamado aberto: a esteira inteira —
            // verificação, triagem e chamados — fica acesa até o trabalho
            // acabar. Só apaga quando não sobra nada para fazer.
            if (global.AdminBadge && estado.status === 'abertos' && !estado.q) {
                global.AdminBadge('chamados', 'Chamados', estado.total, estado.total > 0);
            }
            desenhar();
        })
        .catch(function () {});
    }

    global.AdminFilaChamados = {
        montar: function (no) { alvo = no; desenhar(); return carregar(); },
        recarregar: carregar
    };
})(window);
