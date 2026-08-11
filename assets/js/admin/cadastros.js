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
    // Mesmo cartão dos cards de Mac/Windows do index (.platform-card): ícone
    // flutuante à esquerda, texto à direita, borda em degradê animada. Cada
    // item alterna entre o verde (--accent-mac) e o azul (--accent-win) da
    // marca — só variação visual, o valor de cada número continua vindo
    // direto de resumo, sem cálculo nenhum feito aqui.
    function desenharResumo() {
        var r = estado.dados && estado.dados.resumo;
        if (!r || !alvoResumo) return;

        var itens = [
            [r.usuarios, 'Cadastros', 'fa-users'],
            [r.ativos, 'Planos ativos', 'fa-star'],
            [r.inadimplentes, 'Inadimplentes', 'fa-triangle-exclamation'],
            [r.sem_renovacao, 'Sem renovação', 'fa-rotate'],
            ['R$ ' + Number(r.receita_mes || 0).toLocaleString('pt-BR'), 'Receita/mês', 'fa-sack-dollar'],
            [r.free_usados, 'Grátis usados', 'fa-gift'],
            [r.chamados, 'Chamados', 'fa-headset'],
            [r.logins_30d, 'Logins (30d)', 'fa-right-to-bracket']
        ];

        D.trocar(alvoResumo, itens.map(function (i, idx) {
            var variante = idx % 2 === 0 ? 'mac' : 'win';
            return el('div.stat.' + variante, {}, [
                el('div.stat-icon', {}, el('i.fas.' + i[2], { 'aria-hidden': 'true' })),
                el('div.stat-texto', {}, [
                    el('div.stat-num', { texto: String(i[0] == null ? '—' : i[0]) }),
                    el('div.stat-lbl', { texto: i[1] })
                ])
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

        // O botão "Pedir atendimento" do Premium foi retirado da tela a
        // pedido. A rota POST /admin/premium/solicitar e a função
        // pedirAtendimento() continuam de pé: devolver o botão é descomentar
        // as linhas abaixo, sem mexer no servidor.
        //
        // var botaoChamado = p.status === 'ativa'
        //     ? el('button.acao.acao-promover', {
        //         type: 'button',
        //         texto: 'Pedir atendimento',
        //         aoClicar: function () { pedirAtendimento(p); }
        //       })
        //     : null;
        var botaoChamado = null;

        var campoObs = el('input.obs-input', {
            type: 'text',
            placeholder: 'Nota…',
            valor: p.observacao || ''
        });
        campoObs.addEventListener('blur', function () {
            var novo = campoObs.value.trim();
            if (novo === (p.observacao || '')) return;
            global.AdminApi.observacao(p.id, novo).then(function (r) {
                if (r && r.success) p.observacao = novo;
            });
        });

        return el('tr', {}, [
            td('Pessoa', el('div', {}, [
                el('div.forte', { texto: p.nome || p.email || '—' }),
                el('div.fraco', { texto: p.email || '' })
            ])),
            td('WhatsApp', el('span.mono', { texto: p.telefone || '—' })),
            td('Plano', celulaPlano(p)),
            td('Renovação', botaoRenov),
            td('Chamados', String(p.chamados_total)),
            td('Último login', el('span.mono.fraco', { texto: D.fmtData(p.ultimo_login) })),
            td('Observação', campoObs),
            td('', botaoChamado || document.createTextNode('')),
            td('', botaoPlano)
        ]);
    }

    /** Premium: sem OAB e sem marcar horário, mas passa pela Triagem como o grátis. */
    function pedirAtendimento(p) {
        var descricao = prompt('Descreva rapidamente o pedido dessa pessoa:', '');
        if (descricao === null) return;
        if (!confirm('Registrar pedido de atendimento Premium para ' + (p.nome || p.email) + '?\n\n' +
                     'Vai para a aba Triagem, pronto para você abrir o chamado.')) return;

        global.AdminApi.solicitarPremium(p.id, descricao).then(function (r) {
            if (!r || !r.success) {
                alert((r && r.error) || 'Não foi possível registrar o pedido.');
                return;
            }
            alert('Pedido registrado. Veja a aba Triagem para abrir o chamado.');
            if (global.AdminTriagem) global.AdminTriagem.recarregar();
        }).catch(function () {
            alert('Erro de conexão.');
        });
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

        var titulos = ['Pessoa', 'WhatsApp', 'Plano', 'Renovação', 'Chamados', 'Último login', 'Observação', '', ''];

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
            ]),
            // Mesma ação da tabela do servidor, no mesmo canto: imprime o que
            // está à vista — com a busca aplicada, se houver.
            lista.length ? el('div.diag-tabela-acoes', {},
                el('button.acao.diag-btn-imprimir', {
                    type: 'button',
                    texto: 'Imprimir relatório',
                    aoClicar: function () { imprimirCadastros(lista, estado.busca.trim()); }
                })
            ) : null
        ]);
    }

    // ---------------- agenda ----------------
    function desenharAgenda() {
        if (!alvoAgenda || !estado.dados) return;
        var lista = estado.dados.agendamentos || [];

        var linhas = lista.map(function (a) {
            // "passou da hora" perde o sentido depois da baixa: atendido no
            // horário certo continuaria vermelho para sempre.
            var passou = new Date(a.inicio) < new Date() && !a.virou_chamado && !a.atendido;

            // A baixa vem primeiro na escada: uma vez atendido, é isso que
            // interessa saber, não em que ponto da papelada ele parou.
            var mapa = a.atendido        ? ['Atendido', 'feito']
                     : a.virou_chamado   ? ['Virou chamado', 'ativa']
                     : a.confirmado      ? ['Confirmado', 'livre']
                     : a.status === 'cancelado' ? ['Cancelado', 'sem']
                     : ['Na triagem', 'sem'];

            var acoes = [];

            if (a.atendido) {
                // Baixa errada acontece: o caminho de volta fica à mão, mas
                // discreto, para não competir com os botões de trabalho.
                acoes.push(el('button.acao.acao-desfazer-baixa', {
                    type: 'button', texto: 'Desfazer baixa',
                    title: a.atendido_em ? 'Baixa em ' + D.fmtData(a.atendido_em) : '',
                    aoClicar: function () { desfazerBaixa(a); }
                }));
            } else if (a.status !== 'cancelado') {
                // O botão que faltava. Vale em qualquer ponto da esteira: a
                // baixa é sobre o encontro ter acontecido, não sobre o
                // agendamento ter sido confirmado ou virado chamado.
                acoes.push(el('button.acao.acao-atendido', {
                    type: 'button', texto: 'Atendido',
                    aoClicar: function () { darBaixa(a); }
                }));
            }

            // O último passo da esteira: confirmado na agenda, vira trabalho.
            // Só aparece no que foi confirmado e ainda não virou chamado.
            if (a.confirmado && !a.virou_chamado && !a.atendido) {
                acoes.push(el('button.acao.acao-promover', {
                    type: 'button', texto: 'Abrir chamado',
                    aoClicar: function () { abrirChamado(a); }
                }));
            } else if (!a.confirmado && !a.virou_chamado && !a.atendido && a.status !== 'cancelado') {
                acoes.push(el('span.fraco', { texto: 'aguarda triagem' }));
            }

            return el('tr' + (a.atendido ? '.linha-atendida' : ''), {}, [
                el('td', { 'data-rotulo': 'Quando' },
                    el('span.mono' + (passou ? '.critico' : ''), { texto: D.fmtData(a.inicio) })),
                el('td', { 'data-rotulo': 'Quem', texto: a.nome || '—' }),
                el('td', { 'data-rotulo': 'Status' }, D.tag(mapa[0], mapa[1])),
                el('td.celula-acoes', { 'data-rotulo': '' }, acoes)
            ]);
        });

        D.trocar(alvoAgenda, [
            el('div.bloco-topo', {}, el('div', {}, [
                el('h2', { texto: 'Agenda do suporte grátis' }),
                el('p.bloco-nota', { texto: 'Tempo real. Em ordem de quem vem primeiro.' })
            ])),
            el('div.tabela-wrap.responsiva', {}, [
                el('table', {}, [
                    el('thead', {}, el('tr', {}, ['Quando', 'Quem', 'Status', ''].map(function (t) {
                        return el('th', { texto: t });
                    }))),
                    el('tbody', {}, linhas)
                ]),
                lista.length ? null : el('div.vazio', { texto: 'Nenhum atendimento marcado.' })
            ])
        ]);
    }

    // ---------------- servidor e banco ----------------
    // Um ícone de contorno fixo por item — nunca vem de dado, só listas
    // escritas aqui (ver AdminDom.svg).
    var DIAG_ICONES = {
        banco: [['ellipse', { cx: 12, cy: 5, rx: 9, ry: 3 }],
                ['path', { d: 'M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5' }],
                ['path', { d: 'M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6' }]],
        servidor: [['circle', { cx: 12, cy: 12, r: 9 }],
                   ['path', { d: 'M12 7v5l3 2' }]],
        node: [['path', { d: 'M12 2 3 7l9 5 9-5-9-5z' }],
               ['path', { d: 'M3 12l9 5 9-5' }],
               ['path', { d: 'M3 17l9 5 9-5' }]],
        email: [['rect', { x: 3, y: 5, width: 18, height: 14, rx: 2 }],
                ['path', { d: 'm3 7 9 6 9-6' }]],
        sms: [['path', { d: 'M22 16.92V21a1 1 0 0 1-1.11 1 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 3.18 4.11 1 1 0 0 1 4.18 3h4.09a1 1 0 0 1 1 .75l1 4a1 1 0 0 1-.29 1L8.21 10.21a16 16 0 0 0 6 6l1.46-1.77a1 1 0 0 1 1-.29l4 1a1 1 0 0 1 .75 1z' }]],
        google: [['path', { d: 'M21 12a9 9 0 1 1-3.5-7.1' }],
                 ['path', { d: 'M21 12h-9' }]],
        pagamento: [['rect', { x: 2, y: 5, width: 20, height: 14, rx: 2 }],
                    ['line', { x1: 2, y1: 10, x2: 22, y2: 10 }]],
        tabelas: [['path', { d: 'M3 6h18M3 12h18M3 18h18' }]]
    };

    function diagCard(opts) {
        // opts: { icone, rotulo, badgeTexto, badgeClasse, valor, mono, largo, cheia, extra }
        var classe = 'div.diag-item' + (opts.largo ? '.largo' : '') + (opts.cheia ? '.cheia' : '');
        var itensTitulo = [
            el('div.diag-icone', {}, D.svg(DIAG_ICONES[opts.icone])),
            el('div.diag-rot', { texto: opts.rotulo })
        ];
        var filhos = [
            el('div.diag-cabeca', {}, [
                el('div.diag-titulo', {}, itensTitulo)
            ])
        ];
        if (opts.valor != null) {
            filhos.push(el('div.diag-val' + (opts.mono ? '.mono' : ''), { texto: opts.valor }));
        }
        if (opts.badgeTexto) {
            filhos.push(el('div.diag-val.fraco', { texto: opts.badgeTexto }));
        }
        if (opts.extra) filhos.push(opts.extra);
        return el(classe, {}, filhos);
    }

    /** Mapeia nome interno da tabela para descrição legível. */
    function descricaoTabela(nome) {
        var mapa = {
            usuarios: 'Cadastros e credenciais',
            assinaturas: 'Planos contratados e ciclo',
            chamados: 'Tickets abertos e encerrados',
            logins: 'Histórico de autenticação',
            agendamentos: 'Consultas marcadas',
            verificacoes_oab: 'Validação de inscrição',
            auditoria: 'Trilha de eventos do sistema'
        };
        return mapa[nome] || nome;
    }

    // ---------------- folha de impressão ----------------
    // Papel timbrado comum aos relatórios impressos do painel. Fica aqui, num
    // lugar só, porque "igual ao do servidor" precisa continuar igual: mexer
    // no papel muda os dois documentos de uma vez, sem um sair andando sozinho.
    // Só o miolo (corpo) muda de um relatório para o outro.

    /** Escapa texto vindo do cadastro: aqui a saída é string de HTML. */
    function esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    var ESTILO_FOLHA =
        ':root { --paper: #fbf9f4; --paper-2: #f4f1e8; --ink: #1a1a1a; --ink-2: #4a4a4a; --ink-3: #787878; --rule: #1a1a1a; --rule-soft: #d8d3c2; --good: #1f6b3a; --good-bg: #e8f2ec; --bad: #8b1e2f; --bad-bg: #f5e6e8; --warn: #8a5a14; --warn-bg: #f5ecdd; --neutral: #4a4a4a; --neutral-bg: #ece8d8; }\n' +
        '@page { size: A4; margin: 18mm 16mm; }\n' +
        '* { box-sizing: border-box; }\n' +
        'html, body { margin:0; padding:0; background:#e9e4d3; color:var(--ink); font-family:"Georgia","Times New Roman","Times",serif; -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility; }\n' +
        '.sheet { background:var(--paper); background-image:repeating-linear-gradient(0deg,rgba(0,0,0,0.012) 0 1px,transparent 1px 38px),repeating-linear-gradient(90deg,rgba(0,0,0,0.012) 0 1px,transparent 1px 38px); max-width:880px; margin:24px auto; padding:56px 64px 64px; box-shadow:0 1px 0 rgba(255,255,255,0.6) inset,0 2px 6px rgba(0,0,0,0.05),0 24px 60px -20px rgba(0,0,0,0.35); border:1px solid var(--rule-soft); position:relative; }\n' +
        '.sheet::before { content:""; position:absolute; inset:24px; border:1px solid var(--rule-soft); pointer-events:none; }\n' +
        // Timbre clássico: marca centralizada no alto, título embaixo dela e a
        // numeração do documento numa faixa por último. Antes era marca à
        // esquerda e numeração à direita, na mesma linha — arranjo de
        // relatório de sistema, não de papel timbrado.
        '.letterhead { text-align:center; padding-bottom:16px; border-bottom:3px double var(--rule); margin-bottom:6px; }\n' +
        '.lh-left { display:block; }\n' +
        // O PNG da marca tem o "ADV" branco (feito para fundo escuro) e sumiria
        // no papel creme. Mesma solução do site (ver .logo-mask em contato.html):
        // o arquivo vira máscara e a cor vem do fundo — aqui, azul chapado da
        // marca. print-color-adjust obriga a impressora a manter esse azul.
        '.brand { height:70px; aspect-ratio:768/332; margin:0 auto 14px; background:var(--marca); -webkit-mask-image:var(--logo); mask-image:var(--logo); -webkit-mask-repeat:no-repeat; mask-repeat:no-repeat; -webkit-mask-position:center; mask-position:center; -webkit-mask-size:contain; mask-size:contain; -webkit-print-color-adjust:exact; print-color-adjust:exact; }\n' +
        // A régua vertical separava marca e título quando estavam lado a lado.
        // Empilhados, ela não tem o que separar.
        '.lh-sep { display:none; }\n' +
        '.lh-title h1 { margin:0; font-size:26px; letter-spacing:0.02em; font-weight:700; text-transform:uppercase; }\n' +
        '.lh-title p { margin:4px 0 0; font-size:12px; color:var(--ink-2); letter-spacing:0.08em; text-transform:uppercase; }\n' +
        // Numeração vira faixa horizontal centralizada, abaixo do título.
        '.lh-meta { display:flex; justify-content:center; flex-wrap:wrap; gap:22px; margin-top:12px; padding-top:10px; border-top:1px solid var(--rule-soft); font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace; font-size:11px; line-height:1.7; color:var(--ink-2); }\n' +
        '.lh-meta .k { color:var(--ink-3); text-transform:uppercase; letter-spacing:0.1em; }\n' +
        '.lh-meta .v { color:var(--ink); font-weight:700; }\n' +
        '.subhead { display:flex; justify-content:space-between; align-items:baseline; padding:10px 0 18px; border-bottom:1px solid var(--rule); font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:var(--ink-2); }\n' +
        '.subhead em { font-style:italic; text-transform:none; letter-spacing:0; color:var(--ink-3); font-size:12px; }\n' +
        '.doctype { margin:20px 0 16px; text-align:center; }\n' +
        '.doctype .tag { display:inline-block; padding:5px 18px; background:var(--ink); color:var(--paper); font-family:ui-monospace,Menlo,monospace; font-size:11px; letter-spacing:0.2em; text-transform:uppercase; }\n' +
        '.headline { text-align:center; margin:8px 0 26px; }\n' +
        '.headline h2 { margin:0; font-size:30px; font-weight:700; line-height:1.2; letter-spacing:-0.005em; }\n' +
        '.headline .lede { margin:8px auto 0; max-width:580px; font-size:14px; line-height:1.65; color:var(--ink-2); font-style:italic; }\n' +
        '.banner { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:10px 16px; border:1px solid var(--rule); background:var(--good-bg); margin-bottom:28px; font-size:13px; }\n' +
        '.banner .pin { display:inline-flex; align-items:center; gap:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; font-size:12px; color:var(--good); }\n' +
        '.banner .pin::before { content:""; width:10px; height:10px; border-radius:50%; background:var(--good); box-shadow:0 0 0 3px rgba(31,107,58,0.18); }\n' +
        '.banner .stamp { font-family:ui-monospace,Menlo,monospace; font-size:12px; color:var(--ink-2); }\n' +
        '.banner .label { color:var(--ink-3); text-transform:uppercase; letter-spacing:0.1em; font-size:11px; }\n' +
        'section { margin-bottom:28px; page-break-inside:avoid; }\n' +
        '.section-head { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:12px; border-bottom:1px solid var(--rule); padding-bottom:4px; }\n' +
        '.section-head h3 { margin:0; font-size:16px; font-weight:700; letter-spacing:0.02em; text-transform:uppercase; }\n' +
        '.section-head .roman { font-style:italic; color:var(--ink-3); font-size:12px; font-family:ui-monospace,Menlo,monospace; letter-spacing:0.1em; }\n' +
        'dl.specs { margin:0; display:grid; grid-template-columns:1fr 1fr; column-gap:32px; row-gap:0; border-top:1px solid var(--rule-soft); }\n' +
        'dl.specs .item { display:grid; grid-template-columns:110px 1fr auto; gap:14px; padding:11px 0; border-bottom:1px dotted var(--rule-soft); align-items:center; }\n' +
        'dl.specs .item:nth-last-child(-n+2) { border-bottom:none; }\n' +
        '.specs dt { font-size:11px; text-transform:uppercase; letter-spacing:0.1em; color:var(--ink-3); font-weight:700; }\n' +
        '.specs dd.answer { margin:0; font-size:14px; color:var(--ink); line-height:1.5; }\n' +
        '.specs dd.answer .mono { font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace; background:var(--paper-2); border:1px solid var(--rule-soft); padding:2px 8px; font-size:13px; color:var(--ink); }\n' +
        '.pill { display:inline-flex; align-items:center; gap:7px; padding:3px 10px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; border:1px solid currentColor; border-radius:2px; background:transparent; }\n' +
        '.pill::before { content:""; width:8px; height:8px; background:currentColor; border-radius:50%; }\n' +
        '.pill.good { color:var(--good); background:var(--good-bg); }\n' +
        '.pill.bad { color:var(--bad); background:var(--bad-bg); }\n' +
        '.pill.warn { color:var(--warn); background:var(--warn-bg); }\n' +
        '.pill.neutral { color:var(--neutral); background:var(--neutral-bg); }\n' +
        'table.ledger { width:100%; border-collapse:collapse; font-size:13px; margin-top:4px; }\n' +
        'table.ledger caption { caption-side:top; text-align:left; font-size:11px; letter-spacing:0.14em; text-transform:uppercase; color:var(--ink-3); padding-bottom:6px; font-style:italic; }\n' +
        'table.ledger th, table.ledger td { padding:9px 12px; border-bottom:1px solid var(--rule-soft); text-align:left; }\n' +
        'table.ledger thead th { background:var(--paper-2); border-bottom:2px solid var(--rule); font-size:11px; text-transform:uppercase; letter-spacing:0.1em; color:var(--ink); }\n' +
        'table.ledger tbody tr:nth-child(even) td { background:rgba(0,0,0,0.018); }\n' +
        'table.ledger td.num { text-align:right; font-family:ui-monospace,Menlo,monospace; font-weight:700; font-variant-numeric:tabular-nums; }\n' +
        'table.ledger td.num::before { content:"№ "; color:var(--ink-3); font-weight:400; font-size:11px; margin-right:4px; }\n' +
        'table.ledger tfoot td { font-weight:700; border-top:2px solid var(--rule); border-bottom:none; background:var(--paper-2); }\n' +
        '.signoff { margin-top:32px; padding-top:18px; border-top:1px solid var(--rule); display:grid; grid-template-columns:1fr 1fr 1fr; gap:28px; font-size:11px; color:var(--ink-2); text-align:center; }\n' +
        '.signoff .sig { border-top:1px solid var(--rule); padding-top:6px; font-family:ui-monospace,Menlo,monospace; text-transform:uppercase; letter-spacing:0.08em; color:var(--ink); font-weight:700; }\n' +
        'footer { margin-top:18px; padding-top:8px; border-top:1px dashed var(--rule-soft); display:flex; justify-content:space-between; font-size:10px; color:var(--ink-3); font-family:ui-monospace,Menlo,monospace; letter-spacing:0.1em; text-transform:uppercase; }\n' +
        '@media (max-width:760px) { .sheet { margin:0; padding:32px 22px; box-shadow:none; border:none; } .sheet::before { inset:8px; } .brand { height:54px; } .lh-title h1 { font-size:21px; } .lh-meta { gap:14px; } dl.specs { grid-template-columns:1fr; column-gap:0; } .signoff { grid-template-columns:1fr; gap:14px; } .headline h2 { font-size:22px; } }\n' +
        '@media print { html, body { background:#fff; } .sheet { margin:0; padding:0; border:none; box-shadow:none; background-image:none; } .sheet::before { display:none; } section { page-break-inside:avoid; } footer { color:#555; } }\n';

    /** Carimbos de data do documento: emissão legível, UTC e número. */
    function carimbos(prefixo) {
        var agora = new Date();
        var dataBR = agora.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        var horaBR = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        return {
            emissao: dataBR + ' ' + horaBR,
            emissaoUTC: agora.toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
            ano: agora.getFullYear(),
            docNum: prefixo + '-' + String(agora.getFullYear()).slice(2) +
                    String(agora.getMonth() + 1).padStart(2, '0') +
                    String(agora.getDate()).padStart(2, '0')
        };
    }

    /**
     * Monta a folha inteira em volta do miolo.
     * o: { titulo, subtitulo, ref, subhead, nota, tag, manchete, lede,
     *      pin, corpo, assinaturas, c (carimbos) }
     */
    function montarFolha(o) {
        var c = o.c;
        // A janela nasce em about:blank, sem endereço próprio: caminho relativo
        // não teria contra o que resolver. Absolutiza contra a página do painel.
        var logo = new URL('assets/img/logo.png', location.href).href;
        var assinaturas = (o.assinaturas || []).map(function (a) {
            return '<div><div class="sig">' + esc(a[0]) + '</div><div style="margin-top:4px;">' + esc(a[1]) + '</div></div>';
        }).join('');

        return '<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n<title>' + esc(o.titulo) + '</title>\n<style>\n' +
            ESTILO_FOLHA +
            ':root { --logo: url("' + logo.replace(/"/g, '%22') + '"); --marca: #1f6fd1; }\n' +
            '</style>\n</head>\n<body>\n<article class="sheet">\n' +
            '<header class="letterhead"><div class="lh-left"><div class="brand" role="img" aria-label="AdvCert"></div><div class="lh-sep" aria-hidden="true"></div><div class="lh-title"><h1>' + esc(o.cabecalho) + '</h1><p>Plataforma Jurídica &middot; Painel Operacional</p></div></div><div class="lh-meta"><div><span class="k">Doc.</span> <span class="v">' + c.docNum + '/' + c.ano + '</span></div><div><span class="k">Ref.</span> <span class="v">' + esc(o.ref) + '</span></div><div><span class="k">Pg.</span> <span class="v">1 / 1</span></div></div></header>\n' +
            '<div class="subhead"><span>' + o.subhead + '</span><em>' + o.nota + '</em></div>\n' +
            '<div class="doctype"><span class="tag">' + o.tag + '</span></div>\n' +
            '<div class="headline"><h2>' + esc(o.manchete) + '</h2><p class="lede">' + o.lede + '</p></div>\n' +
            '<div class="banner" role="status"><span class="pin">' + esc(o.pin) + '</span><div><span class="label">Emissão</span> <span class="stamp">' + c.emissaoUTC + '</span></div></div>\n' +
            o.corpo +
            '<div class="signoff">' + assinaturas + '</div>\n' +
            '<footer><span>Impresso em ' + c.emissao + ' &middot; fonte institucional</span><span>Fim do documento &middot; ' + c.docNum + '</span></footer>\n' +
            '</article>\n<script>window.onload=function(){window.print();}<' + '/script>\n</body>\n</html>';
    }

    /** Abre a folha em janela própria; ela se imprime sozinha ao carregar. */
    function abrirImpressao(html) {
        var w = window.open('', '_blank', 'width=960,height=700');
        if (!w) { alert('Permita popups para abrir o relatório de impressão.'); return; }
        w.document.write(html);
        w.document.close();
    }

    /** Abre uma janela com o relatório formal pronto para imprimir. */
    function imprimirRelatorio(dados) {
        var s = dados && dados.saude;
        if (!s) return;
        var tabelas = s.tabelas || [];
        var c = carimbos('SR');
        var total = tabelas.reduce(function (acc, t) { return acc + t.linhas; }, 0);

        var pagamentoOk = /^link/.test(s.pagamento);
        var emailOk = s.email && !/desligado/i.test(s.email);
        var smsOk = s.sms && !/desligado/i.test(s.sms);
        var googleOk = s.google && !/desligado/i.test(s.google);

        function pill(ok) { return ok ? 'good' : 'bad'; }
        function status(ok) { return ok ? 'ativo' : 'off'; }
        function desc(ok) { return ok ? 'Configurado.' : 'Desligado.'; }
        function pagDesc(ok) { return ok ? 'Checkout ativo.' : 'Checkout <em>não</em> cobra.'; }

        var linhasTabela = tabelas.map(function (t, i) {
            var desc = descricaoTabela(t.nome);
            return '<tr><td>' + String(i + 1).padStart(2, '0') + '</td><td>' + t.nome + '</td><td>' + desc + '</td><td class="num">' + t.linhas + '</td></tr>';
        }).join('');

        var corpo =
            '<section><div class="section-head"><h3>I. Especificações do ambiente</h3><span class="roman">&sect; 1</span></div><dl class="specs"><div class="item"><dt>Servidor</dt><dd class="answer">Tempo real.</dd><dd><span class="pill good">online</span></dd></div><div class="item"><dt>Banco</dt><dd class="answer"><span class="mono">' + esc(s.banco || '—') + '</span></dd><dd><span class="pill neutral">arquivo local</span></dd></div><div class="item"><dt>Em operação</dt><dd class="answer"><span class="mono">' + esc(D.fmtData(s.servidor_desde)) + '</span></dd><dd><span class="pill good">uptime</span></dd></div><div class="item"><dt>Runtime</dt><dd class="answer"><span class="mono">' + esc(s.node || '—') + '</span></dd><dd><span class="pill neutral">node.js</span></dd></div></dl></section>\n' +
            '<section><div class="section-head"><h3>II. Integrações e canais</h3><span class="roman">&sect; 2</span></div><dl class="specs"><div class="item"><dt>E-mail</dt><dd class="answer">' + desc(emailOk) + '</dd><dd><span class="pill ' + pill(emailOk) + '">' + status(emailOk) + '</span></dd></div><div class="item"><dt>SMS</dt><dd class="answer">' + desc(smsOk) + '</dd><dd><span class="pill ' + pill(smsOk) + '">' + status(smsOk) + '</span></dd></div><div class="item"><dt>Login Google</dt><dd class="answer">' + desc(googleOk) + '</dd><dd><span class="pill ' + pill(googleOk) + '">' + status(googleOk) + '</span></dd></div><div class="item"><dt>Pagamento</dt><dd class="answer">' + pagDesc(pagamentoOk) + '</dd><dd><span class="pill ' + pill(pagamentoOk) + '">' + (pagamentoOk ? 'ligado' : 'não ligado') + '</span></dd></div></dl></section>\n' +
            '<section><div class="section-head"><h3>III. Tabelas e contagens</h3><span class="roman">&sect; 3</span></div><table class="ledger"><caption>Estado das coleções do arquivo de dados &middot; índice base de relatório</caption><thead><tr><th style="width:40px;">#</th><th>Tabela</th><th>Descrição funcional</th><th style="width:90px;" class="num">Registros</th></tr></thead><tbody>' + linhasTabela + '</tbody><tfoot><tr><td colspan="3">Total de registros indexados</td><td class="num">' + total + '</td></tr></tfoot></table></section>\n';

        abrirImpressao(montarFolha({
            c: c,
            titulo: 'Relatório de Status · Sistema em Produção',
            cabecalho: 'Status do Sistema',
            ref: s.node || 'node',
            subhead: 'Relatório executivo &middot; emitido automaticamente',
            nota: 'uso interno e auditoria',
            tag: 'Boletim de saúde &middot; v1.0',
            manchete: 'Sistema operacional em tempo real',
            lede: 'Documento sintetiza o estado corrente dos serviços críticos, integrações e contagens das tabelas locais. Recomendado para revisão diária por equipes de produto, sustentação e compliance.',
            pin: 'Servidor e banco online',
            corpo: corpo,
            assinaturas: [
                ['Operações', 'responsável pelo uptime'],
                ['Produto', 'revisão funcional'],
                ['Compliance', 'auditoria interna']
            ]
        }));
    }

    /** Plano em uma linha de texto, para o papel — sem tag colorida. */
    function planoEmTexto(p) {
        if (p.status === 'ativa') return ['Premium', 'good', 'até ' + D.fmtDia(p.valida_ate)];
        if (p.status === 'inadimplente') return ['Inadimplente', 'bad', 'venceu há ' + p.dias_atraso + ' dia(s)'];
        if (p.status === 'cancelada') return ['Cancelada', 'neutral', '—'];
        return ['Sem plano', 'neutral', '—'];
    }

    /**
     * Mesma folha do relatório do servidor, outro miolo: a carteira de
     * cadastros como ela está na tela — inclusive filtrada, se houver busca,
     * porque o que se imprime tem de bater com o que se está olhando.
     */
    function imprimirCadastros(lista, termo) {
        var r = (estado.dados && estado.dados.resumo) || {};
        var c = carimbos('CD');

        var premium = lista.filter(function (p) { return p.status === 'ativa'; }).length;
        var inadimplentes = lista.filter(function (p) { return p.status === 'inadimplente'; }).length;
        var semPlano = lista.length - premium - inadimplentes;
        var chamados = lista.reduce(function (a, p) { return a + (p.chamados_total || 0); }, 0);

        var linhas = lista.map(function (p, i) {
            var plano = planoEmTexto(p);
            return '<tr>' +
                '<td>' + String(i + 1).padStart(2, '0') + '</td>' +
                '<td><strong>' + esc(p.nome || p.email || '—') + '</strong><br><span style="color:#787878;font-size:11px;">' + esc(p.email || '') + '</span></td>' +
                '<td>' + esc(p.oab || '—') + '</td>' +
                '<td>' + esc(p.telefone || '—') + '</td>' +
                '<td><span class="pill ' + plano[1] + '">' + esc(plano[0]) + '</span><br><span style="color:#787878;font-size:11px;">' + esc(plano[2]) + '</span></td>' +
                '<td>' + (p.free_usado ? 'usado' : 'disponível') + '</td>' +
                '<td class="num">' + (p.chamados_total || 0) + '</td>' +
                '</tr>';
        }).join('');

        var recorte = termo
            ? 'Recorte da busca por <em>' + esc(termo) + '</em> &middot; ' + lista.length + ' de ' + ((estado.dados && estado.dados.pessoas || []).length) + ' cadastros'
            : 'Relação integral &middot; ' + lista.length + ' cadastros';

        var corpo =
            '<section><div class="section-head"><h3>I. Panorama da carteira</h3><span class="roman">&sect; 1</span></div><dl class="specs">' +
            '<div class="item"><dt>Cadastros</dt><dd class="answer"><span class="mono">' + lista.length + '</span></dd><dd><span class="pill neutral">total</span></dd></div>' +
            '<div class="item"><dt>Premium</dt><dd class="answer"><span class="mono">' + premium + '</span></dd><dd><span class="pill good">ativos</span></dd></div>' +
            '<div class="item"><dt>Inadimplentes</dt><dd class="answer"><span class="mono">' + inadimplentes + '</span></dd><dd><span class="pill ' + (inadimplentes ? 'bad' : 'good') + '">' + (inadimplentes ? 'em atraso' : 'nenhum') + '</span></dd></div>' +
            '<div class="item"><dt>Sem plano</dt><dd class="answer"><span class="mono">' + semPlano + '</span></dd><dd><span class="pill neutral">gratuito</span></dd></div>' +
            '<div class="item"><dt>Receita/mês</dt><dd class="answer"><span class="mono">R$ ' + esc(Number(r.receita_mes || 0).toLocaleString('pt-BR')) + '</span></dd><dd><span class="pill good">recorrente</span></dd></div>' +
            '<div class="item"><dt>Grátis usados</dt><dd class="answer"><span class="mono">' + (r.free_usados == null ? '—' : r.free_usados) + '</span></dd><dd><span class="pill neutral">cortesia</span></dd></div>' +
            '</dl></section>\n' +
            '<section><div class="section-head"><h3>II. Relação de cadastros</h3><span class="roman">&sect; 2</span></div><table class="ledger"><caption>' + recorte + '</caption><thead><tr><th style="width:40px;">#</th><th>Pessoa</th><th style="width:80px;">OAB</th><th style="width:120px;">WhatsApp</th><th style="width:130px;">Plano</th><th style="width:80px;">Grátis</th><th style="width:80px;" class="num">Chamados</th></tr></thead><tbody>' + linhas + '</tbody><tfoot><tr><td colspan="6">Total de atendimentos dos cadastros listados</td><td class="num">' + chamados + '</td></tr></tfoot></table></section>\n';

        abrirImpressao(montarFolha({
            c: c,
            titulo: 'Relação de Cadastros · Carteira de Clientes',
            cabecalho: 'Relação de Cadastros',
            ref: lista.length + ' reg.',
            subhead: 'Relatório de carteira &middot; emitido automaticamente',
            nota: 'contém dados pessoais &middot; uso interno',
            tag: 'Cadastros e planos &middot; v1.0',
            manchete: 'Carteira de cadastros e planos',
            lede: 'Documento relaciona as pessoas cadastradas na plataforma, o plano de cada uma e o histórico de atendimentos. Contém dados pessoais: circulação restrita às equipes de atendimento e financeiro.',
            pin: 'Cadastros em dia',
            corpo: corpo,
            assinaturas: [
                ['Atendimento', 'conferência da carteira'],
                ['Financeiro', 'planos e inadimplência'],
                ['Compliance', 'proteção de dados']
            ]
        }));
    }

    function desenharDiag() {
        if (!alvoDiag || !estado.dados) return;
        var s = estado.dados.saude;
        if (!s) return;

        var pagamentoOk = /^link/.test(s.pagamento);
        var tabelas = s.tabelas || [];

        D.trocar(alvoDiag, [
            el('div.bloco-topo', {}, el('div', {}, [
                el('h2', { texto: 'Servidor e banco' }),
                el('p.bloco-nota', { texto: 'Tempo real.' })
            ])),
            el('div.diag-grid', {}, [
                diagCard({
                    icone: 'banco', rotulo: 'Banco', largo: true,
                    badgeTexto: 'arquivo local',
                    valor: s.banco, mono: true
                }),
                diagCard({
                    icone: 'servidor', rotulo: 'Servidor no ar desde',
                    badgeTexto: 'uptime',
                    valor: D.fmtData(s.servidor_desde), mono: true
                }),
                diagCard({
                    icone: 'node', rotulo: 'Node',
                    badgeTexto: 'runtime',
                    valor: s.node, mono: true
                }),
                diagCard({
                    icone: 'email', rotulo: 'E-mail',
                    badgeTexto: s.email,
                    valor: null
                }),
                diagCard({
                    icone: 'sms', rotulo: 'SMS',
                    badgeTexto: s.sms,
                    valor: null
                }),
                diagCard({
                    icone: 'google', rotulo: 'Login Google',
                    badgeTexto: s.google,
                    valor: null
                }),
                diagCard({
                    icone: 'pagamento', rotulo: 'Pagamento', largo: true,
                    badgeTexto: pagamentoOk ? 'ligado' : 'não ligado',
                    valor: s.pagamento
                }),
                diagCard({
                    icone: 'tabelas', rotulo: 'Tabelas', cheia: true,
                    badgeTexto: 'contagens',
                    valor: null,
                    extra: el('div', {}, [
                        el('table.diag-tabela', {}, [
                            el('thead', {}, el('tr', {}, [
                                el('th', { texto: '#' }),
                                el('th', { texto: 'Tabela' }),
                                el('th', { texto: 'Descrição' }),
                                el('th.num', { texto: 'Registros' })
                            ])),
                            el('tbody', {}, tabelas.map(function (t, i) {
                                var desc = descricaoTabela(t.nome);
                                return el('tr', {}, [
                                    el('td', { texto: String(i + 1).padStart(2, '0') }),
                                    el('td', { texto: t.nome }),
                                    el('td', { texto: desc }),
                                    el('td.num', { texto: String(t.linhas) })
                                ]);
                            })),
                            el('tfoot', {}, el('tr', {}, [
                                el('td', { colspan: '3', texto: 'Total de registros indexados' }),
                                el('td.num', { texto: String(tabelas.reduce(function (s, t) { return s + t.linhas; }, 0)) })
                            ]))
                        ]),
                        el('div.diag-tabela-acoes', {}, 
                            el('button.acao.diag-btn-imprimir', {
                                type: 'button',
                                texto: 'Imprimir relatório',
                                aoClicar: function () { imprimirRelatorio(estado.dados); }
                            })
                        )
                    ])
                })
            ])
        ]);
    }

    /** Baixa: o encontro aconteceu. A linha fica verde e sai da pendência. */
    function darBaixa(a) {
        global.AdminDesfazer.agendar({
            texto: (a.nome || a.oab) + ' → atendido',
            aoConfirmar: function () {
                return global.AdminApi.atendido(a.id).then(function (r) {
                    if (r && r.success === false) { alert(r.error || 'Não foi possível dar a baixa.'); }
                    carregar();
                });
            }
        });
    }

    /** Volta atrás de uma baixa dada por engano. */
    function desfazerBaixa(a) {
        if (!confirm('Desfazer a baixa de ' + (a.nome || a.oab) + '?\n\n' +
                     'O atendimento volta a constar como pendente.')) return;

        global.AdminApi.atendido(a.id, true).then(function (r) {
            if (r && r.success === false) { alert(r.error || 'Não foi possível desfazer.'); }
            carregar();
        });
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
