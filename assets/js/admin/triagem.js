/* ==========================================================
   admin/triagem.js — a central de horários
   ==========================================================
   Quem escolhe a hora é o CLIENTE, no site. Esta aba não existe para eu
   marcar por ele: existe para eu CONFERIR o que ele marcou e, quando a vida
   atrapalha, REMARCAR e avisar.

   Por isso só entra aqui quem JÁ TEM hora marcada. Quem foi liberado na
   verificação e ainda não escolheu horário nenhum não é caso de remarcação
   — é continuação do mesmo status de "conferido", e por isso mora na aba
   Verificação de OAB, junto com o resto da decisão sobre aquela inscrição.

   Daí o desenho das ações. Não há "Editar" abrindo formulário vazio para eu
   procurar um horário — quem procura é o servidor, e o botão já nasce com a
   resposta no rótulo: "Remarcar para qui 06/08 15h". Um clique só.

   Três regras que valem para tudo aqui:

     1. Botão que criaria conflito nasce desabilitado, dizendo por quê. Vale
        mais impedir o erro do que explicá-lo depois.
     2. Nada sai para o cliente sem eu ler antes. O aviso aparece montado e
        editável; enviar é uma segunda decisão, não uma consequência.
     3. Toda ação tem 10 segundos de desfazer. Nesse tempo nada foi enviado
        nem gravado — desfazer não conserta, impede.
   ========================================================== */
(function (global) {
    'use strict';

    var D = global.AdminDom;
    var el = D.el;
    var API = global.AdminApi;

    var estado = { marcados: [], alertas: [], conflitos: 0, atrasados: 0 };
    var alvo, caixaAlertas, caixaMarcados, noAgenda, noConfig;

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

    // ==========================================================
    // PRÉVIA DO AVISO — nada sai daqui sem passar por esta tela
    // ==========================================================
    /**
     * abrirPrevia({ titulo, texto, item, canal, aoEnviar })
     *
     * aoEnviar(texto, avisar) roda depois da janela de desfazer. `avisar`
     * false é o caso de quem já combinou por telefone e só está registrando:
     * remarca e não manda nada.
     */
    function abrirPrevia(opcoes) {
        var anterior = document.querySelector('.previa-fundo');
        if (anterior) anterior.parentNode.removeChild(anterior);

        var campo = el('textarea.previa-texto', {
            rows: 7,
            'aria-label': 'Texto do aviso ao cliente'
        });
        campo.value = opcoes.texto;

        var fundo = el('div.previa-fundo', { role: 'dialog', 'aria-modal': 'true' });

        function fechar() {
            document.removeEventListener('keydown', aoTeclar);
            if (fundo.parentNode) fundo.parentNode.removeChild(fundo);
        }
        function aoTeclar(e) { if (e.key === 'Escape') fechar(); }

        function disparar(avisar) {
            var texto = campo.value;
            fechar();
            global.AdminDesfazer.agendar({
                texto: opcoes.resumo,
                aoConfirmar: function () { return opcoes.aoEnviar(texto, avisar); }
            });
        }

        var caixa = el('div.previa', {}, [
            el('h3', { texto: opcoes.titulo }),
            el('p.bloco-nota', { texto: opcoes.nota }),
            campo,
            el('div.previa-acoes', {}, [
                el('button.acao.acao-ok', {
                    type: 'button',
                    texto: opcoes.rotuloEnviar || 'Aplicar e avisar o cliente',
                    aoClicar: function () { disparar(true); }
                }),
                el('button.acao', {
                    type: 'button',
                    texto: 'Aplicar sem avisar',
                    title: 'Para quando você já combinou por telefone',
                    aoClicar: function () { disparar(false); }
                }),
                el('button.acao.acao-nao', {
                    type: 'button', texto: 'Cancelar', aoClicar: fechar
                })
            ])
        ]);

        fundo.appendChild(caixa);
        fundo.addEventListener('click', function (e) { if (e.target === fundo) fechar(); });
        document.addEventListener('keydown', aoTeclar);
        document.body.appendChild(fundo);
        campo.focus();
    }

    /** O texto que o cliente recebe quando o horário muda. */
    function textoRemarcacao(item, rotulo) {
        return 'Olá, ' + (item.nome || '') + '.\n\n' +
               'Precisamos ajustar o horário do seu atendimento da AdvogaCert. ' +
               'O novo horário é ' + rotulo + '.\n\n' +
               'Se não puder, é só responder que a gente remarca.';
    }

    // ==========================================================
    // AÇÕES
    // ==========================================================
    /**
     * Toda mudança de horário passa por aqui: prévia, desfazer, gravação e
     * o tratamento do conflito de versão. Um caminho só — os cinco botões
     * mudam o destino, não o procedimento.
     */
    function remarcarPara(item, destino, opcoes) {
        opcoes = opcoes || {};
        abrirPrevia({
            titulo: opcoes.titulo || 'Remarcar ' + item.inscricao,
            nota: 'De ' + D.fmtData(item.inicio) + ' para ' + destino.rotulo +
                  '. Leia o aviso antes de mandar — ele vai como está aqui.',
            resumo: item.inscricao + ' → ' + destino.rotulo,
            texto: textoRemarcacao(item, destino.rotulo),
            aoEnviar: function (texto, avisar) {
                return API.remarcar(item.id, destino.inicio, {
                    atualizado_em: item.atualizado_em,
                    motivo: opcoes.motivo,
                    aviso: texto,
                    avisar: avisar
                }).then(function (r) {
                    if (!r || !r.success) {
                        // Conflito de versão não é erro de digitação: alguém
                        // mexeu no registro. Recarregar é parte da resposta.
                        alert((r && r.error) || 'Não foi possível remarcar.');
                        return carregar();
                    }
                    return carregar();
                });
            }
        });
    }

    function sugerirTres(item) {
        API.sugerirHorarios(item.id, { apenas_calcular: true }).then(function (r) {
            if (!r || !r.success) {
                alert((r && r.error) || 'Não há horário livre para sugerir.');
                return;
            }
            var lista = r.opcoes.map(function (o, i) { return (i + 1) + ') ' + o.rotulo; }).join('\n');
            abrirPrevia({
                titulo: 'Sugerir 3 horários a ' + item.inscricao,
                nota: 'Ele escolhe, em vez de você impor. O atendimento volta ' +
                      'para "esperando o cliente" até a resposta chegar.',
                resumo: item.inscricao + ' → 3 opções',
                rotuloEnviar: 'Enviar as 3 opções',
                texto: 'Olá, ' + (item.nome || '') + '.\n\n' +
                       'Precisamos remarcar seu atendimento da AdvogaCert. ' +
                       'Estes horários estão livres:\n\n' + lista + '\n\n' +
                       'Responda com o que preferir e a gente confirma.',
                aoEnviar: function (texto) {
                    return API.sugerirHorarios(item.id, {
                        atualizado_em: item.atualizado_em,
                        texto: texto
                    }).then(function (res) {
                        if (!res || !res.success) alert((res && res.error) || 'Não foi possível enviar.');
                        return carregar();
                    });
                }
            });
        });
    }

    /**
     * Confirmar é o que fecha a triagem: o atendimento sai daqui e entra na
     * fila de chamados, com o prazo correndo. Pendência de assinatura se
     * confere no painel de controle (botão "Cadastros e agenda" no topo).
     */
    function confirmar(item) {
        global.AdminDesfazer.agendar({
            texto: item.inscricao + ' → chamado',
            aoConfirmar: function () {
                return API.confirmar(item.id, false, item.atualizado_em).then(function (r) {
                    if (r && !r.success) alert(r.error || 'Não foi possível confirmar.');
                    carregar();
                    if (global.AdminFilaChamados) global.AdminFilaChamados.recarregar();
                });
            }
        });
    }

    // ==========================================================
    // CARTÕES
    // ==========================================================
    /** Um botão de remarcar, já sabendo se cabe. */
    function botaoDestino(item, destino, rotulo, opcoes) {
        if (!destino || (destino.ok === false && !destino.inicio)) {
            return el('button.acao', {
                type: 'button', texto: rotulo, disabled: true,
                title: (destino && destino.motivo) || 'Sem horário livre'
            });
        }
        return el('button.acao' + (opcoes && opcoes.principal ? '.acao-ok' : ''), {
            type: 'button',
            texto: rotulo,
            disabled: destino.ok ? null : true,
            title: destino.ok ? 'Vai para ' + destino.rotulo : destino.motivo,
            aoClicar: function () { remarcarPara(item, destino, opcoes); }
        });
    }

    /**
     * Hora marcada, esperando sua conferência.
     *
     * Os rótulos dos botões vêm do servidor com a data dentro, e o que não
     * cabe já chega desabilitado com o motivo. É o cartão inteiro que
     * responde "o que dá para fazer com isto agora".
     */
    function cartaoMarcado(item) {
        var acoes = item.acoes || {};
        var atrasado = item.passou;
        var apertado = !atrasado && item.horas_ate < 2 && !item.confirmado_pelo_cliente;

        var link = whatsapp(item.contato,
            'Olá, ' + item.nome + '! Confirmando seu atendimento da AdvogaCert em ' +
            D.fmtData(item.inicio) + '.');

        var proximo = acoes.proximo_livre || {};

        return el('article.triagem-card.marcado' +
                  (atrasado ? '.critico' : apertado ? '.frio' : ''), {
            id: 'triagem-item-' + item.id
        }, [
            el('div.triagem-topo', {}, [
                el('div', {}, [
                    el('span.triagem-quando' + (atrasado ? '.critico' : ''), {
                        texto: D.fmtData(item.inicio)
                    }),
                    el('span.triagem-falta', {
                        texto: global.AdminAgenda
                            ? global.AdminAgenda.quantoFalta(item.inicio) : ''
                    }),
                    el('div.triagem-inscricao', { texto: item.inscricao }),
                    el('div.fraco', { texto: item.nome || '—' }),
                    item.remarcado_de
                        ? el('div.fraco', { texto: 'remarcado de ' + D.fmtData(item.remarcado_de) })
                        : null
                ]),
                el('div.triagem-lado', {}, [
                    selo(item.tipo),
                    item.confirmado_pelo_cliente
                        ? D.tag('Confirmado pelo cliente', 'ativa')
                        : D.tag('Sem confirmação', 'atrasada'),
                    atrasado ? D.tag('Passou da hora', 'atrasada') : null
                ])
            ]),

            el('div.triagem-acoes', {}, [
                // A ação principal fecha a triagem; as de horário vêm depois,
                // na ordem em que se pensa nelas.
                el('button.acao.acao-promover', {
                    type: 'button',
                    texto: 'Confirmar e liberar chamado',
                    aoClicar: function () { confirmar(item); }
                }),
                botaoDestino(item, proximo,
                    proximo.ok ? 'Remarcar para ' + proximo.rotulo : 'Sem horário livre',
                    { principal: true, motivo: 'próximo livre' }),
                el('button.acao', {
                    type: 'button',
                    texto: 'Sugerir 3 horários',
                    title: 'Manda três opções e deixa o cliente escolher',
                    aoClicar: function () { sugerirTres(item); }
                }),
                botaoDestino(item, acoes.empurrar_1h, 'Empurrar 1 hora', { motivo: 'empurrado 1h' }),
                botaoDestino(item, acoes.empurrar_1d, 'Empurrar 1 dia', { motivo: 'empurrado 1 dia' }),
                el('button.acao', {
                    type: 'button',
                    texto: 'Outro horário',
                    aoClicar: function (e) { abrirAgenda(item, e.target); }
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
            ]),

            proximo.ok && proximo.turno_preferido === false && item.preferencia_turno
                ? el('div.fraco', {
                    texto: 'Sem vaga no turno da ' + item.preferencia_turno +
                           ', que é o que ele prefere — o horário acima é de outro turno.'
                })
                : null
        ]);
    }

    // ==========================================================
    // ALERTAS — só o que exige ação
    // ==========================================================
    function blocoAlertas() {
        if (!estado.alertas.length) return null;

        return el('div.triagem-alertas', { role: 'region', 'aria-label': 'Alertas da agenda' },
            estado.alertas.map(function (a) {
                return el('button.triagem-alerta.' + a.tipo, {
                    type: 'button',
                    texto: a.texto,
                    'aria-label': a.texto + ' — ir para o atendimento',
                    aoClicar: function () {
                        var no = document.getElementById('triagem-item-' + a.agendamento_id);
                        if (!no) return;
                        no.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        no.classList.add('destacado');
                        setTimeout(function () { no.classList.remove('destacado'); }, 2000);
                    }
                });
            }));
    }

    // ==========================================================
    // ESCOLHA MANUAL DE HORÁRIO (para remarcar; marcar pela 1ª vez é
    // decisão do cliente, ou fica na aba Verificação de OAB enquanto ele
    // não decide)
    // ==========================================================
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
                remarcarPara(item, { inicio: h.inicio, rotulo: rotulo, ok: true },
                             { motivo: 'escolhido no painel' });
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

        API.linhaTempo(inscricao).then(function (d) {
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

    // ==========================================================
    // DESENHO
    // ==========================================================
    /**
     * A moldura é montada UMA vez. Só as listas são redesenhadas a cada
     * carga — se a aba inteira fosse refeita, a grade da semana perderia a
     * semana em que você estava e o painel lateral fecharia sozinho a cada
     * 30 segundos do polling.
     */
    function montarMoldura() {
        caixaAlertas = el('div');
        caixaMarcados = el('div');
        noAgenda = el('div');
        noConfig = el('div.triagem-config');

        D.trocar(alvo, [
            el('div.bloco-topo', {}, el('div', {}, [
                el('h2', { texto: 'Triagem' }),
                el('p.bloco-nota', {
                    texto: 'Remarcação de quem já tem hora marcada. Quem ainda não ' +
                           'escolheu horário está na aba Verificação de OAB.'
                })
            ])),
            caixaAlertas,
            noAgenda,
            caixaMarcados,
            noConfig
        ]);

        global.AdminAgenda.montar(noAgenda, {
            // arrastar o cartão para outro bloco cai aqui, no mesmo caminho
            // do botão: prévia do aviso, desfazer, gravação
            aoSoltar: function (carga, slot) {
                var item = estado.marcados.filter(function (m) {
                    return m.id === carga.agendamento_id;
                })[0];
                if (!item) { carregar(); return; }
                remarcarPara(item, {
                    inicio: slot.inicio,
                    rotulo: D.fmtData(slot.inicio),
                    ok: true
                }, { motivo: 'arrastado na grade' });
            },
            aoMudarAgenda: function () { carregar(); }
        });
        global.AdminAgenda.montarConfig(noConfig);
    }

    function desenhar() {
        if (!alvo || !caixaMarcados) return;

        D.trocar(caixaAlertas, blocoAlertas());

        D.trocar(caixaMarcados, [
            el('h3.ind-sub', {
                texto: 'Horário marcado — confira e confirme (' + estado.marcados.length +
                       (estado.atrasados ? ' · ' + estado.atrasados + ' passaram da hora' : '') + ')'
            }),
            estado.marcados.length
                ? el('div.triagem-lista', {}, estado.marcados.map(cartaoMarcado))
                : el('div.vazio', { texto: 'Nada esperando confirmação.' })
        ]);
    }

    function carregar() {
        return API.triagem().then(function (d) {
            if (!d || !d.success) return;
            estado.marcados = d.marcados || [];
            estado.alertas = d.alertas || [];
            estado.conflitos = d.conflitos || 0;
            estado.atrasados = d.atrasados || 0;
            desenhar();
            if (global.AdminAgenda) global.AdminAgenda.recarregar(true);
            // o selo da aba é recalculado no servidor, não somado aqui
            if (global.AdminContadores) global.AdminContadores.atualizar();
        }).catch(function () {});
    }

    global.AdminTriagem = {
        montar: function (no) { alvo = no; montarMoldura(); return carregar(); },
        recarregar: carregar,
        abrirLinha: abrirLinha
    };
})(window);
