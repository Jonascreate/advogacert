/* ==========================================================
   admin/cadastros.js — lista de assinantes e estado do sistema
   ==========================================================
   A aba é de CONSULTA, e só de assinantes: quem tem plano valendo e quem
   está inadimplente. É onde se confere pendência antes de confirmar um
   atendimento na triagem.

   Cadastro sem assinatura não aparece — a conta de teste, o curioso que só
   fez login, o cliente do grátis. Eles continuam no banco e nos números do
   topo, mas listá-los aqui misturava três públicos numa tabela cuja única
   pergunta é "esse aqui está em dia?".

   Nome, e-mail, OAB e telefone vêm do cadastro do próprio usuário — por
   isso tudo entra por textContent, nunca por innerHTML.
   ========================================================== */
(function (global) {
    'use strict';

    var D = global.AdminDom;
    var el = D.el;

    var estado = { dados: null, busca: '' };
    var alvoPessoas, alvoDiag, alvoResumo;

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

        // Só assinantes: plano valendo ou vencido sem cancelar. "Cancelada"
        // e "sem plano" ficam de fora — não há pendência a conferir em quem
        // não deve nada.
        var assinantes = (estado.dados.pessoas || []).filter(function (p) {
            return p.status === 'ativa' || p.status === 'inadimplente';
        });

        var termo = estado.busca.trim().toLowerCase();
        var digitos = termo.replace(/\D/g, '');
        var lista = assinantes.filter(function (p) {
            if (!termo) return true;
            if (digitos.length >= 4 && String(p.telefone || '').replace(/\D/g, '').indexOf(digitos) >= 0) return true;
            if (digitos.length >= 3 && String(p.oab || '').replace(/\D/g, '').indexOf(digitos) >= 0) return true;
            return String(p.email || '').toLowerCase().indexOf(termo) >= 0 ||
                   String(p.oab || '').toLowerCase().indexOf(termo) >= 0 ||
                   String(p.nome || '').toLowerCase().indexOf(termo) >= 0;
        });

        var busca = el('input', {
            type: 'search',
            placeholder: 'Buscar assinante por OAB, WhatsApp, e-mail ou nome',
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
                el('h2', { texto: 'Lista de assinantes' }),
                el('p.bloco-nota', {
                    texto: 'Quem paga, e se está em dia. Confira aqui antes de confirmar um atendimento na triagem.'
                })
            ])),
            // vazia de verdade quando não há assinante: caixa de busca sobre
            // uma lista vazia é pergunta sem resposta possível
            assinantes.length ? el('div.busca', {}, busca) : null,
            el('div.tabela-wrap.responsiva', {}, [
                el('table', {}, [
                    el('thead', {}, el('tr', {}, titulos.map(function (t) {
                        return el('th', { texto: t });
                    }))),
                    el('tbody', {}, lista.map(linhaPessoa))
                ]),
                lista.length ? null : el('div.vazio', {
                    texto: assinantes.length
                        ? 'Nenhum assinante bate com a busca.'
                        : 'Nenhum assinante ainda. Quando uma assinatura Premium entrar, ela aparece aqui.'
                })
            ])
        ]);
    }

    // A tabela "Agenda do suporte grátis" que vivia nesta aba foi embora
    // junto com a etapa que a alimentava: confirmar na triagem agora abre o
    // chamado direto, e a ocupação dos horários se vê na grade da Triagem.

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

    function carregar() {
        return global.AdminApi.dados().then(function (d) {
            if (!d) return;
            estado.dados = d;
            desenharResumo();
            desenharPessoas();
            desenharDiag();
        }).catch(function () {});
    }

    global.AdminCadastros = {
        montar: function (nos) {
            alvoResumo = nos.resumo;
            alvoPessoas = nos.pessoas;
            alvoDiag = nos.diagnostico;
            return carregar();
        },
        recarregar: carregar
    };
})(window);
