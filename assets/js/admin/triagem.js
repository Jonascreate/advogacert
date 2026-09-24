/* ==========================================================
   admin/triagem.js — o meio do caminho
   ==========================================================
   Depois que a OAB é conferida, o pedido para aqui até alguém marcar o
   horário. Uma lista só, com todos os pedidos — grátis, dia e mensal —
   e todos chegam como "Aguardando conferência".

   Marcar o horário já abre o chamado: o pedido sai da triagem e passa
   para a aba Chamados. Não há etapa de "revisar e confirmar" no meio.
   ========================================================== */
(function (global) {
    'use strict';

    var D = global.AdminDom;
    var el = D.el;

    var VERIFICACAO_HORAS = 24;// pendente há mais de um dia: você está devendo
    var estado = { pendentes: [], aguardando: [], marcados: [], atrasados: 0 };
    var alvo;

    /** Grátis, Dia (R$59) ou Mensal (R$199) — o mesmo plano da fila de verificação. */
    function selo(tipo) {
        if (tipo === 'plus') return D.tag('Mensal', 'plus');
        if (tipo === 'premium') return D.tag('Dia', 'ativa');
        return D.tag('Grátis', 'livre');
    }

    /** Nome, inscrição e WhatsApp: o que o funcionário precisa para ligar. */
    function quemPediu(item, linhaDeCima) {
        return el('div', {}, [
            linhaDeCima,
            el('div.triagem-inscricao', { texto: 'OAB ' + item.inscricao }),
            el('div.fraco', { texto: item.nome || '—' }),
            item.contato ? el('div.fraco', { texto: 'WhatsApp ' + item.contato }) : null
        ]);
    }

    /**
     * Pedido com a OAB conferida e sem horário.
     *
     * "Marcar horário" abre a agenda e, marcado, já abre o chamado.
     * "Atender agora" abre o chamado sem hora combinada.
     */
    function cartaoAguardando(item) {
        // Conferido há muito tempo e ninguém marcou: vale destacar.
        var esquecido = Number(item.horas_desde || 0) >= VERIFICACAO_HORAS;

        return el('article.triagem-card.aguardando' + (esquecido ? '.critico' : ''), {}, [
            el('div.triagem-topo', {}, [
                quemPediu(item, el('span.triagem-quando' + (esquecido ? '.critico' : ''), {
                    texto: 'Aguardando conferência · chegou há ' + D.fmtEspera(item.horas_desde)
                })),
                el('div.triagem-lado', {}, [
                    selo(item.tipo),
                    esquecido ? D.tag('Parado há mais de 1 dia', 'atrasada') : null
                ])
            ]),
            el('div.triagem-acoes', {}, [
                el('button.acao.acao-promover', {
                    type: 'button',
                    texto: 'Marcar horário',
                    aoClicar: function (e) {
                        abrirAgenda(item, e.target, false, function (agendamentoId) {
                            promoverDireto(item, agendamentoId);
                        });
                    }
                }),
                el('button.acao', {
                    type: 'button',
                    texto: 'Atender agora (sem horário)',
                    aoClicar: function () { abrirChamadoDireto(item); }
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
        if (!confirm('Atender ' + item.inscricao + ' agora?\n\n' +
                     'O chamado é aberto sem hora marcada. ' +
                     'Se preferir combinar um horário antes, use "Marcar horário".')) return;

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
     * Pedido que chegou com agendamento já criado: o cliente escolheu a hora
     * no site, ou o Premium pediu atendimento sem hora. Também chega como
     * "Aguardando conferência" — quem decide o horário final é você.
     */
    function cartaoMarcado(item) {
        var atrasado = item.passou;

        var status = item.sem_horario
            ? 'Aguardando conferência · pediu atendimento sem horário'
            : 'Aguardando conferência · horário pedido: ' + D.fmtData(item.inicio);

        return el('article.triagem-card.marcado' + (atrasado ? '.critico' : ''), {}, [
            el('div.triagem-topo', {}, [
                quemPediu(item, el('span.triagem-quando' + (atrasado ? '.critico' : ''), { texto: status })),
                el('div.triagem-lado', {}, [
                    selo(item.tipo),
                    atrasado ? D.tag('Horário já passou', 'atrasada') : null
                ])
            ]),
            el('div.triagem-acoes', {}, [
                // Marcar (ou trocar) o horário também abre o chamado.
                el('button.acao.acao-promover', {
                    type: 'button',
                    texto: item.sem_horario ? 'Marcar horário' : 'Trocar horário',
                    aoClicar: function (e) {
                        abrirAgenda(item, e.target, true, function () {
                            promoverDireto(item, item.id);
                        });
                    }
                }),
                // Mantém o que já está e abre o chamado assim mesmo.
                el('button.acao', {
                    type: 'button',
                    texto: item.sem_horario ? 'Atender agora (sem horário)' : 'Manter horário e abrir chamado',
                    aoClicar: function () { confirmar(item); }
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
                     'O atendimento entra na aba Chamados. ' +
                     'Para encerrar depois, é lá que se muda o status.')) return;

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
                             diaAtual.rotulo + ' às ' + h.rotulo + '?\n\n' +
                             'O cliente recebe o horário por e-mail' +
                             (aoMarcar ? ' e o chamado é aberto em seguida.' : '.'))) return;

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
        // Uma lista só: grátis, dia e mensal juntos. Os sem agendamento vêm
        // primeiro (o mais antigo no topo), depois os que já pediram horário.
        var cartoes = estado.aguardando.map(cartaoAguardando)
            .concat(estado.marcados.map(cartaoMarcado));

        var blocos = [
            el('div.bloco-topo', {}, el('div', {}, [
                el('h2', { texto: 'Triagem' })
            ])),
            el('h3.ind-sub', {
                texto: 'Pedidos aguardando conferência (' + cartoes.length + ')'
            }),
            cartoes.length
                ? el('div.triagem-lista', {}, cartoes)
                : el('div.vazio', { texto: 'Nenhum pedido esperando.' })
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
