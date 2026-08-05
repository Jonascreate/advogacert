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

    var COBRANCA_HORAS = 48;   // liberado e sem marcar: hora de lembrar
    var VERIFICACAO_HORAS = 24;// pendente há mais de um dia: você está devendo
    var estado = { pendentes: [], aguardando: [], marcados: [], atrasados: 0 };
    var alvo;

    /** Grátis ou Premium — a etiqueta acompanha a pessoa por toda a esteira. */
    function selo(tipo) {
        return D.tag(tipo === 'premium' ? 'Premium' : 'Grátis',
                     tipo === 'premium' ? 'ativa' : 'livre');
    }

    function whatsapp(numero, texto) {
        var so = String(numero || '').replace(/\D/g, '');
        if (!so) return null;
        if (so.length <= 11) so = '55' + so;
        return 'https://wa.me/' + so + '?text=' + encodeURIComponent(texto);
    }

    function cartaoAguardando(item) {
        var frio = item.horas_desde >= COBRANCA_HORAS;
        var link = whatsapp(item.contato,
            'Olá, ' + item.nome + '! Seu atendimento gratuito da AdvogaCert está liberado. ' +
            'É só escolher o horário em https://www.agentej.us/index.html#planos');

        return el('article.triagem-card' + (frio ? '.frio' : ''), {}, [
            el('div.triagem-topo', {}, [
                el('div', {}, [
                    el('span.triagem-inscricao', { texto: item.inscricao }),
                    el('div.fraco', { texto: item.nome || '—' })
                ]),
                el('div.triagem-lado', {}, [
                    selo(item.tipo),
                    el('span' + (frio ? '.critico' : '.fraco'), {
                        texto: 'liberado há ' + D.fmtEspera(item.horas_desde)
                    })
                ])
            ]),
            el('div.triagem-acoes', {}, [
                // é este botão que faz a esteira andar: marcada a hora, o
                // item sai da triagem e vira chamado
                el('button.acao.acao-ok', {
                    type: 'button',
                    texto: 'Marcar horário',
                    aoClicar: function (e) { abrirAgenda(item, e.target); }
                }),
                link ? el('a.acao', {
                    href: link, target: '_blank', rel: 'noopener noreferrer',
                    texto: 'Lembrar pelo WhatsApp'
                }) : null,
                el('button.acao', {
                    type: 'button',
                    texto: 'Ver linha do tempo',
                    aoClicar: function (e) { abrirLinha(item.inscricao, e.target); }
                })
            ])
        ]);
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
        var link = whatsapp(item.contato,
            'Olá, ' + item.nome + '! Confirmando seu atendimento da AdvogaCert em ' +
            new Date(item.inicio).toLocaleString('pt-BR', {
                day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
            }) + '.');

        return el('article.triagem-card.marcado' + (atrasado ? '.critico' : ''), {}, [
            el('div.triagem-topo', {}, [
                el('div', {}, [
                    el('span.triagem-quando' + (atrasado ? '.critico' : ''), {
                        texto: D.fmtData(item.inicio)
                    }),
                    el('div.triagem-inscricao', { texto: item.inscricao }),
                    el('div.fraco', { texto: item.nome || '—' })
                ]),
                el('div.triagem-lado', {}, [
                    selo(item.tipo),
                    atrasado ? D.tag('Passou da hora', 'atrasada') : null
                ])
            ]),
            el('div.triagem-acoes', {}, [
                // O botão que fecha a triagem. Ele NÃO abre chamado: manda o
                // atendimento para "Cadastros e agenda", que é a etapa
                // seguinte. O chamado nasce lá, depois da conferência.
                el('button.acao.acao-promover', {
                    type: 'button',
                    texto: 'Confirmar e enviar para agenda',
                    aoClicar: function () { confirmar(item); }
                }),
                el('button.acao', {
                    type: 'button',
                    texto: 'Remarcar',
                    aoClicar: function (e) { abrirAgenda(item, e.target, true); }
                }),
                link ? el('a.acao', {
                    href: link, target: '_blank', rel: 'noopener noreferrer',
                    texto: 'WhatsApp'
                }) : null,
                el('button.acao', {
                    type: 'button',
                    texto: 'Linha do tempo',
                    aoClicar: function (e) { abrirLinha(item.inscricao, e.target); }
                })
            ])
        ]);
    }

    /**
     * Fecha a triagem: o atendimento sai daqui e passa para Cadastros e
     * agenda. O chamado ainda não existe — nasce lá, no botão "Abrir
     * chamado", depois que você confere o cadastro.
     */
    function confirmar(item) {
        if (!confirm('Confirmar ' + item.inscricao + ' e enviar para Cadastros e agenda?\n\n' +
                     'Ele sai da triagem. O chamado é aberto lá, na próxima aba.')) return;

        global.AdminDesfazer.agendar({
            texto: item.inscricao + ' → agenda',
            aoConfirmar: function () {
                return global.AdminApi.confirmar(item.id)
                    .then(function () {
                        carregar();
                        if (global.AdminCadastros) global.AdminCadastros.recarregar();
                    });
            }
        });
    }

    /**
     * Escolha do horário pelo painel.
     *
     * A lista vem da mesma rota que a tela pública usa — uma fonte só sobre o
     * que está livre. E o servidor confere de novo ao gravar: você e um
     * cliente podem estar clicando no mesmo horário no mesmo instante.
     */
    function abrirAgenda(item, botao, remarcando) {
        var caixa = botao.parentNode.querySelector('.agenda-inline');
        if (caixa) { caixa.parentNode.removeChild(caixa); return; }

        caixa = el('div.agenda-inline', {}, el('div.fraco', { texto: 'Carregando horários...' }));
        botao.parentNode.appendChild(caixa);

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

    /**
     * A linha do tempo abre embaixo do botão que a pediu, e não numa janela
     * separada: você está no meio de uma decisão e perder o contexto da lista
     * custa mais do que a tela ganha.
     */
    function abrirLinha(inscricao, botao) {
        var jaAberta = botao.parentNode.querySelector('.linha-tempo');
        if (jaAberta) { jaAberta.parentNode.removeChild(jaAberta); return; }

        var caixa = el('div.linha-tempo', {}, el('div.fraco', { texto: 'Carregando...' }));
        botao.parentNode.appendChild(caixa);

        global.AdminApi.linhaTempo(inscricao).then(function (d) {
            if (!d || !d.success) return;
            if (!d.eventos.length) {
                D.trocar(caixa, el('div.fraco', { texto: 'Sem histórico.' }));
                return;
            }
            D.trocar(caixa, el('ol.lt-lista', {}, d.eventos.map(function (ev) {
                return el('li.lt-item.lt-' + ev.tipo, {}, [
                    el('span.lt-quando', { texto: D.fmtData(ev.em) }),
                    el('span.lt-texto', { texto: ev.texto }),
                    ev.detalhe ? el('span.lt-detalhe', { texto: ev.detalhe }) : null
                ]);
            })));
        }).catch(function () {});
    }

    function desenhar() {
        var blocos = [
            el('div.bloco-topo', {}, el('div', {}, [
                el('h2', { texto: 'Triagem' }),
                el('p.bloco-nota', {
                    texto: 'Tempo real. Aqui se resolve o horário — a conferência da OAB é na aba anterior.'
                })
            ])),

            el('h3.ind-sub', {
                texto: '1. Sem horário marcado (' + estado.aguardando.length + ')'
            }),
            estado.aguardando.length
                ? el('div.triagem-lista', {}, estado.aguardando.map(cartaoAguardando))
                : el('div.vazio', { texto: 'Ninguém liberado esperando para marcar.' }),

            el('h3.ind-sub', {
                texto: '2. Horário marcado — revise e confirme (' + estado.marcados.length +
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
        recarregar: carregar,
        abrirLinha: abrirLinha
    };
})(window);
