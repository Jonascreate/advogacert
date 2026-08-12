/* ==========================================================
   admin/fila-verificacao.js — a fila que decide quem é advogado
   ==========================================================
   É o bloco de prioridade máxima do painel: enquanto a inscrição não for
   conferida, o atendimento gratuito fica bloqueado. Cada item traz tudo
   pronto para a conferência no CNA em segundos — inscrição para copiar,
   nome declarado para bater, e o link já aberto na aba do lado.

   O sistema não decide nada sozinho: a OAB não publica API e o CNA tem
   CAPTCHA. Quem confere é você; o painel só prepara e registra.
   ========================================================== */
(function (global) {
    'use strict';

    var D = global.AdminDom;
    var el = D.el;

    var CNA = 'https://cna.oab.org.br/';
    var ESPERA_CRITICA = 24;     // horas: acima disto, destaque vermelho

    var estado = { filtro: 'pendente', itens: [], pendentes: 0 };
    var alvo, aoMudarContagem;

    function cabecalho() {
        return el('div.bloco-topo', {}, [
            el('div', {}, [
                el('h2', { texto: 'Aguardando verificação de OAB' }),
                el('p.bloco-nota', {
                    texto: 'Tempo real. O atendimento gratuito fica bloqueado até a decisão.'
                })
            ])
        ]);
    }

    /** Um item da fila: tudo o que a decisão exige, numa tela só. */
    function cartao(item) {
        // O prazo é o do plano da pessoa (30 min no Premium, 2 h no grátis),
        // e vem calculado do servidor. Antes o vermelho só acendia com 24 h
        // para todo mundo — quando acendia, a promessa do site já tinha
        // quebrado havia muito.
        var pendente = item.status === 'pendente';
        var restante = item.restante_minutos;
        var estourado = pendente && restante != null && restante < 0;
        // aviso amarelo no último terço do prazo, antes de virar problema
        var apertado = pendente && !estourado && restante != null &&
                       restante <= (item.prazo_minutos || 0) / 3;
        var critico = estourado ||
                      (pendente && restante == null && item.espera_horas >= ESPERA_CRITICA);

        var botaoCopiar = el('button.mini', { type: 'button', texto: 'copiar' });
        botaoCopiar.addEventListener('click', function () {
            D.copiar(item.inscricao, botaoCopiar);
        });

        var linhaTopo = el('div.verif-topo', {}, [
            el('div', {}, [
                el('span.verif-inscricao', { texto: item.inscricao }),
                botaoCopiar
            ]),
            el('div.verif-prazo', {}, [
                // O selo do plano fica ao lado do relógio de propósito: é ele
                // que explica por que um tem 30 minutos e o outro tem 2 horas.
                item.tipo ? D.tag(
                    item.tipo === 'plus' ? 'Plus' : item.tipo === 'premium' ? 'Premium' : 'Grátis',
                    item.tipo === 'plus' ? 'plus' : item.tipo === 'premium' ? 'ativa' : 'livre'
                ) : null,
                el('span.verif-espera' +
                   (critico ? '.critico' : apertado ? '.apertado' : ''), {
                    texto: pendente && restante != null
                        ? D.fmtPrazo(restante)
                        : 'esperou ' + D.fmtEspera(item.espera_horas),
                    title: pendente && item.prazo_minutos
                        ? 'Prazo prometido no site: ' +
                          (item.prazo_minutos >= 60
                              ? (item.prazo_minutos / 60) + ' h'
                              : item.prazo_minutos + ' min') +
                          ' — esperando há ' + D.fmtPrazo(-item.espera_minutos).replace('atrasado ', '')
                        : ''
                })
            ])
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
        }

        return el('article.verif-card' + (critico ? '.critico' : ''), {}, filhos);
    }

    /**
     * Confirmação antes de decidir. "Confere" dispara e-mail ao advogado, e
     * a pergunta do confirm() é a última chance de parar — a contagem
     * regressiva que existia aqui só atrasava o que já estava decidido.
     */
    function confirmarDecisao(item, decisao, rotulo, observacao) {
        if (!confirm('Marcar a inscrição ' + item.inscricao + ' como "' + rotulo + '"?')) return;
        return global.AdminApi.decidirVerificacao(item.id, decisao, observacao)
            .then(carregar);
    }

    function carregar() {
        return global.AdminApi.verificacoes({ status: estado.filtro, por_pagina: 50 })
            .then(function (d) {
                if (!d || !d.success) return;
                estado.itens = d.itens || [];
                estado.pendentes = d.pendentes || 0;
                if (aoMudarContagem) aoMudarContagem(estado.pendentes);
                desenhar();
            })
            .catch(function () {});
    }

    function desenhar() {
        var corpo = estado.itens.length
            ? estado.itens.map(cartao)
            : [el('div.vazio', { texto: 'Nenhuma inscrição aguardando conferência.' })];

        D.trocar(alvo, [cabecalho(), el('div.verif-lista', {}, corpo)]);
    }

    global.AdminFilaVerificacao = {
        montar: function (no, aoContar) {
            alvo = no;
            aoMudarContagem = aoContar;
            desenhar();
            return carregar();
        },
        recarregar: carregar
    };
})(window);
