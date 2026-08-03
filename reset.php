<?php
/**
 * reset.php — Página de redefinição de senha (verifica token e carrega formulário)
 * =================================================================================
 * 
 * Dependência: lib/db.php
 * 
 * Fluxo:
 *   1. Recebe ?token=XXXX da URL
 *   2. Verifica se token é válido (não expirado) via lib/db.php
 *   3. Se válido, renderiza resetsenha.html com os dados do usuário
 *   4. Se inválido, mostra mensagem de erro
 */

require_once __DIR__ . '/lib/db.php';

session_start();
$token = $_GET['token'] ?? null;

if (!$token) {
    die('Token inválido');
}

// Verificar token usando a camada de abstração
$user = getUserByToken($token);

if (!$user) {
    die('Token inválido ou expirado. Solicite uma nova recuperação de senha.');
}

// Preparar dados para JavaScript
$userEmail = htmlspecialchars($user['email']);
$tokenEncoded = htmlspecialchars($token);
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <script>
        // Passar dados do PHP para o JavaScript
        window.USER_EMAIL = '<?php echo $userEmail; ?>';
        window.USER_TOKEN = '<?php echo $tokenEncoded; ?>';
    </script>
</head>
<body>
    <?php include __DIR__ . '/resetsenha.html'; ?>
</body>
</html>