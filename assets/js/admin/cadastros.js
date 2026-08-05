/* ==========================================================
   admin/cadastros.js — pessoas, agenda e estado do sistema
   ==========================================================
   O que já existia no painel antigo, reconstruído sem innerHTML: nome,
   e-mail, OAB e telefone vêm do cadastro do próprio usuário e, montados por
   template string, permitiam injetar HTML dentro do painel logado.
   ========================================================== */
(function (global) {
    'use strict';

    var D = global.AdminDom;
    var el = D.el;

    var estado = { dados: null, busca: '' };
    var alvoPessoas, alvoAgenda, alvoDiag, alvoResumo;

    // ---------------- resumo ----------------
    function desenharResumo() {
        var r = estado.dados && estado.dados.resumo;
        if (!r || !alvoResumo) return;

        var itens = [
            [r.usuarios, 'Cadastros'],
            [r.ativos, 'Planos ativos'],
            [r.inadimplentes, 'Inadimplentes'],
            [r.sem_renovacao, 'Sem renovação'],
            ['R$ ' + Number(r.receita_mes || 0).toLocaleString('pt-BR'), 'Receita/mês'],
            [r.free_usados, 'Grátis usados'],
            [r.chamados, 'Chamados'],
            [r.logins_30d, 'Logins (30d)']
        ];

        D.trocar(alvoResumo, itens.map(function (i) {
            return el('div.stat', {}, [
                el('div.stat-num', { texto: String(i[0] == null ? '—' : i[0]) }),
                el('div.stat-lbl', { texto: i[1] })
            ]);
        }));
    }

    // ---------------- pessoas ----------------
    function celulaPlano(p) {
        if (p.status === 'ativa') {
            return el('div', {}, [
                D.tag('Premium', 'ativa'),
                el('div.fraco', { texto: 'até ' + D.fmtDia(p.valida_ate) })
            ]);
        }
        if (p.status === 'inadimplente') {
            return el('div', {}, [
                D.tag('Inadimplente', 'atrasada'),
                el('div.fraco', { texto: 'venceu há ' + p.dias_atraso + ' dia(s)' })
            ]);
        }
        return D.tag(p.status === 'cancelada' ? 'Cancelada' : 'Sem plano', 'sem');
    }

    function linhaPessoa(p) {
        function td(rotulo, conteudo) {
            return el('td', { 'data-rotulo': rotulo },
                typeof conteudo === 'string' ? [document.createTextNode(conteudo)] : [conteudo]);
        }

        var botaoRenov = p.renovacao_automatica === null
            ? el('span.fraco', { texto: '—' })
            : el('button.acao', {
                type: 'button',
                texto: p.renovacao_automatica ? 'Automática' : 'Manual',
                title: 'Clique para inverter',
                aoClicar: function () { mudarPlano(p.id, 'renovacao'); }
            });

        var botaoPlano = el('button.acao', {
            type: 'button',
            texto: p.status === 'ativa' ? 'Cancelar' : 'Liberar 1 mês',
            aoClicar: function () { mudarPlano(p.id, p.status === 'ativa' ? 'cancelar' : 'liberar'); }
        });

        return el('tr', {}, [
            td('Pessoa', el('div', {}, [
                el('div.forte', { texto: p.nome || p.email || '—' }),
                el('div.fraco', { texto: p.email || '' })
            ])),
            td('OAB', el('span.mono', { texto: p.oab || '—' })),
            td('WhatsApp', el('span.mono', { texto: p.telefone || '—' })),
            td('Plano', celulaPlano(p)),
            td('Renovação', botaoRenov),
            td('Chamado grátis', D.tag(p.free_usado ? 'Usado' : 'Disponível', p.free_usado ? 'usado' : 'livre')),
            td('Chamados', String(p.chamados_total)),
            td('Último login', el('span.mono.fraco', { texto: D.fmtData(p.ultimo_login) })),
            td('', botaoPlano)
        ]);
    }

    function mudarPlano(id, acao) {
        var perguntas = {
            cancelar: 'Cancelar o plano desta pessoa?',
            renovacao: 'Inverter a renovação automática desta assinatura?',
            liberar: 'Liberar 1 mês de Premium para esta pessoa?'
        };
        if (!confirm(perguntas[acao])) return;
        global.AdminApi.assinatura(id, acao).then(carregar).catch(function () {});
    }

    function desenharPessoas() {
        if (!alvoPessoas || !estado.dados) return;

        var termo = estado.busca.trim().toLowerCase();
        var digitos = termo.replace(/\D/g, '');
        var lista = (estado.dados.pessoas || []).filter(function (p) {
            if (!termo) return true;
            if (digitos.length >= 4 && String(p.telefone || '').replace(/\D/g, '').indexOf(digitos) >= 0) return true;
            if (digitos.length >= 3 && String(p.oab || '').replace(/\D/g, '').indexOf(digitos) >= 0) return true;
            return String(p.email || '').toLowerCase().indexOf(termo) >= 0 ||
                   String(p.oab || '').toLowerCase().indexOf(termo) >= 0 ||
                   String(p.nome || '').toLowerCase().indexOf(termo) >= 0;
        });

        var busca = el('input', {
            type: 'search',
            placeholder: 'Buscar por OAB, WhatsApp, e-mail ou nome',
            valor: estado.busca
        });
        busca.addEventListener('input', function (e) {
            estado.busca = e.target.value;
            desenharPessoas();
            // devolve o cursor: redesenhar troca o campo por um novo
            var novo = alvoPessoas.querySelector('input[type=search]');
            if (novo) { novo.focus(); novo.setSelectionRange(novo.value.length, novo.value.length); }
        });

        var titulos = ['Pessoa', 'OAB', 'WhatsApp', 'Plano', 'Renovação', 'Chamado grátis', 'Chamados', 'Último login', ''];

        D.trocar(alvoPessoas, [
            el('div.bloco-topo', {}, el('div', {}, [
                el('h2', { texto: 'Cadastros' }),
                el('p.bloco-nota', { texto: 'Tempo real.' })
            ])),
            el('div.busca', {}, busca),
            el('div.tabela-wrap.responsiva', {}, [
                el('table', {}, [
                    el('thead', {}, el('tr', {}, titulos.map(function (t) {
                        return el('th', { texto: t });
                    }))),
                    el('tbody', {}, lista.map(linhaPessoa))
                ]),
                lista.length ? null : el('div.vazio', { texto: 'Nenhum cadastro encontrado.' })
            ])
        ]);
    }

    // ---------------- agenda ----------------
    function desenharAgenda() {
        if (!alvoAgenda || !estado.dados) return;
        var lista = estado.dados.agendamentos || [];

        var linhas = lista.map(function (a) {
            var passou = new Date(a.inicio) < new Date() && !a.virou_chamado;
            var mapa = a.virou_chamado ? ['Virou chamado', 'ativa']
                     : a.confirmado    ? ['Confirmado', 'livre']
                     : a.status === 'cancelado' ? ['Cancelado', 'sem']
                     : ['Na triagem', 'sem'];

            // O último passo da esteira: confirmado na agenda, vira trabalho.
            // Só aparece no que foi confirmado e ainda não virou chamado.
            var acao = (a.confirmado && !a.virou_chamado)
                ? el('button.acao.acao-promover', {
                    type: 'button', texto: 'Abrir chamado',
                    aoClicar: function () { abrirChamado(a); }
                  })
                : (a.confirmado || a.virou_chamado ? null : el('span.fraco', { texto: 'aguarda triagem' }));

            return el('tr', {}, [
                el('td', { 'data-rotulo': 'Quando' },
                    el('span.mono' + (passou ? '.critico' : ''), { texto: D.fmtData(a.inicio) })),
                el('td', { 'data-rotulo': 'Quem', texto: a.nome || '—' }),
                el('td', { 'data-rotulo': 'OAB' }, el('span.mono', { texto: a.oab || '—' })),
                el('td', { 'data-rotulo': 'Status' }, D.tag(mapa[0], mapa[1])),
                el('td', { 'data-rotulo': '' }, acao || document.createTextNode(''))
            ]);
        });

        D.trocar(alvoAgenda, [
            el('div.bloco-topo', {}, el('div', {}, [
                el('h2', { texto: 'Agenda do suporte grátis' }),
                el('p.bloco-nota', { texto: 'Tempo real. Em ordem de quem vem primeiro.' })
            ])),
            el('div.tabela-wrap.responsiva', {}, [
                el('table', {}, [
                    el('thead', {}, el('tr', {}, ['Quando', 'Quem', 'OAB', 'Status', ''].map(function (t) {
                        return el('th', { texto: t });
                    }))),
                    el('tbody', {}, linhas)
                ]),
                lista.length ? null : el('div.vazio', { texto: 'Nenhum atendimento marcado.' })
            ])
        ]);
    }

    // ---------------- servidor e banco ----------------
    function desenharDiag() {
        if (!alvoDiag || !estado.dados) return;
        var s = estado.dados.saude;
        if (!s) return;

        // "alerta" não é erro: é coisa que ainda não foi ligada e você
        // precisa saber que está assim.
        var itens = [
            ['Banco', s.banco, s.banco_ok ? 'bom' : 'alerta'],
            ['Servidor no ar desde', D.fmtData(s.servidor_desde), ''],
            ['Node', s.node, ''],
            ['E-mail', s.email, s.email === 'configurado' ? 'bom' : 'alerta'],
            ['SMS', s.sms, s.sms === 'desligado' ? 'alerta' : 'bom'],
            ['Login Google', s.google, s.google === 'configurado' ? 'bom' : 'alerta'],
            ['Pagamento', s.pagamento, /^link/.test(s.pagamento) ? 'bom' : 'alerta'],
            ['Agenda do grátis', s.agenda, ''],
            ['Tabelas', (s.tabelas || []).map(function (t) { return t.nome + ': ' + t.linhas; }).join(' · '), '']
        ];

        D.trocar(alvoDiag, [
            el('div.bloco-topo', {}, el('div', {}, [
                el('h2', { texto: 'Servidor e banco' }),
                el('p.bloco-nota', { texto: 'Tempo real.' })
            ])),
            el('div.ind-grid', {}, itens.map(function (i) {
                return el('div.ind-item', {}, [
                    el('div.ind-rot', { texto: i[0] }),
                    el('div.ind-val' + (i[2] ? '.' + i[2] : ''), { texto: String(i[1]) })
                ]);
            }))
        ]);
    }

    /** Último passo: o atendimento confirmado vira trabalho na fila. */
    function abrirChamado(a) {
        if (!confirm('Abrir chamado para ' + (a.oab || a.nome) + '?\n\n' +
                     'A partir daqui o prazo de atendimento começa a correr.')) return;

        global.AdminDesfazer.agendar({
            texto: (a.oab || a.nome) + ' → chamado',
            aoConfirmar: function () {
                return global.AdminApi.promover(a.id).then(function () {
                    carregar();
                    if (global.AdminFilaChamados) global.AdminFilaChamados.recarregar();
                });
            }
        });
    }

    function carregar() {
        return global.AdminApi.dados().then(function (d) {
            if (!d) return;
            estado.dados = d;
            desenharResumo();
            desenharPessoas();
            desenharAgenda();
            desenharDiag();
        }).catch(function () {});
    }

    global.AdminCadastros = {
        montar: function (nos) {
            alvoResumo = nos.resumo;
            alvoPessoas = nos.pessoas;
            alvoAgenda = nos.agenda;
            alvoDiag = nos.diagnostico;
            return carregar();
        },
        recarregar: carregar
    };
})(window);
