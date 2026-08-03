<?php
/**
 * login.php — Login, Cadastro e Recuperação de Senha
 * ====================================================
 * 
 * Dependências (substituem o PHPMailer):
 *   - lib/db.php   → abstração de banco (JSON agora, PostgreSQL/MySQL na VPS)
 *   - lib/mail.php  → envio via API Brevo (cURL) — sem precisar instalar nada
 *
 * ⚠️ FLUXO DE MIGRAÇÃO PARA VPS:
 *   1. Instalar PHP com extensões curl + pdo_pgsql (ou pdo_mysql)
 *   2. Configurar banco PostgreSQL/MySQL
 *   3. Em lib/db.php: descomentar seção PDO, comentar seção JSON
 *   4. Em lib/mail.php: ajustar BREVO_API_KEY para variável de ambiente
 *   5. Pronto!
 */

// ================== CONFIGURAÇÕES INICIAIS ==================
ini_set('display_errors', 1);
error_reporting(E_ALL);

header('Content-Type: application/json; charset=utf-8');

// Carregar dependências
require_once __DIR__ . '/lib/db.php';
require_once __DIR__ . '/lib/mail.php';

// ================== CORS ==================
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = ['https://www.agentej.us', 'https://agentej.us', 'http://localhost:3000', 'http://localhost'];

if (in_array($origin, $allowed, true)) {
    header("Access-Control-Allow-Origin: $origin");
    header("Vary: Origin");
}
header("Access-Control-Allow-Headers: Content-Type");
header("Access-Control-Allow-Methods: POST, OPTIONS");
header("Access-Control-Allow-Credentials: true");

// Responder OPTIONS (preflight)
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ================== LEITURA DO JSON ==================
$input = json_decode(file_get_contents('php://input'), true);

if (json_last_error() !== JSON_ERROR_NONE) {
    echo json_encode(['success' => false, 'error' => 'JSON inválido']);
    exit;
}

$action = $input['action'] ?? 'login';
$email  = filter_var($input['email'] ?? '', FILTER_VALIDATE_EMAIL);
$senha  = $input['senha'] ?? '';

// ================== REGISTER ==================
if ($action === 'register') {

    if (!$email) {
        echo json_encode(['success' => false, 'error' => 'E-mail inválido']);
        exit;
    }

    if (strlen($senha) < 6) {
        echo json_encode(['success' => false, 'error' => 'A senha deve ter no mínimo 6 caracteres']);
        exit;
    }

    // Verificar se já existe
    $existing = getUserByEmail($email);
    if ($existing) {
        echo json_encode(['success' => false, 'error' => 'Este e-mail já está cadastrado']);
        exit;
    }

    $senhaHash = password_hash($senha, PASSWORD_BCRYPT);
    $created = createUser($email, $senhaHash);

    if ($created) {
        // ================== ENVIO DE E-MAIL DE BOAS-VINDAS ==================
        $htmlTemplate = @file_get_contents(__DIR__ . '/email-boasvindas.html');
        if ($htmlTemplate) {
            $htmlBody = str_replace('{{EMAIL}}', htmlspecialchars($email), $htmlTemplate);
            enviarEmailBrevo(
                $email,
                $email,
                '🎉 Bem-vindo ao AgenteJ.us - Conta criada com sucesso!',
                $htmlBody,
                "Olá {$email},\n\nSua conta no AgenteJ.us foi criada com sucesso!\n\nAcesse: https://www.agentej.us\n\nBem-vindo! 🚀"
            );
        }

        echo json_encode(['success' => true, 'msg' => 'Conta criada com sucesso!']);
    } else {
        echo json_encode(['success' => false, 'error' => 'Erro ao criar conta']);
    }
    exit;
}

// ================== RESET DE SENHA ==================
if ($action === 'reset') {

    if (!$email) {
        echo json_encode(['success' => false, 'error' => 'E-mail inválido']);
        exit;
    }

    $user = getUserByEmail($email);

    if (!$user) {
        // Por segurança, não informar se o e-mail existe ou não
        echo json_encode(['success' => true, 'msg' => 'Se o e-mail existir, você receberá um link de recuperação.']);
        exit;
    }

    $token   = bin2hex(random_bytes(32));
    $expires = date('Y-m-d H:i:s', strtotime('+1 hour'));

    updateResetToken($email, $token, $expires);

    // ================== ENVIO DE EMAIL ==================
    $resetLink = "https://www.agentej.us/reset.php?token={$token}";
    $htmlTemplate = file_get_contents(__DIR__ . '/emailweb.html');
    $htmlBody = str_replace(
        ['{{RESET_LINK}}', '{{EMAIL}}'],
        [$resetLink, htmlspecialchars($email)],
        $htmlTemplate
    );
    $textoAlt = "Clique no link para redefinir sua senha: {$resetLink}";

    $resultado = enviarEmailBrevo(
        $email,
        $email,
        '🔐 Recuperação de Senha - AgenteJ.us',
        $htmlBody,
        $textoAlt
    );

    if ($resultado['success']) {
        echo json_encode(['success' => true, 'msg' => 'E-mail enviado com sucesso']);
    } else {
        error_log("Falha no envio de e-mail para {$email}: " . $resultado['message']);
        echo json_encode([
            'success' => true,
            'msg' => 'Se o e-mail existir, você receberá um link de recuperação.'
            // ⚠️ Mesmo com erro, não revelamos que falhou (segurança)
        ]);
    }
    exit;
}

// ================== LOGIN ==================
if ($action === 'login') {

    if (!$email || strlen($senha) < 6) {
        echo json_encode(['success' => false, 'error' => 'Dados inválidos']);
        exit;
    }

    $user = getUserByEmail($email);

    if ($user && password_verify($senha, $user['senha'])) {
        session_start();
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['email']   = $user['email'];

        echo json_encode([
            'success' => true,
            'user' => [
                'id' => $user['id'],
                'email' => $user['email']
            ]
        ]);
        exit;
    }

    echo json_encode(['success' => false, 'error' => 'Credenciais inválidas']);
    exit;
}

// ================== AÇÃO DESCONHECIDA ==================
echo json_encode(['success' => false, 'error' => 'Ação inválida']);