/* ==========================================================
   admin/triagem.js — o meio do caminho
   ==========================================================
   Depois que você confere a OAB, a pessoa não vira chamado na hora: ela
   ainda precisa escolher o horário. Sem esta aba, quem é liberado sai da
   fila de verificação e some do painel — você não saberia que existe
   alguém autorizado que nunca voltou para marcar.

   São duas listas, e a diferença entre elas é de quem é a vez:

     Aguardando marcar — a bola está com o cliente
     Marcados          — a bola está com você
   ========================================================== */
(function (global) {
    'use strict';

    var D = global.AdminDom;
    var el = D.el;

    var VERIFICACAO_HORAS = 24;// pendente há mais de um dia: você está devendo
    var estado = { pendentes: [], aguardando: [], marcados: [], atrasados: 0 };
    var alvo;

    /** Grátis ou Premium — a etiqueta acompanha a pessoa por toda a esteira. */
    function selo(tipo) {
        return D.tag(tipo === 'premium' ? 'Premium' : 'Grátis',
                     tipo === 'premium' ? 'ativa' : 'livre');
    }

    /**
     * Etapa 2: OAB conferida, sem horário ainda.
     *
     * Sem este cartão a pessoa liberada some da tela: ela saiu da fila de
     * verificação e ainda não entrou em "marcados". Era exatamente o buraco
     * que deixava a Triagem em branco com gente esperando dentro dela.
     *
     * Mesmos dois botões do cartão de quem já tem hora: "Remarcar" abre a
     * agenda, "Abrir chamado" fecha a triagem. A diferença é que aqui não há
     * horário ainda, então "Abrir chamado" abre a agenda antes e emenda o
     * resto sozinho — marcar, confirmar e promover — em vez de recusar o
     * clique com um aviso.
     */
    function cartaoAguardando(item) {
        // Liberado há muito tempo e ninguém marcou: a bola está com o
        // cliente, mas passou do razoável e vale aparecer em destaque.
        var esquecido = Number(item.horas_desde || 0) >= VERIFICACAO_HORAS;

        return el('article.triagem-card.aguardando' + (esquecido ? '.critico' : ''), {}, [
            el('div.triagem-topo', {}, [
                el('div', {}, [
                    el('span.triagem-quando' + (esquecido ? '.critico' : ''), {
                        texto: 'Liberado há ' + D.fmtEspera(item.horas_desde)
                    }),
                    el('div.triagem-inscricao', { texto: item.inscricao }),
                    el('div.fraco', { texto: item.nome || '—' }),
                    item.contato ? el('div.fraco', { texto: item.contato }) : null
                ]),
                el('div.triagem-lado', {}, [
                    selo(item.tipo),
                    esquecido ? D.tag('Sem marcar', 'atrasada') : null
                ])
            ]),
            el('div.triagem-acoes', {}, [
                el('button.acao.acao-promover', {
                    type: 'button',
                    texto: 'Abrir chamado',
                    // Abre o chamado na hora, sem passar pelo calendário: o
                    // atendimento é agora, não numa data futura. O servidor
                    // cria o agendamento com sem_horario, do mesmo jeito que
                    // o Premium já fazia.
                    aoClicar: function () { abrirChamadoDireto(item); }
                }),
                el('button.acao', {
                    type: 'button',
                    texto: 'Remarcar',
                    aoClicar: function (e) { abrirAgenda(item, e.target, false); }
                })
            ])
        ]);
    }

    /**
     * Abre o chamado de quem foi liberado e não marcou hora nenhuma.
     *
     * Três chamadas encadeadas nas rotas que já existiam: cria o agendamento
     * sem hora combinada, confirma e promove. Nenhuma delas foi inventada
     * para isto — é o mesmo caminho do Premium, que também não marca hora.
     */
    function abrirChamadoDireto(item) {
        if (!confirm('Abrir chamado para ' + item.inscricao + ' agora?\n\n' +
                     'O atendimento entra na fila sem hora marcada. ' +
                     'Se preferir combinar um horário antes, use "Remarcar".')) return;

        global.AdminDesfazer.agendar({
            texto: item.inscricao + ' → chamado',
            aoConfirmar: function () {
                return global.AdminApi.agendarSemHorario(item.verificacao_id)
                    .then(function (r) {
                        if (!r || !r.success) throw new Error(r && r.error);
                        return promoverDireto(item, r.agendamento_id);
                    })
                    .catch(function (e) {
                        alert((e && e.message) || 'Não foi possível abrir o chamado.');
                        carregar();
                    });
            }
        });
    }

    /** Confirma e promove um agendamento recém-criado, sem passo extra. */
    function promoverDireto(item, agendamentoId) {
        if (!agendamentoId) { carregar(); return; }

        return global.AdminApi.confirmar(agendamentoId)
            .then(function (r) {
                if (!r || !r.success) throw new Error(r && r.error);
                return global.AdminApi.promover(agendamentoId);
            })
            .then(function (r) {
                if (!r || !r.success) throw new Error(r && r.error);
                carregar();
                if (global.AdminFilaChamados) global.AdminFilaChamados.recarregar();
            })
            .catch(function (e) {
                alert((e && e.message) ||
                      'O horário foi marcado, mas o chamado não abriu. Ele está na lista de baixo.');
                carregar();
            });
    }

    /**
     * Etapa 3: hora marcada, esperando sua decisão.
     *
     * É aqui que a triagem deixa de ser lista e vira sala de decisão. Você
     * confere se o horário ainda serve, remarca se houver força maior, e só
     * então passa para chamado — que é quando o prazo começa a correr.
     */
    function cartaoMarcado(item) {
        var atrasado = item.passou;

        // Premium sem_horario não tem hora real: mostra "pedido direto" em
        // vez de uma data que pareceria um horário marcado de verdade.
        var quando = item.sem_horario
            ? el('span.triagem-quando', { texto: 'Pedido direto (sem horário)' })
            : el('span.triagem-quando' + (atrasado ? '.critico' : ''), { texto: D.fmtData(item.inicio) });

        return el('article.triagem-card.marcado' + (atrasado ? '.critico' : ''), {}, [
            el('div.triagem-topo', {}, [
                el('div', {}, [
                    quando,
                    el('div.triagem-inscricao', { texto: item.inscricao }),
                    el('div.fraco', { texto: item.nome || '—' })
                ]),
                el('div.triagem-lado', {}, [
                    selo(item.tipo),
                    atrasado ? D.tag('Passou da hora', 'atrasada') : null
                ])
            ]),
            el('div.triagem-acoes', {}, [
                // O botão que fecha a triagem: confirma o horário e já abre
                // o chamado. Encerrar o atendimento é depois, na aba
                // Chamados, mudando o status para "Fechado".
                el('button.acao.acao-promover', {
                    type: 'button',
                    texto: 'Abrir chamado',
                    aoClicar: function () { confirmar(item); }
                }),
                // Vale para os dois casos: quem tem hora troca de hora, e quem
                // entrou sem hora combinada (Premium, ou grátis atendido na
                // hora) ganha uma. A rota é a mesma; muda só o rótulo.
                el('button.acao', {
                    type: 'button',
                    texto: item.sem_horario ? 'Marcar horário' : 'Remarcar',
                    aoClicar: function (e) { abrirAgenda(item, e.target, true); }
                })
            ])
        ]);
    }

    /**
     * Fecha a triagem: confirma o horário e já abre o chamado, num clique
     * só. Encadeia as duas rotas que já existiam (confirmar → promover) em
     * vez de mudar o servidor — nenhuma delas foi tocada.
     */
    function confirmar(item) {
        if (!confirm('Abrir chamado para ' + item.inscricao + '?\n\n' +
                     'O horário é confirmado e o atendimento entra na fila de chamados. ' +
                     'Para encerrar depois, é na aba Chamados.')) return;

        global.AdminDesfazer.agendar({
            texto: item.inscricao + ' → chamado',
            aoConfirmar: function () {
                return global.AdminApi.confirmar(item.id)
                    .then(function (r) {
                        if (!r || !r.success) throw new Error(r && r.error);
                        return global.AdminApi.promover(item.id);
                    })
                    .then(function (r) {
                        if (!r || !r.success) throw new Error(r && r.error);
                        carregar();
                        if (global.AdminFilaChamados) global.AdminFilaChamados.recarregar();
                    })
                    .catch(function (e) {
                        alert((e && e.message) || 'Não foi possível abrir o chamado.');
                        carregar();
                    });
            }
        });
    }

    /* ---- Janela da agenda: abrir, fechar, e fechar sozinha ----
       Como ela flutua por cima do conteúdo, precisa sumir ao clicar fora ou
       apertar Esc. Sem isso ficaria uma janela órfã tapando o cartão. */
    function fecharAgenda() {
        var aberta = document.querySelector('.agenda-inline');
        if (aberta && aberta.parentNode) aberta.parentNode.removeChild(aberta);
        document.removeEventListener('mousedown', aoClicarFora, true);
        document.removeEventListener('keydown', aoTeclar, true);
    }

    function aoClicarFora(e) {
        var aberta = document.querySelector('.agenda-inline');
        if (aberta && !aberta.contains(e.target) && !e.target.closest('.triagem-acoes')) {
            fecharAgenda();
        }
    }

    function aoTeclar(e) {
        if (e.key === 'Escape') fecharAgenda();
    }

    function ligarFechamento() {
        document.addEventListener('mousedown', aoClicarFora, true);
        document.addEventListener('keydown', aoTeclar, true);
    }

    /**
     * Escolha do horário pelo painel.
     *
     * A lista vem da mesma rota que a tela pública usa — uma fonte só sobre o
     * que está livre. E o servidor confere de novo ao gravar: você e um
     * cliente podem estar clicando no mesmo horário no mesmo instante.
     */
    function abrirAgenda(item, botao, remarcando, aoMarcar) {
        var caixa = botao.parentNode.querySelector('.agenda-inline');
        if (caixa) { fecharAgenda(); return; }

        fecharAgenda();   // só uma janela aberta por vez em toda a tela

        caixa = el('div.agenda-inline', {}, el('div.fraco', { texto: 'Carregando horários...' }));
        botao.parentNode.appendChild(caixa);

        // A janela sobe por cima do cartão; se o botão estiver perto do topo
        // da janela do navegador ela não caberia, e aí desce.
        if (botao.getBoundingClientRect().top < 380) caixa.classList.add('para-baixo');

        ligarFechamento();

        global.AdminApi.horariosLivres().then(function (d) {
            var dias = (d && d.dias) || [];
            if (!dias.length) {
                D.trocar(caixa, el('div.fraco', { texto: 'Sem horário livre nos próximos dias.' }));
                return;
            }

            var diaAtual = dias[0];
            var aviso = el('div.agenda-aviso');

            function pintar() {
                D.trocar(caixa, [
                    el('div.agenda-dias', {}, dias.map(function (dia) {
                        return el('button.agenda-dia' + (dia.dia === diaAtual.dia ? '.ativo' : ''), {
                            type: 'button',
                            aoClicar: function () { diaAtual = dia; pintar(); }
                        }, [
                            el('span.agenda-dia-sem', { texto: dia.semana }),
                            el('span.agenda-dia-num', { texto: dia.numero }),
                            el('span.agenda-dia-vagas', { texto: dia.vagas + 'v' })
                        ]);
                    })),
                    el('div.agenda-horas', {}, diaAtual.horarios.map(function (h) {
                        return el('button.agenda-hora', {
                            type: 'button',
                            texto: h.rotulo,
                            aoClicar: function () { confirmar(h); }
                        });
                    })),
                    aviso
                ]);
            }

            function confirmar(h) {
                var verbo = remarcando ? 'Remarcar' : 'Marcar';
                if (!confirm(verbo + ' ' + item.inscricao + ' para ' +
                             diaAtual.rotulo + ' às ' + h.rotulo + '?' +
                             (remarcando ? '\n\nO cliente será avisado do novo horário.' : ''))) return;

                aviso.textContent = remarcando ? 'Remarcando...' : 'Marcando...';
                var chamada = remarcando
                    ? global.AdminApi.remarcar(item.id, h.inicio)
                    : global.AdminApi.agendar(item.verificacao_id, h.inicio);

                chamada.then(function (r) {
                    if (!r || !r.success) {
                        aviso.textContent = (r && r.error) || 'Não foi possível marcar.';
                        aviso.className = 'agenda-aviso erro';
                        return;
                    }
                    fecharAgenda();
                    // Quem abriu pelo "Abrir chamado" continua daqui; quem
                    // abriu pelo "Remarcar" para por aqui mesmo.
                    if (aoMarcar) { aoMarcar(r.agendamento_id || item.id); return; }
                    carregar();                       // o item muda de etapa
                    if (global.AdminFilaChamados) global.AdminFilaChamados.recarregar();
                }).catch(function () {
                    aviso.textContent = 'Erro de conexão.';
                    aviso.className = 'agenda-aviso erro';
                });
            }

            pintar();
        }).catch(function () {
            D.trocar(caixa, el('div.fraco', { texto: 'Não foi possível carregar a agenda.' }));
        });
    }

    function desenhar() {
        var blocos = [
            el('div.bloco-topo', {}, el('div', {}, [
                el('h2', { texto: 'Triagem' })
            ])),

            // Primeira lista: a bola está com o cliente (liberado, sem hora).
            el('h3.ind-sub', {
                texto: 'Liberado — falta marcar o horário (' + estado.aguardando.length + ')'
            }),
            estado.aguardando.length
                ? el('div.triagem-lista', {}, estado.aguardando.map(cartaoAguardando))
                : el('div.vazio', { texto: 'Ninguém esperando horário.' }),

            // Segunda lista: a bola está com você.
            el('h3.ind-sub', {
                texto: 'Horário marcado — revise e confirme (' + estado.marcados.length +
                       (estado.atrasados ? ' · ' + estado.atrasados + ' passaram da hora' : '') + ')'
            }),
            estado.marcados.length
                ? el('div.triagem-lista', {}, estado.marcados.map(cartaoMarcado))
                : el('div.vazio', { texto: 'Nada esperando confirmação.' })
        ];

        D.trocar(alvo, blocos);
    }

    function carregar() {
        return global.AdminApi.triagem().then(function (d) {
            if (!d || !d.success) return;
            estado.pendentes = d.aguardando_verificacao || [];
            estado.aguardando = d.aguardando_marcar || [];
            estado.marcados = d.marcados || [];
            estado.atrasados = d.atrasados || 0;

            // o contador da aba conta a esteira inteira, e fica âmbar quando
            // há algo esperando você — verificar ou dar baixa
            // A bola da triagem fica âmbar enquanto houver qualquer coisa
            // dentro dela — inclusive marcado esperando ser priorizado. Ela só
            // apaga quando tudo passou para chamado, que é o fim da triagem.
            if (global.AdminBadge) {
                var total = estado.aguardando.length + estado.marcados.length;
                global.AdminBadge('triagem', 'Triagem', total, total > 0);
            }
            desenhar();
        }).catch(function () {});
    }

    global.AdminTriagem = {
        montar: function (no) { alvo = no; desenhar(); return carregar(); },
        recarregar: carregar
    };
})(window);
