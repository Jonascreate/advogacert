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

    var STATUS = [
        ['aberto', 'Aberto'],
        ['em_atendimento', 'Em atendimento'],
        ['aguardando_cliente', 'Aguardando cliente'],
        ['fechado', 'Fechado']
    ];

    var estado = {
        status: 'abertos', tipo: 'todos', dias: 0, q: '',
        pagina: 1, total: 0, itens: [], semDonoHoras: 8
    };
    var alvo, buscaTempo;

    function filtros() {
        var selStatus = el('select', {
            aoMudar: function (e) { estado.status = e.target.value; estado.pagina = 1; carregar(); }
        }, [el('option', { value: 'abertos', texto: 'Todos os abertos' })]
            .concat(STATUS.map(function (s) {
                return el('option', { value: s[0], texto: s[1] });
            }))
            .concat([el('option', { value: 'todos', texto: 'Tudo, inclusive fechados' })]));
        selStatus.value = estado.status;

        var selTipo = el('select', {
            aoMudar: function (e) { estado.tipo = e.target.value; estado.pagina = 1; carregar(); }
        }, [
            el('option', { value: 'todos', texto: 'Grátis e Premium' }),
            el('option', { value: 'premium', texto: 'Só Premium' }),
            el('option', { value: 'free', texto: 'Só grátis' })
        ]);
        selTipo.value = estado.tipo;

        var selPeriodo = el('select', {
            aoMudar: function (e) { estado.dias = Number(e.target.value); estado.pagina = 1; carregar(); }
        }, [
            el('option', { value: '0', texto: 'Qualquer data' }),
            el('option', { value: '1', texto: 'Hoje' }),
            el('option', { value: '7', texto: 'Últimos 7 dias' }),
            el('option', { value: '30', texto: 'Últimos 30 dias' })
        ]);
        selPeriodo.value = String(estado.dias);

        var busca = el('input.busca-chamados', {
            type: 'search',
            placeholder: 'Buscar por OAB, nome, WhatsApp ou e-mail',
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

        return el('div.filtros', {}, [busca, selStatus, selTipo, selPeriodo]);
    }

    function seletorStatus(item) {
        var sel = el('select.status-sel', {
            aoMudar: function (e) { mudarStatus(item, e.target.value, sel); }
        }, STATUS.map(function (s) {
            return el('option', { value: s[0], texto: s[1] });
        }));
        sel.value = item.status;
        return sel;
    }

    function mudarStatus(item, novo, sel) {
        if (novo === 'fechado' && !confirm('Fechar o chamado #' + item.id + '?')) {
            sel.value = item.status;
            return;
        }
        global.AdminApi.mudarStatusChamado(item.id, novo)
            .then(function (d) {
                if (d && d.success) { item.status = novo; carregar(); }
            })
            .catch(function () { sel.value = item.status; });
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

        return el('tr' + (abandonado ? '.abandonado' : ''), {}, [
            td('Idade', el('span' + (abandonado ? '.critico' : ''), {
                texto: D.fmtEspera(item.idade_horas)
            })),
            td('Quem', el('div', {}, [
                el('div.forte', { texto: item.nome || '—' }),
                el('div.fraco', { texto: item.contato || '' })
            ])),
            td('OAB', el('span.mono', { texto: item.oab || '—' })),
            td('Tipo', D.tag(item.tipo === 'premium' ? 'Premium' : 'Grátis',
                item.tipo === 'premium' ? 'ativa' : 'livre')),
            td('Pedido', el('span.pedido', { texto: item.descricao || '—' })),
            td('Status', seletorStatus(item))
        ]);
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
        var cabecalhos = ['Idade', 'Quem', 'OAB', 'Tipo', 'Pedido', 'Status'];
        var tabela = el('table', {}, [
            el('thead', {}, el('tr', {}, cabecalhos.map(function (t) {
                return el('th', { texto: t });
            }))),
            el('tbody', {}, estado.itens.map(linha))
        ]);

        D.trocar(alvo, [
            el('div.bloco-topo', {}, [
                el('div', {}, [
                    el('h2', { texto: 'Chamados' }),
                    el('p.bloco-nota', { texto: 'Tempo real. Premium sempre acima do grátis.' })
                ])
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
