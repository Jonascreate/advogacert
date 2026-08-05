/* ==========================================================
   admin/fila-verificacao.js — a fila que decide quem é advogado
   ==========================================================
   É o bloco de prioridade máxima do painel: enquanto a inscrição não for
   conferida, o atendimento gratuito fica bloqueado. Cada item traz tudo
   pronto para a conferência no CNA em segundos — inscrição para copiar,
   nome declarado para bater, e o link já aberto na aba do lado.

   O sistema não decide nada sozinho: a OAB não publica API e o CNA tem
   CAPTCHA. Quem confere é você; o painel só prepara e registra.

   Quem já foi conferido mas ainda não marcou horário nenhum também vive
   aqui, e não na Triagem. Não é uma etapa de remarcação — é continuação do
   mesmo status "confere": a bola está com o cliente, e a única ação sua
   possível é lembrar ou, se demorar demais, marcar por ele. A Triagem
   começa quando existe um horário para conferir ou trocar.
   ========================================================== */
(function (global) {
    'use strict';

    var D = global.AdminDom;
    var el = D.el;
    var API = global.AdminApi;

    var CNA = 'https://cna.oab.org.br/';
    var ESPERA_CRITICA = 24;    // horas: acima disto, destaque vermelho
    var COBRANCA_HORAS = 48;    // liberado e sem marcar: hora de lembrar

    var estado = { filtro: 'pendente', itens: [], pendentes: 0 };
    var alvo;

    function whatsapp(numero, texto) {
        var so = String(numero || '').replace(/\D/g, '');
        if (!so) return null;
        if (so.length <= 11) so = '55' + so;
        return 'https://wa.me/' + so + '?text=' + encodeURIComponent(texto);
    }

    function cabecalho() {
        var seletor = el('select.filtro-status', {
            aoMudar: function (e) { estado.filtro = e.target.value; carregar(); }
        }, [
            el('option', { value: 'pendente', texto: 'Aguardando decisão' }),
            el('option', { value: 'confere', texto: 'Conferidas' }),
            el('option', { value: 'nao_confere', texto: 'Não conferem' }),
            el('option', { value: 'nao_encontrado', texto: 'Não encontradas' }),
            el('option', { value: 'todos', texto: 'Todas' })
        ]);
        seletor.value = estado.filtro;

        return el('div.bloco-topo', {}, [
            el('div', {}, [
                el('h2', { texto: 'Aguardando verificação de OAB' }),
                el('p.bloco-nota', {
                    texto: 'Tempo real. O atendimento gratuito fica bloqueado até a decisão.'
                })
            ]),
            seletor
        ]);
    }

    /** Um item da fila: tudo o que a decisão exige, numa tela só. */
    function cartao(item) {
        var critico = item.espera_horas >= ESPERA_CRITICA && item.status === 'pendente';

        var botaoCopiar = el('button.mini', { type: 'button', texto: 'copiar' });
        botaoCopiar.addEventListener('click', function () {
            D.copiar(item.inscricao, botaoCopiar);
        });

        var linhaTopo = el('div.verif-topo', {}, [
            el('div', {}, [
                el('span.verif-inscricao', { texto: item.inscricao }),
                botaoCopiar
            ]),
            el('span.verif-espera' + (critico ? '.critico' : ''), {
                texto: 'esperando há ' + D.fmtEspera(item.espera_horas)
            })
        ]);

        var dados = el('dl.verif-dados', {}, [
            el('dt', { texto: 'Nome declarado' }), el('dd', { texto: item.nome_declarado || '—' }),
            el('dt', { texto: 'WhatsApp' }),      el('dd', { texto: item.contato || '—' }),
            el('dt', { texto: 'E-mail' }),        el('dd', { texto: item.email || '—' }),
            el('dt', { texto: 'Pedido em' }),     el('dd', { texto: D.fmtData(item.criado_em) })
        ]);

        var filhos = [linhaTopo, dados];

        // Sinais de fraude: não bloqueiam nada, apontam onde olhar melhor.
        if (item.sinais && item.sinais.length) {
            filhos.push(el('div.verif-sinais', {}, item.sinais.map(function (s) {
                return D.tag(s.texto, 'atrasada');
            })));
        }

        if (item.status === 'pendente') {
            var obs = el('input.verif-obs', {
                type: 'text',
                placeholder: 'Observação (opcional) — fica no histórico',
                maxlength: '500'
            });

            var decidir = function (decisao, rotulo) {
                return el('button.acao' + (decisao === 'confere' ? '.acao-ok' : '.acao-nao'), {
                    type: 'button',
                    texto: rotulo,
                    aoClicar: function () { confirmarDecisao(item, decisao, rotulo, obs.value); }
                });
            };

            filhos.push(el('div.verif-acoes', {}, [
                el('a.acao', {
                    href: CNA, target: '_blank', rel: 'noopener noreferrer',
                    texto: 'Consultar no CNA'
                }),
                decidir('confere', 'Confere'),
                decidir('nao_confere', 'Não confere'),
                decidir('nao_encontrado', 'Não encontrado')
            ]));
            filhos.push(obs);
        } else {
            var mapa = {
                confere: ['Confere', 'ativa'],
                nao_confere: ['Não confere', 'usado'],
                nao_encontrado: ['Não encontrado', 'sem']
            }[item.status] || ['—', 'sem'];

            filhos.push(el('div.verif-decidido', {}, [
                D.tag(mapa[0], mapa[1]),
                el('span.verif-quando', {
                    texto: 'por ' + (item.decidido_por || '—') + ' em ' + D.fmtData(item.decidido_em)
                }),
                item.observacao ? el('p.verif-obs-lida', { texto: item.observacao }) : null
            ]));

            if (item.aguardando_hora) filhos.push(blocoSemHora(item));
        }

        return el('article.verif-card' + (critico ? '.critico' : ''), {}, filhos);
    }

    /**
     * Conferido, mas sem horário ainda: a bola está com o cliente — ele
     * escolhe no site. A única ação sua aqui é lembrar, ou, se a espera
     * ficou longa demais, marcar por ele.
     */
    function blocoSemHora(item) {
        var frio = item.horas_desde_liberacao >= COBRANCA_HORAS;
        var link = whatsapp(item.contato,
            'Olá, ' + item.nome_declarado + '! Seu atendimento gratuito da AdvogaCert está ' +
            'liberado. É só escolher o horário em https://www.agentej.us/index.html#planos');

        return el('div.verif-semhora' + (frio ? '.critico' : ''), {}, [
            el('div.verif-semhora-topo', {}, [
                el('span', { texto: 'Ainda não marcou horário' }),
                el('span' + (frio ? '.critico' : '.fraco'), {
                    texto: 'liberado há ' + D.fmtEspera(item.horas_desde_liberacao)
                })
            ]),
            el('div.verif-acoes', {}, [
                el('button.acao.acao-ok', {
                    type: 'button',
                    texto: 'Marcar horário',
                    aoClicar: function (e) { abrirAgenda(item, e.target); }
                }),
                link ? el('a.acao', {
                    href: link, target: '_blank', rel: 'noopener noreferrer',
                    texto: 'Lembrar pelo WhatsApp'
                }) : null,
                global.AdminTriagem ? el('button.acao', {
                    type: 'button',
                    texto: 'Linha do tempo',
                    aoClicar: function (e) { global.AdminTriagem.abrirLinha(item.inscricao, e.target); }
                }) : null
            ])
        ]);
    }

    /**
     * Marcar pela primeira vez, pelo painel — para quando o cliente demorou
     * e você prefere resolver por ele. A lista vem da mesma rota que a tela
     * pública usa: uma fonte só sobre o que está livre.
     */
    function abrirAgenda(item, botao) {
        var caixa = botao.parentNode.querySelector('.agenda-inline');
        if (caixa) { caixa.parentNode.removeChild(caixa); return; }

        caixa = el('div.agenda-inline', {}, el('div.fraco', { texto: 'Carregando horários...' }));
        botao.parentNode.appendChild(caixa);

        API.horariosLivres().then(function (d) {
            var dias = (d && d.dias) || [];
            if (!dias.length) {
                D.trocar(caixa, el('div.fraco', { texto: 'Sem horário livre nos próximos dias.' }));
                return;
            }

            var diaAtual = dias[0];

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
                            aoClicar: function () { escolher(h); }
                        });
                    }))
                ]);
            }

            function escolher(h) {
                var rotulo = diaAtual.rotulo + ' às ' + h.rotulo;
                caixa.parentNode.removeChild(caixa);

                global.AdminDesfazer.agendar({
                    texto: item.inscricao + ' → ' + rotulo,
                    aoConfirmar: function () {
                        // item.id É o verificacao_id: esta lista é de
                        // verificações, não de agendamentos.
                        return API.agendar(item.id, h.inicio).then(function (r) {
                            if (!r || !r.success) alert((r && r.error) || 'Não foi possível marcar.');
                            carregar();
                            if (global.AdminAgenda) global.AdminAgenda.recarregar();
                        });
                    }
                });
            }

            pintar();
        }).catch(function () {
            D.trocar(caixa, el('div.fraco', { texto: 'Não foi possível carregar a agenda.' }));
        });
    }

    /**
     * Confirmação antes de decidir, e 10 segundos para desfazer depois.
     * "Confere" dispara e-mail ao advogado — e-mail não se despacha de volta,
     * então a janela de desfazer segura o envio até o prazo passar.
     */
    function confirmarDecisao(item, decisao, rotulo, observacao) {
        if (!confirm('Marcar a inscrição ' + item.inscricao + ' como "' + rotulo + '"?')) return;
        global.AdminDesfazer.agendar({
            texto: item.inscricao + ' → ' + rotulo,
            aoConfirmar: function () {
                return global.AdminApi.decidirVerificacao(item.id, decisao, observacao)
                    .then(carregar);
            }
        });
    }

    function carregar() {
        return global.AdminApi.verificacoes({ status: estado.filtro, por_pagina: 50 })
            .then(function (d) {
                if (!d || !d.success) return;
                estado.itens = d.itens || [];
                estado.pendentes = d.pendentes || 0;
                // O selo da aba não sai daqui: quem conta é o servidor, num
                // pedido só para todas as abas. Esta lista pode estar
                // filtrada por "recusados" e o número continuaria certo.
                if (global.AdminContadores) global.AdminContadores.atualizar();
                desenhar();
            })
            .catch(function () {});
    }

    function desenhar() {
        var corpo = estado.itens.length
            ? estado.itens.map(cartao)
            : [el('div.vazio', { texto: estado.filtro === 'pendente'
                ? 'Nenhuma inscrição aguardando conferência.'
                : 'Nada nesta lista.' })];

        D.trocar(alvo, [cabecalho(), el('div.verif-lista', {}, corpo)]);
    }

    global.AdminFilaVerificacao = {
        montar: function (no) {
            alvo = no;
            desenhar();
            return carregar();
        },
        recarregar: carregar
    };
})(window);
