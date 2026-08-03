/* ==========================================
   JurisPapel - Script da Página de Orçamento
   Arquivo: assets/js/orcamento.js
   Descrição: Validação e funcionalidades do formulário de orçamento
   ========================================== */

document.addEventListener('DOMContentLoaded', function() {

    // ==========================================
    // MÁSCARA DE TELEFONE
    // ==========================================
    const telefoneInput = document.getElementById('telefone');
    if (telefoneInput) {
        telefoneInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            if (value.length <= 2) {
                value = '(' + value;
            } else if (value.length <= 7) {
                value = '(' + value.substring(0, 2) + ') ' + value.substring(2);
            } else {
                value = '(' + value.substring(0, 2) + ') ' + value.substring(2, 7) + '-' + value.substring(7, 11);
            }
            e.target.value = value;
        });
    }

    // ==========================================
    // VALIDAÇÃO DO FORMULÁRIO
    // ==========================================
    const orcamentoForm = document.getElementById('orcamentoForm');
    if (orcamentoForm) {
        orcamentoForm.addEventListener('submit', function(e) {
            e.preventDefault();

            // Coletar dados
            const nome = document.getElementById('nome').value.trim();
            const email = document.getElementById('email').value.trim();
            const telefone = document.getElementById('telefone').value.trim();
            const tipo = document.getElementById('tipo').value;
            const mensagem = document.getElementById('mensagem').value.trim();

            // Validações
            if (!nome) {
                alert('Por favor, preencha o nome completo.');
                document.getElementById('nome').focus();
                return;
            }

            if (!email || !email.includes('@')) {
                alert('Por favor, informe um e-mail válido.');
                document.getElementById('email').focus();
                return;
            }

            if (!telefone || telefone.replace(/\D/g, '').length < 10) {
                alert('Por favor, informe um telefone válido com DDD.');
                document.getElementById('telefone').focus();
                return;
            }

            if (!tipo) {
                alert('Por favor, selecione o tipo de serviço.');
                document.getElementById('tipo').focus();
                return;
            }

            if (!mensagem || mensagem.length < 10) {
                alert('Por favor, descreva seu projeto com pelo menos 10 caracteres.');
                document.getElementById('mensagem').focus();
                return;
            }

            // Feedback visual de envio
            const btn = orcamentoForm.querySelector('.btn-submit');
            const originalText = btn.textContent;
            btn.textContent = 'Enviando...';
            btn.disabled = true;
            btn.style.opacity = '0.7';

            // Enviar formulário
            fetch('/processa_orcamento.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams(new FormData(orcamentoForm))
            })
            .then(res => {
                if (res.ok) {
                    btn.textContent = '✓ Enviado com sucesso!';
                    btn.style.background = '#22c55e';
                    setTimeout(() => {
                        window.location.href = 'agradecimento-free.html';
                    }, 1500);
                } else {
                    throw new Error('Erro no servidor');
                }
            })
            .catch(() => {
                btn.textContent = originalText;
                btn.disabled = false;
                btn.style.opacity = '1';
                alert('Ocorreu um erro ao enviar. Tente novamente.');
            });
        });
    }

});