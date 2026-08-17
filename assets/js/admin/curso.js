/* ==========================================================
   admin/curso.js — turmas do curso e quem está inscrito
   ==========================================================
   A tela é organizada por TURMA, não por pessoa. A pergunta real do dia a
   dia nunca é "quem se inscreveu" solto: é "como está a turma de terça" —
   quantos lugares sobraram, quem confirmou, quem ficou pelo caminho.

   Duas situações ocupam vaga: `confirmada` e `pendente` recente. A pendente
   é quem escolheu o dia e foi ao Mercado Pago; ela vence sozinha em 30
   minutos e o lugar volta para o site. Por isso "vagas" pode ser maior que
   `capacidade - inscritos`: as pendentes vencidas continuam na lista, como
   registro de quem chegou ao checkout e não pagou, mas já não seguram nada.

   A confirmação manual existe porque a automática depende de o e-mail do
   Mercado Pago ser o mesmo do cadastro. Quando não for, a vaga fica pendente
   esperando alguém decidir — e é aqui que se decide.
   ========================================================== */
(function (global) {
    'use strict';

    var D = global.AdminDom;
    var el = D.el;

    var estado = { dados: null, mostrarPassadas: false };
    var alvo;

    // ---------------- montagem ----------------

    function rotuloTurma(t) {
        var d = new Date(t.inicio);
        return d.toLocaleDateString('pt-BR', {
            weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo'
        }).replace('.', '') + ' · ' + d.toLocaleTimeString('pt-BR', {
            hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
        });
    }

    function selo(status) {
        var mapa = {
            confirmada: ['ok', 'Confirmada'],
            pendente:   ['alerta', 'Pendente'],
            cancelada:  ['neutro', 'Cancelada']
        };
        var m = mapa[status] || ['neutro', status];
        return el('span.selo-curso.' + m[0], { texto: m[1] });
    }

    function linhaInscrito(i) {
        var acoes = [];

        if (i.status !== 'confirmada') {
            acoes.push(el('button.acao.mini', {
                type: 'button', texto: 'Confirmar',
                aoClicar: function () { mudar(i.id, 'confirmada'); }
            }));
        }
        if (i.status !== 'cancelada') {
            acoes.push(el('button.acao.mini.discreta', {
                type: 'button', texto: 'Cancelar',
                aoClicar: function () {
                    if (confirm('Cancelar a inscrição de ' + (i.nome || i.email || 'sem nome') + '?')) {
                        mudar(i.id, 'cancelada');
                    }
                }
            }));
        }

        return el('div.insc-linha', {}, [
            el('div.insc-quem', {}, [
                el('strong', { texto: i.nome || '(sem nome)' }),
                el('span.insc-contato', { texto: [i.email, i.telefone, i.oab].filter(Boolean).join(' · ') || '—' })
            ]),
            el('div.insc-situacao', {}, [
                selo(i.status),
                el('span.insc-quando', {
                    texto: D.fmtData ? D.fmtData(i.criado_em) : new Date(i.criado_em).toLocaleString('pt-BR')
                })
            ]),
            el('div.insc-acoes', {}, acoes)
        ]);
    }

    function cartaoTurma(t) {
        var lotada = t.vagas <= 0;

        var cabecalho = el('div.turma-topo', {}, [
            el('div', {}, [
                el('strong.turma-data', { texto: rotuloTurma(t) }),
                el('div.turma-nota', {
                    texto: t.confirmadas + ' confirmada(s) · ' + t.pendentes + ' pendente(s) · ' +
                           t.capacidade + ' lugares'
                })
            ]),
            el('div.turma-direita', {}, [
                el('span.turma-vagas' + (lotada ? '.lotada' : ''), {
                    texto: lotada ? 'Lotada' : t.vagas + (t.vagas === 1 ? ' vaga' : ' vagas')
                }),
                el('button.acao.mini' + (t.status === 'aberta' ? '.discreta' : ''), {
                    type: 'button',
                    texto: t.status === 'aberta' ? 'Fechar' : 'Reabrir',
                    title: t.status === 'aberta'
                        ? 'Some do site. Os inscritos continuam registrados.'
                        : 'Volta a aparecer no site enquanto houver vaga.',
                    aoClicar: function () {
                        salvarTurma({ id: t.id, status: t.status === 'aberta' ? 'fechada' : 'aberta' });
                    }
                })
            ])
        ]);

        var corpo = t.inscritos.length
            ? el('div.insc-lista', {}, t.inscritos.map(linhaInscrito))
            : el('div.vazio.mini', { texto: 'Ninguém inscrito nesta turma ainda.' });

        return el('div.turma-card' + (t.passada ? '.passada' : '') +
                  (t.status !== 'aberta' ? '.fechada' : ''), {}, [cabecalho, corpo]);
    }

    function formNovaTurma() {
        var campoData = el('input', { type: 'datetime-local', id: 'curso-nova-data' });
        var campoCap = el('input', { type: 'number', min: '1', valor: '5', id: 'curso-nova-cap' });
        var msg = el('span.form-msg');

        return el('div.turma-nova', {}, [
            el('strong', { texto: 'Abrir turma' }),
            el('div.turma-nova-campos', {}, [
                el('label', {}, ['Data e hora', campoData]),
                el('label', {}, ['Lugares', campoCap]),
                el('button.acao', {
                    type: 'button', texto: 'Criar turma',
                    aoClicar: function () {
                        if (!campoData.value) { msg.textContent = 'Escolha a data e a hora.'; return; }
                        msg.textContent = 'Salvando…';
                        // O campo datetime-local é hora LOCAL do navegador. O
                        // new Date() interpreta como local e o servidor grava o
                        // ISO em UTC — sem isso, turma marcada às 19h viraria
                        // 19h UTC, ou seja, 16h de Goiás.
                        salvarTurma({
                            inicio: new Date(campoData.value).toISOString(),
                            capacidade: Number(campoCap.value) || 5
                        }, msg);
                    }
                }),
                msg
            ])
        ]);
    }

    function desenhar() {
        var d = estado.dados;
        if (!d) { D.trocar(alvo, el('div.vazio', { texto: 'Carregando turmas...' })); return; }

        var turmas = d.turmas.filter(function (t) {
            return estado.mostrarPassadas || !t.passada;
        });

        var totalConfirmadas = d.turmas.reduce(function (s, t) { return s + t.confirmadas; }, 0);
        var totalPendentes = d.turmas.reduce(function (s, t) { return s + t.pendentes; }, 0);

        D.trocar(alvo, [
            el('div.bloco-topo', {}, [
                el('div', {}, [
                    el('h2', { texto: 'Inscrições do curso' }),
                    el('p.bloco-nota', {
                        texto: totalConfirmadas + ' confirmada(s) e ' + totalPendentes +
                               ' pendente(s) · R$ ' + d.valor + ' por inscrição'
                    })
                ]),
                el('div.bloco-acoes', {}, [
                    el('label.filtro-inline', {}, [
                        el('input', {
                            type: 'checkbox',
                            checked: estado.mostrarPassadas || null,
                            aoMudar: function (e) {
                                estado.mostrarPassadas = e.target.checked;
                                desenhar();
                            }
                        }),
                        ' mostrar turmas passadas'
                    ])
                ])
            ]),

            formNovaTurma(),

            turmas.length
                ? el('div.turmas-grid', {}, turmas.map(cartaoTurma))
                : el('div.vazio', { texto: 'Nenhuma turma futura. Abra uma acima.' }),

            // Mesma ação e mesmo canto das outras tabelas do painel.
            d.turmas.length ? el('div.diag-tabela-acoes', {},
                el('button.acao.diag-btn-imprimir', {
                    type: 'button',
                    texto: 'Imprimir relatório',
                    aoClicar: function () { imprimir(turmas); }
                })
            ) : null
        ]);
    }

    // ---------------- ações ----------------

    function mudar(id, status) {
        global.AdminApi.mudarInscricaoCurso(id, status)
            .then(function (r) {
                if (r && r.aviso) alert(r.aviso);
                return carregar();
            })
            .catch(function () {});
    }

    function salvarTurma(dados, msg) {
        global.AdminApi.salvarTurmaCurso(dados)
            .then(function (r) {
                if (msg) msg.textContent = (r && r.success) ? '' : ((r && r.error) || 'Não deu certo.');
                if (r && r.success) return carregar();
            })
            .catch(function () { if (msg) msg.textContent = 'Sem conexão com o servidor.'; });
    }

    // ---------------- impressão ----------------

    /** Relatório no mesmo papel timbrado das outras abas (ver AdminFolha). */
    function imprimir(turmas) {
        var F = global.AdminFolha;
        if (!F) { alert('Módulo de impressão não carregado.'); return; }

        var esc = F.esc;
        var c = F.carimbos('CUR');

        var corpo = turmas.map(function (t, idx) {
            var linhas = t.inscritos.length
                ? t.inscritos.map(function (i, n) {
                    return '<tr><td class="num">' + (n + 1) + '</td>' +
                           '<td>' + esc(i.nome || '(sem nome)') + '</td>' +
                           '<td>' + esc(i.email || '—') + '</td>' +
                           '<td>' + esc(i.telefone || '—') + '</td>' +
                           '<td>' + esc(i.status) + '</td></tr>';
                }).join('')
                : '<tr><td colspan="5"><em>Nenhum inscrito.</em></td></tr>';

            return '<section>' +
                '<div class="section-head"><h3>' + esc(rotuloTurma(t)) + '</h3>' +
                '<span class="roman">' + (idx + 1) + ' de ' + turmas.length + '</span></div>' +
                '<dl class="specs">' +
                    '<div class="item"><dt>Lugares</dt><dd>' + t.capacidade + '</dd></div>' +
                    '<div class="item"><dt>Confirmadas</dt><dd>' + t.confirmadas + '</dd></div>' +
                    '<div class="item"><dt>Pendentes</dt><dd>' + t.pendentes + '</dd></div>' +
                    '<div class="item"><dt>Vagas livres</dt><dd>' + t.vagas + '</dd></div>' +
                '</dl>' +
                '<table class="ledger"><thead><tr><th></th><th>Nome</th><th>E-mail</th>' +
                '<th>Telefone</th><th>Situação</th></tr></thead><tbody>' + linhas + '</tbody></table>' +
                '</section>';
        }).join('');

        var confirmadas = turmas.reduce(function (s, t) { return s + t.confirmadas; }, 0);

        F.abrir(F.montar({
            titulo: 'Inscrições do curso',
            cabecalho: 'Inscrições do Curso',
            ref: 'Turmas',
            subhead: 'Relação de inscritos por turma',
            nota: 'Documento operacional interno',
            tag: 'Inscrições',
            manchete: turmas.length + ' turma(s) em relação',
            lede: confirmadas + ' inscrição(ões) confirmada(s) no período listado.',
            pin: 'Emitido',
            corpo: corpo,
            assinaturas: [['Responsável', 'Coordenação do curso'], ['Conferido por', 'Painel AdvogaCert']],
            c: c
        }));
    }

    // ---------------- carga ----------------

    function carregar() {
        return global.AdminApi.curso()
            .then(function (d) {
                if (d && d.success) { estado.dados = d; desenhar(); }
            })
            .catch(function () {});
    }

    global.AdminCurso = {
        montar: function (no) { alvo = no; desenhar(); return carregar(); },
        recarregar: carregar
    };
})(window);
