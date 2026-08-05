/* ==========================================================
   admin/agenda.js — a grade da semana e a configuração dela
   ==========================================================
   Uma lista de agendamentos responde "quem vem". Ela não responde a
   pergunta que se faz o dia inteiro: "onde ainda cabe alguém". Para isso
   é preciso ver os buracos, e buraco não aparece em lista — aparece em
   grade, onde o vazio ocupa espaço.

   Este módulo desenha e nada mais. Quem decide o que está livre, cheio ou
   bloqueado é o servidor: cada bloco chega já classificado em
   /admin/agenda/ocupacao. Se o navegador também calculasse, as duas contas
   discordariam algum dia — e a errada seria sempre a que está na sua frente.

   Cheio e bloqueado são pintados diferente de propósito. Cheio é
   consequência (alguém marcou); bloqueado é decisão sua.
   ========================================================== */
(function (global) {
    'use strict';

    var D = global.AdminDom;
    var el = D.el;
    var API = global.AdminApi;

    // Abaixo disto a grade semanal não cabe: sete colunas em 360px não se
    // leem. Vira uma lista por dia, com a mesma informação.
    var ESTREITO = window.matchMedia('(max-width: 768px)');

    var estado = {
        de: null,             // 'YYYY-MM-DD', segunda-feira da semana em vista
        dias: [],
        visao: 'semana',      // semana | lista
        selecionado: null,    // slot aberto no painel lateral
        arrastando: null,     // { agendamento_id, nome }
        carregando: false,
        erro: null
    };

    var alvo, ganchos = {};

    // ---------------- datas ----------------
    // Tudo aqui é 'YYYY-MM-DD' puro, sem Date do navegador no meio: o
    // servidor já mandou o dia calculado no fuso de Fortaleza, e converter
    // de novo aqui é como o horário some ou anda um dia.
    function somarDias(dia, n) {
        var d = new Date(dia + 'T12:00:00Z');
        d.setUTCDate(d.getUTCDate() + n);
        return d.toISOString().slice(0, 10);
    }

    function hojeNaAgenda() {
        // meio-dia UTC evita a virada de dia por causa do fuso
        var agora = new Date();
        return new Date(agora.getTime() - 3 * 3600000).toISOString().slice(0, 10);
    }

    /** A segunda-feira da semana em que o dia cai. */
    function segundaDe(dia) {
        var d = new Date(dia + 'T12:00:00Z');
        var passos = (d.getUTCDay() + 6) % 7;      // domingo = 6 passos atrás
        return somarDias(dia, -passos);
    }

    /** "em 2h", "amanhã 14h", "há 3 d" — quanto falta, em palavra de gente. */
    function quantoFalta(iso) {
        var falta = new Date(iso).getTime() - Date.now();
        var horas = falta / 3600000;
        if (horas < 0) return 'há ' + D.fmtEspera(Math.floor(-horas));
        if (horas < 1) return 'em ' + Math.max(1, Math.round(falta / 60000)) + ' min';
        if (horas < 24) return 'em ' + Math.round(horas) + 'h';
        if (horas < 48) return 'amanhã';
        return 'em ' + Math.floor(horas / 24) + ' dias';
    }

    function horaDe(iso) {
        return new Date(iso).toLocaleTimeString('pt-BR', {
            hour: '2-digit', minute: '2-digit', timeZone: 'America/Fortaleza'
        });
    }

    /**
     * Como este bloco deve ser pintado.
     * A ordem importa: bloqueado ganha de cheio, e passado ganha de tudo —
     * não adianta saber que ainda cabe alguém num horário que já foi.
     */
    function classeDoSlot(s) {
        if (s.passou) return 'passou';
        if (s.bloqueado) return 'bloqueado';
        if (s.ocupados > s.capacidade) return 'conflito';
        if (s.ocupados >= s.capacidade) return 'cheio';
        if (s.ocupados > 0) return 'parcial';
        return 'livre';
    }

    /** Cabe mais alguém aqui? É o servidor que disse; aqui só se lê. */
    function aceita(s) {
        return !s.passou && !s.bloqueado && s.ocupados < s.capacidade;
    }

    // ---------------- grade da semana ----------------
    /**
     * As linhas são a união dos horários de todos os dias da semana.
     * Se a segunda começa às 18h e o sábado às 14h, a grade precisa da
     * linha das 14h — senão o sábado apareceria cortado sem explicação.
     */
    function linhasDaSemana() {
        var vistos = {};
        var linhas = [];
        estado.dias.forEach(function (dia) {
            dia.slots.forEach(function (s) {
                if (vistos[s.rotulo]) return;
                vistos[s.rotulo] = true;
                linhas.push(s.rotulo);
            });
        });
        return linhas.sort();
    }

    function celula(dia, rotulo) {
        var slot = null;
        for (var i = 0; i < dia.slots.length; i++) {
            if (dia.slots[i].rotulo === rotulo) { slot = dia.slots[i]; break; }
        }

        // O dia não trabalha nessa hora: célula morta, sem interação. Ela
        // existe para a grade não desalinhar, e só.
        if (!slot) return el('div.grade-celula.fora', { 'aria-hidden': 'true' });

        var classe = classeDoSlot(slot);
        var podeSoltar = aceita(slot);
        var rotuloAcessivel = dia.semana + ' ' + dia.numero + ' às ' + slot.rotulo + ' — ' +
            (slot.bloqueado ? 'bloqueado: ' + slot.motivo_bloqueio
                : slot.passou ? 'já passou'
                : slot.ocupados + ' de ' + slot.capacidade + ' ocupado(s)');

        var no = el('button.grade-celula.' + classe, {
            type: 'button',
            title: rotuloAcessivel,
            'aria-label': rotuloAcessivel,
            'aria-pressed': estado.selecionado === slot.inicio ? 'true' : 'false',
            aoClicar: function () { abrirSlot(slot, dia); }
        }, [
            el('span.grade-hora', { texto: slot.rotulo }),
            slot.bloqueado
                ? el('span.grade-marca', { texto: 'bloqueado' })
                : slot.ocupados
                    ? el('span.grade-marca', { texto: slot.ocupados + '/' + slot.capacidade })
                    : null
        ]);

        if (estado.selecionado === slot.inicio) no.classList.add('aberta');

        // "alvo" e "invalido" são marcados agora, e não quando o arraste
        // começa. Redesenhar no dragstart arrancaria da tela justamente o
        // elemento que está sendo arrastado, e o navegador cancelaria o
        // arraste. O CSS só usa estas classes debaixo de .arrastando, então
        // fora do arraste elas não pintam nada.
        no.classList.add(podeSoltar ? 'alvo' : 'invalido');

        if (podeSoltar) {
            no.addEventListener('dragover', function (e) {
                e.preventDefault();
                no.classList.add('sobre');
            });
            no.addEventListener('dragleave', function () { no.classList.remove('sobre'); });
            no.addEventListener('drop', function (e) {
                e.preventDefault();
                no.classList.remove('sobre');
                var carga = estado.arrastando;
                estado.arrastando = null;
                marcarArraste(false);
                // Soltar não grava nada sozinho: abre a prévia do aviso, o
                // mesmo caminho do botão. Arrastar é um atalho para escolher
                // o destino, não uma forma de pular a conferência.
                if (carga && ganchos.aoSoltar) ganchos.aoSoltar(carga, slot);
            });
        }
        return no;
    }

    /** Liga e desliga o modo arraste sem redesenhar nada. */
    function marcarArraste(ligado) {
        if (!alvo) return;
        var area = alvo.querySelector('.grade-area');
        if (area) area.classList.toggle('arrastando', ligado);
    }

    function ficha(pessoa, slot) {
        var no = el('div.grade-ficha', {
            draggable: pessoa.virou_chamado ? null : 'true',
            title: pessoa.virou_chamado
                ? 'Já virou chamado — remarque pela fila de chamados'
                : 'Arraste para outro bloco para remarcar'
        }, [
            el('span.grade-ficha-oab', { texto: pessoa.inscricao }),
            el('span.fraco', { texto: pessoa.nome || '—' }),
            pessoa.confirmado_pelo_cliente
                ? D.tag('Confirmado', 'ativa')
                : D.tag('Sem confirmação', 'atrasada')
        ]);

        if (!pessoa.virou_chamado) {
            no.addEventListener('dragstart', function (e) {
                estado.arrastando = {
                    agendamento_id: pessoa.agendamento_id,
                    inscricao: pessoa.inscricao,
                    nome: pessoa.nome,
                    de: slot.inicio
                };
                e.dataTransfer.effectAllowed = 'move';
                // Firefox só inicia o arraste se algo for escrito aqui.
                e.dataTransfer.setData('text/plain', String(pessoa.agendamento_id));
                // Uma classe na área, e não um redesenho: o elemento
                // arrastado precisa continuar existindo até o fim.
                marcarArraste(true);
            });
            no.addEventListener('dragend', function () {
                estado.arrastando = null;
                marcarArraste(false);
            });
        }
        return no;
    }

    /**
     * O painel lateral: quem está naquele bloco e o que dá para fazer com ele.
     *
     * Arrastar não pode ser o único caminho — teclado, celular e mão trêmula
     * existem. Tudo o que o arraste faz, um botão daqui também faz.
     */
    function painelLateral() {
        if (!estado.selecionado) return null;

        var slot = null, diaDoSlot = null;
        estado.dias.forEach(function (dia) {
            dia.slots.forEach(function (s) {
                if (s.inicio === estado.selecionado) { slot = s; diaDoSlot = dia; }
            });
        });
        if (!slot) return null;

        var acoes = [];
        if (slot.bloqueado) {
            acoes.push(el('button.acao', {
                type: 'button',
                texto: 'Liberar este bloco',
                aoClicar: function () {
                    API.desbloquear(slot.bloqueio_id).then(function (r) {
                        if (r && r.success) recarregar(true);
                    });
                }
            }));
        } else if (!slot.passou) {
            acoes.push(el('button.acao', {
                type: 'button',
                texto: 'Bloquear este bloco',
                // Com gente dentro o servidor recusa e diz quem remarcar
                // antes. O botão nasce desabilitado para você não descobrir
                // isso pelo erro.
                disabled: slot.ocupados > 0 ? true : null,
                title: slot.ocupados > 0
                    ? 'Há alguém marcado aqui. Remarque antes de bloquear.'
                    : 'Marca o bloco como indisponível',
                aoClicar: function () {
                    var motivo = prompt('Motivo do bloqueio (aparece só para você):', 'Indisponível');
                    if (motivo === null) return;
                    API.bloquear(slot.inicio, slot.fim, motivo).then(function (r) {
                        if (r && r.success) recarregar(true);
                        else if (r && r.error) alert(r.error);
                    });
                }
            }));
        }

        return el('aside.grade-lado', {}, [
            el('div.grade-lado-topo', {}, [
                el('div', {}, [
                    el('strong', { texto: diaDoSlot.semana + ' ' + diaDoSlot.numero + '/' + diaDoSlot.mes }),
                    el('div.grade-lado-hora', { texto: slot.rotulo + ' — ' + horaDe(slot.fim) })
                ]),
                el('button.mini', {
                    type: 'button', texto: 'fechar',
                    'aria-label': 'Fechar detalhes do bloco',
                    aoClicar: function () { estado.selecionado = null; desenhar(); }
                })
            ]),

            slot.bloqueado
                ? el('div.grade-lado-nota.critico', { texto: 'Bloqueado: ' + slot.motivo_bloqueio })
                : el('div.grade-lado-nota', {
                    texto: slot.ocupados + ' de ' + slot.capacidade + ' ocupado(s)' +
                           (slot.passou ? ' · já passou' : '')
                }),

            slot.pessoas.length
                ? el('div.grade-fichas', {}, slot.pessoas.map(function (p) { return ficha(p, slot); }))
                : el('div.fraco', { texto: 'Ninguém marcado neste bloco.' }),

            acoes.length ? el('div.grade-lado-acoes', {}, acoes) : null
        ]);
    }

    function abrirSlot(slot, dia) {
        estado.selecionado = estado.selecionado === slot.inicio ? null : slot.inicio;
        desenhar();
    }

    function grade() {
        var linhas = linhasDaSemana();
        if (!linhas.length) {
            return el('div.vazio', {
                texto: 'Nenhum horário de trabalho nesta semana. Confira a configuração da agenda abaixo.'
            });
        }

        var colunas = estado.dias.length;
        var tabela = el('div.grade', {
            role: 'grid',
            estilo: { gridTemplateColumns: 'auto repeat(' + colunas + ', minmax(0, 1fr))' }
        });

        // cabeçalho
        tabela.appendChild(el('div.grade-canto', { 'aria-hidden': 'true' }));
        estado.dias.forEach(function (dia) {
            tabela.appendChild(el('div.grade-cabeca' + (dia.dia === hojeNaAgenda() ? '.hoje' : ''), {}, [
                el('span.grade-sem', { texto: dia.semana }),
                el('span.grade-num', { texto: dia.numero }),
                !dia.ativo ? el('span.fraco', { texto: 'folga' }) : null
            ]));
        });

        linhas.forEach(function (rotulo) {
            tabela.appendChild(el('div.grade-lateral', { texto: rotulo }));
            estado.dias.forEach(function (dia) {
                tabela.appendChild(celula(dia, rotulo));
            });
        });

        return tabela;
    }

    /** Em tela estreita a grade vira lista por dia — mesma informação. */
    function listaPorDia() {
        return el('div.agenda-dias-lista', {}, estado.dias.map(function (dia) {
            var uteis = dia.slots.filter(function (s) { return !s.passou; });
            return el('section.agenda-dia-bloco', {}, [
                el('h4.agenda-dia-titulo', {
                    texto: dia.semana + ' ' + dia.numero + '/' + dia.mes +
                           (dia.ativo ? '' : ' — folga')
                }),
                uteis.length
                    ? el('div.agenda-dia-slots', {}, uteis.map(function (s) {
                        return el('button.grade-celula.' + classeDoSlot(s), {
                            type: 'button',
                            'aria-label': s.rotulo + ', ' + s.ocupados + ' de ' + s.capacidade,
                            aoClicar: function () { abrirSlot(s, dia); }
                        }, [
                            el('span.grade-hora', { texto: s.rotulo }),
                            s.bloqueado
                                ? el('span.grade-marca', { texto: 'bloqueado' })
                                : s.ocupados
                                    ? el('span.grade-marca', { texto: s.ocupados + '/' + s.capacidade })
                                    : null
                        ]);
                    }))
                    : el('div.fraco', { texto: 'Nada pela frente neste dia.' })
            ]);
        }));
    }

    /** Visão lista: o que vem pela frente, em ordem, com quanto falta. */
    function proximos() {
        var itens = [];
        estado.dias.forEach(function (dia) {
            dia.slots.forEach(function (s) {
                if (s.passou || !s.pessoas.length) return;
                s.pessoas.forEach(function (p) {
                    itens.push({ slot: s, dia: dia, pessoa: p });
                });
            });
        });
        itens.sort(function (a, b) { return new Date(a.slot.inicio) - new Date(b.slot.inicio); });

        if (!itens.length) {
            return el('div.vazio', { texto: 'Nada marcado nos próximos dias.' });
        }

        return el('ol.agenda-proximos', {}, itens.map(function (it) {
            return el('li.agenda-proximo', {}, [
                el('div.agenda-proximo-quando', {}, [
                    el('strong', { texto: it.dia.semana + ' ' + it.dia.numero + ' · ' + it.slot.rotulo }),
                    el('span.agenda-falta', { texto: quantoFalta(it.slot.inicio) })
                ]),
                el('div.agenda-proximo-quem', {}, [
                    el('span.grade-ficha-oab', { texto: it.pessoa.inscricao }),
                    el('span.fraco', { texto: it.pessoa.nome || '—' })
                ]),
                it.pessoa.confirmado_pelo_cliente
                    ? D.tag('Confirmado', 'ativa')
                    : D.tag('Sem confirmação', 'atrasada')
            ]);
        }));
    }

    // ---------------- desenho ----------------
    function legenda() {
        var itens = [
            ['livre', 'livre'],
            ['parcial', 'com gente'],
            ['cheio', 'cheio'],
            ['bloqueado', 'bloqueado por você'],
            ['passou', 'já passou']
        ];
        return el('div.grade-legenda', {}, itens.map(function (par) {
            return el('span.grade-legenda-item', {}, [
                el('i.grade-amostra.' + par[0], { 'aria-hidden': 'true' }),
                el('span', { texto: par[1] })
            ]);
        }));
    }

    function barra() {
        var fim = estado.dias.length ? estado.dias[estado.dias.length - 1] : null;
        return el('div.grade-barra', {}, [
            el('div.grade-nav', {}, [
                el('button.acao', {
                    type: 'button', texto: '‹ Semana anterior',
                    aoClicar: function () { estado.de = somarDias(estado.de, -7); recarregar(); }
                }),
                el('button.acao', {
                    type: 'button', texto: 'Hoje',
                    aoClicar: function () { estado.de = segundaDe(hojeNaAgenda()); recarregar(); }
                }),
                el('button.acao', {
                    type: 'button', texto: 'Próxima semana ›',
                    aoClicar: function () { estado.de = somarDias(estado.de, 7); recarregar(); }
                }),
                el('span.fraco', {
                    texto: estado.dias.length
                        ? estado.dias[0].numero + '/' + estado.dias[0].mes + ' a ' + fim.numero + '/' + fim.mes
                        : ''
                })
            ]),
            el('div.grade-visao', { role: 'group', 'aria-label': 'Modo de visualização' }, [
                el('button.acao' + (estado.visao === 'semana' ? '.ativa' : ''), {
                    type: 'button', texto: 'Semana',
                    'aria-pressed': estado.visao === 'semana' ? 'true' : 'false',
                    aoClicar: function () { estado.visao = 'semana'; desenhar(); }
                }),
                el('button.acao' + (estado.visao === 'lista' ? '.ativa' : ''), {
                    type: 'button', texto: 'Lista',
                    'aria-pressed': estado.visao === 'lista' ? 'true' : 'false',
                    aoClicar: function () { estado.visao = 'lista'; desenhar(); }
                })
            ])
        ]);
    }

    function desenhar() {
        if (!alvo) return;

        var miolo;
        if (estado.erro) {
            miolo = el('div.vazio', { texto: estado.erro });
        } else if (estado.carregando && !estado.dias.length) {
            miolo = el('div.vazio', { texto: 'Carregando a agenda...' });
        } else if (estado.visao === 'lista') {
            miolo = proximos();
        } else {
            miolo = ESTREITO.matches ? listaPorDia() : grade();
        }

        D.trocar(alvo, [
            barra(),
            estado.visao === 'semana' ? legenda() : null,
            el('div.grade-area' + (estado.arrastando ? '.arrastando' : ''), {}, [
                miolo,
                painelLateral()
            ])
        ]);
    }

    function recarregar(manterSelecao) {
        if (!estado.de) estado.de = segundaDe(hojeNaAgenda());
        if (!manterSelecao) estado.selecionado = null;
        estado.carregando = true;
        estado.erro = null;

        return API.ocupacao(estado.de, somarDias(estado.de, 6))
            .then(function (d) {
                estado.carregando = false;
                if (!d || !d.success) {
                    estado.erro = (d && d.error) || 'Não foi possível carregar a agenda.';
                    desenhar();
                    return;
                }
                estado.dias = d.dias || [];
                desenhar();
            })
            .catch(function () {
                estado.carregando = false;
                estado.erro = 'Não consegui falar com o servidor.';
                desenhar();
            });
    }

    // ---------------- configuração da agenda ----------------
    // Fica aqui dentro, e não numa tela separada, porque é a resposta da
    // pergunta que a grade levanta: "por que não tem horário na terça?".
    var SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

    function montarConfig(no) {
        function pintar(cfg) {
            var campos = {};

            function numero(id, valor, min, max, sufixo) {
                var entrada = el('input.cfg-num', {
                    type: 'number', valor: valor, min: min, max: max, id: 'cfg-' + id
                });
                campos[id] = entrada;
                return el('label.cfg-campo', { for: 'cfg-' + id }, [
                    el('span.cfg-rotulo', { texto: sufixo }),
                    entrada
                ]);
            }

            var linhasDia = cfg.dias.map(function (d) {
                var ativo = el('input', { type: 'checkbox', checked: d.ativo ? true : null });
                var inicio = el('input.cfg-num', { type: 'number', valor: d.hora_inicio, min: 0, max: 23 });
                var fim = el('input.cfg-num', { type: 'number', valor: d.hora_fim, min: 1, max: 24 });
                var cap = el('input.cfg-num', { type: 'number', valor: d.capacidade, min: 1, max: 10 });
                campos['dia' + d.dia_semana] = {
                    dia_semana: d.dia_semana, ativo: ativo, inicio: inicio, fim: fim, cap: cap
                };

                return el('tr', {}, [
                    el('td', { 'data-rotulo': 'Dia' }, [
                        el('label.cfg-dia', {}, [ativo, el('span', { texto: SEMANA[d.dia_semana] })])
                    ]),
                    el('td', { 'data-rotulo': 'Começa' }, [inicio, el('span.fraco', { texto: 'h' })]),
                    el('td', { 'data-rotulo': 'Termina' }, [fim, el('span.fraco', { texto: 'h' })]),
                    el('td', { 'data-rotulo': 'Ao mesmo tempo' }, [cap])
                ]);
            });

            var aviso = el('div.agenda-aviso');

            var bloqueios = (cfg.bloqueios || []).length
                ? el('ul.cfg-bloqueios', {}, cfg.bloqueios.map(function (b) {
                    return el('li', {}, [
                        el('span', { texto: b.rotulo }),
                        el('span.fraco', { texto: b.motivo }),
                        el('button.mini', {
                            type: 'button', texto: 'liberar',
                            aoClicar: function () {
                                API.desbloquear(b.id).then(function (r) {
                                    if (r && r.success) { montarConfig(no); recarregar(); }
                                });
                            }
                        })
                    ]);
                }))
                : el('div.fraco', { texto: 'Nenhuma data bloqueada.' });

            var dataDe = el('input', { type: 'date' });
            var dataAte = el('input', { type: 'date' });
            var motivoBloqueio = el('input', { type: 'text', placeholder: 'Motivo (feriado, viagem...)' });

            D.trocar(no, [
                el('div.bloco-topo', {}, el('div', {}, [
                    el('h3', { texto: 'Minha agenda de trabalho' }),
                    el('p.bloco-nota', {
                        texto: 'É isto que o site oferece ao cliente. Fora daqui ele não consegue marcar.'
                    })
                ])),

                el('div.tabela-wrap.responsiva', {}, el('table', {}, [
                    el('thead', {}, el('tr', {}, [
                        el('th', { texto: 'Dia' }),
                        el('th', { texto: 'Começa' }),
                        el('th', { texto: 'Termina' }),
                        el('th', { texto: 'Ao mesmo tempo' })
                    ])),
                    el('tbody', {}, linhasDia)
                ])),

                el('div.cfg-gerais', {}, [
                    numero('duracao', cfg.duracao_min, 15, 480, 'Duração de cada atendimento (min)'),
                    numero('folga', cfg.folga_min, 0, 240, 'Folga entre um e outro (min)'),
                    numero('antecedencia', cfg.antecedencia_min, 0, 20160, 'Antecedência mínima para o cliente (min)'),
                    numero('janela', cfg.janela_dias, 1, 90, 'Agenda aberta por (dias)')
                ]),

                el('div.triagem-acoes', {}, [
                    el('button.acao.acao-ok', {
                        type: 'button',
                        texto: 'Salvar agenda',
                        aoClicar: function (e) {
                            var botao = e.target;
                            botao.disabled = true;
                            aviso.className = 'agenda-aviso';
                            aviso.textContent = 'Salvando...';

                            API.salvarAgendaConfig({
                                dias: cfg.dias.map(function (d) {
                                    var c = campos['dia' + d.dia_semana];
                                    return {
                                        dia_semana: c.dia_semana,
                                        ativo: c.ativo.checked,
                                        hora_inicio: Number(c.inicio.value),
                                        hora_fim: Number(c.fim.value),
                                        capacidade: Number(c.cap.value)
                                    };
                                }),
                                duracao_min: Number(campos.duracao.value),
                                folga_min: Number(campos.folga.value),
                                antecedencia_min: Number(campos.antecedencia.value),
                                janela_dias: Number(campos.janela.value)
                            }).then(function (r) {
                                botao.disabled = false;
                                if (!r || !r.success) {
                                    aviso.className = 'agenda-aviso erro';
                                    aviso.textContent = (r && r.error) || 'Não foi possível salvar.';
                                    return;
                                }
                                aviso.textContent = r.msg;
                                recarregar();      // a grade acima muda junto
                                if (ganchos.aoMudarAgenda) ganchos.aoMudarAgenda();
                            }).catch(function () {
                                botao.disabled = false;
                                aviso.className = 'agenda-aviso erro';
                                aviso.textContent = 'Erro de conexão.';
                            });
                        }
                    }),
                    aviso
                ]),

                el('h4.ind-sub', { texto: 'Datas bloqueadas' }),
                bloqueios,
                el('div.cfg-bloqueio-novo', {}, [
                    dataDe, el('span.fraco', { texto: 'até' }), dataAte, motivoBloqueio,
                    el('button.acao', {
                        type: 'button',
                        texto: 'Bloquear',
                        aoClicar: function () {
                            if (!dataDe.value || !dataAte.value) {
                                alert('Escolha a data de início e a de fim.');
                                return;
                            }
                            // O dia inteiro, no fuso daqui: das 00h do
                            // primeiro às 00h do dia seguinte ao último.
                            var de = new Date(dataDe.value + 'T00:00:00-03:00');
                            var ate = new Date(dataAte.value + 'T00:00:00-03:00');
                            ate.setDate(ate.getDate() + 1);
                            API.bloquear(de.toISOString(), ate.toISOString(), motivoBloqueio.value)
                                .then(function (r) {
                                    if (r && r.success) { montarConfig(no); recarregar(); return; }
                                    alert((r && r.error) || 'Não foi possível bloquear.');
                                });
                        }
                    })
                ])
            ]);
        }

        return API.agendaConfig().then(function (d) {
            if (!d || !d.success) {
                D.trocar(no, el('div.vazio', { texto: 'Não foi possível carregar a configuração.' }));
                return;
            }
            pintar(d);
        }).catch(function () {
            D.trocar(no, el('div.vazio', { texto: 'Não consegui falar com o servidor.' }));
        });
    }

    // Trocar de celular para tela larga (ou girar o aparelho) precisa
    // redesenhar: a grade e a lista por dia são desenhos diferentes.
    var aoTrocarLargura = function () { desenhar(); };
    if (ESTREITO.addEventListener) ESTREITO.addEventListener('change', aoTrocarLargura);
    else if (ESTREITO.addListener) ESTREITO.addListener(aoTrocarLargura);

    global.AdminAgenda = {
        montar: function (no, opcoes) {
            alvo = no;
            ganchos = opcoes || {};
            estado.de = segundaDe(hojeNaAgenda());
            desenhar();
            return recarregar();
        },
        recarregar: recarregar,
        montarConfig: montarConfig,
        // a triagem reusa estes dois: mesma conta de tempo nas duas telas
        quantoFalta: quantoFalta,
        horaDe: horaDe
    };
})(window);
