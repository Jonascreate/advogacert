document.addEventListener('DOMContentLoaded', () => {
    const pagina = document.getElementById('suporte-free-page');
    if (!pagina) return;

    function getUsuarioLogado() {
        try {
            return JSON.parse(sessionStorage.getItem('user'));
        } catch {
            return null;
        }
    }

    const UFS_BR = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
                    'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

    const q = s => pagina.querySelector(s);
    const formId = q('#free-form-id');
    const formAgenda = q('#free-form-agenda');
    const blocoEspera = q('#free-espera');
    const msg = q('#free-msg');
    const selUf = q('#free-uf');
    const gradeDias = q('#free-dias');
    const gradeHoras = q('#free-horas');

    selUf.innerHTML = '<option value="">UF</option>' +
        UFS_BR.map(u => `<option value="${u}">${u}</option>`).join('');

    let agenda = [];
    let verificacaoId = null;

    const aviso = (texto, cor) => {
        msg.style.color = cor || '#8a8a90';
        msg.textContent = texto;
    };

    function mostrarPasso(qual) {
        formId.style.display = qual === 'identificacao' ? 'block' : 'none';
        formAgenda.style.display = qual === 'agenda' ? 'block' : 'none';
        blocoEspera.style.display = qual === 'espera' ? 'block' : 'none';
    }

    function mostrarEspera(texto) {
        blocoEspera.textContent = '';
        const p = document.createElement('p');
        p.className = 'free-aviso';
        p.textContent = texto;
        blocoEspera.appendChild(p);
        mostrarPasso('espera');
        q('#free-sub').textContent = 'Pedido recebido';
    }

    // ---- passo 1: identificação ----
    formId.addEventListener('submit', function (e) {
        e.preventDefault();
        const nome = q('#free-nome').value.trim();
        const inscricao = q('#free-inscricao').value.replace(/\D/g, '');
        const uf = selUf.value;
        const whats = q('#free-whats').value.replace(/\D/g, '');
        const email = q('#free-email').value.trim();
        const botao = q('#free-enviar-id');

        if (nome.length < 2) { aviso('Diga como gosta de ser chamado.', '#ff6b5e'); return; }
        if (!inscricao || inscricao.length > 6) { aviso('Informe o número da inscrição (até 6 dígitos).', '#ff6b5e'); return; }
        if (!uf) { aviso('Escolha a seccional.', '#ff6b5e'); return; }
        if (whats.length < 10) { aviso('Informe o WhatsApp com DDD.', '#ff6b5e'); return; }
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { aviso('Informe um e-mail válido.', '#ff6b5e'); return; }

        botao.disabled = true;
        aviso('Conferindo...');

        fetch(apiUrl('/verificacao/solicitar'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome, inscricao, uf, contato: whats, email })
        })
        .then(r => r.json())
        .then(data => {
            botao.disabled = false;

            if (data.situacao === 'liberado') {
                verificacaoId = data.verificacao_id;
                aviso('');
                q('#free-sub').textContent = 'Tudo certo. Escolha o horário.';
                mostrarPasso('agenda');
                carregarAgenda();
                return;
            }

            if (data.situacao === 'pendente') {
                // Quem marca é o suporte, pelo painel — a pessoa não
                // escolhe hora aqui. O texto precisa dizer isso, senão
                // ela fica esperando uma tela de agenda que não vem.
                mostrarEspera(data.msg ||
                    'Recebemos seu pedido. Nossa equipe vai conferir sua inscrição ' +
                    'na OAB e entrar em contato com o dia e a hora do atendimento.');
                aviso('');
                return;
            }

            // ja_usou e recusado terminam aqui
            aviso(data.error || 'Não foi possível seguir.', '#ff6b5e');
        })
        .catch(() => {
            botao.disabled = false;
            aviso('Erro de conexão com o servidor.', '#ff6b5e');
        });
    });

    // ---- passo 2: agenda em grade, no estilo de reserva ----
    // Só aparece o que está de fato livre: a lista é calculada pelo
    // servidor, que é o único que enxerga o que já foi marcado. No
    // navegador, duas pessoas veriam a mesma vaga como disponível.
    let diaEscolhido = null;
    let horaEscolhida = null;

    function pintarDias() {
        gradeDias.textContent = '';
        agenda.forEach(d => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'free-dia' + (d.dia === diaEscolhido ? ' ativo' : '');
            b.innerHTML =
                '<span class="free-dia-sem"></span>' +
                '<span class="free-dia-num"></span>' +
                '<span class="free-dia-mes"></span>' +
                '<span class="free-dia-vagas"></span>';
            b.querySelector('.free-dia-sem').textContent = d.semana;
            b.querySelector('.free-dia-num').textContent = d.numero;
            b.querySelector('.free-dia-mes').textContent = d.mes;
            b.querySelector('.free-dia-vagas').textContent =
                d.vagas === 1 ? '1 vaga' : d.vagas + ' vagas';
            b.addEventListener('click', () => {
                diaEscolhido = d.dia;
                horaEscolhida = null;
                pintarDias();
                pintarHoras();
            });
            gradeDias.appendChild(b);
        });
    }

    function pintarHoras() {
        gradeHoras.textContent = '';
        const d = agenda.find(x => x.dia === diaEscolhido);
        if (!d) return;
        d.horarios.forEach(h => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'free-hora' + (h.inicio === horaEscolhida ? ' ativo' : '');
            b.textContent = h.rotulo;
            b.addEventListener('click', () => {
                horaEscolhida = h.inicio;
                pintarHoras();
                aviso('');
            });
            gradeHoras.appendChild(b);
        });
    }

    function carregarAgenda() {
        gradeDias.textContent = 'Carregando...';
        gradeHoras.textContent = '';
        return fetch(apiUrl('/agenda/horarios'))
            .then(r => r.json())
            .then(d => {
                agenda = (d && d.dias) || [];
                diaEscolhido = agenda.length ? agenda[0].dia : null;
                horaEscolhida = null;
                if (!agenda.length) {
                    gradeDias.textContent = '';
                    aviso('Não há horário livre nos próximos dias. Fale conosco pelo WhatsApp.', '#ff6b5e');
                    return;
                }
                pintarDias();
                pintarHoras();
            })
            .catch(() => aviso('Não foi possível carregar a agenda.', '#ff6b5e'));
    }

    formAgenda.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!horaEscolhida) { aviso('Escolha o dia e o horário.', '#ff6b5e'); return; }

        const botao = q('#free-enviar-agenda');
        const u = getUsuarioLogado();
        botao.disabled = true;
        aviso('Marcando...');

        fetch(apiUrl('/chamado/free'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                verificacao_id: verificacaoId,
                inicio: horaEscolhida,
                usuario_id: u ? u.id : null,
                descricao: 'Suporte gratuito pedido pela página de planos'
            })
        })
        .then(r => r.json())
        .then(data => {
            botao.disabled = false;
            if (!data.success) {
                aviso(data.error || 'Não foi possível marcar.', '#ff6b5e');
                // o horário foi tomado enquanto ela preenchia
                if (data.recarregar_agenda) carregarAgenda();
                return;
            }
            aviso('Atendimento marcado! Abrindo o WhatsApp...', '#6ee7c8');
            setTimeout(() => {
                window.location.href = 'agradecimento-free.html'
                    + '?oab=' + encodeURIComponent(q('#free-inscricao').value.replace(/\D/g, '') + '/' + selUf.value)
                    + '&quando=' + encodeURIComponent(data.inicio);
            }, 1200);
        })
        .catch(() => {
            botao.disabled = false;
            aviso('Erro de conexão com o servidor.', '#ff6b5e');
        });
    });

    const u = getUsuarioLogado();
    if (u && u.nome) q('#free-nome').value = u.nome;
    if (u && u.email) q('#free-email').value = u.email;
    if (u && u.telefone) q('#free-whats').value = u.telefone;
    if (u && u.oab) {
        const partes = String(u.oab).split('/');
        q('#free-inscricao').value = (partes[0] || '').replace(/\D/g, '');
        if (partes[1]) selUf.value = partes[1].toUpperCase();
    }

});
