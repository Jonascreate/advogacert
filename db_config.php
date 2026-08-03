<?php
// As credenciais vêm de secrets_config.json (ignorado pelo Git) ou de
// variáveis de ambiente. Veja secrets_config.example.json.
require_once __DIR__ . '/lib/secrets.php';

$dbHost = segredo('db.host', 'DB_HOST', 'localhost');
$dbName = segredo('db.name', 'DB_NAME');
$dbUser = segredo('db.user', 'DB_USER');
$dbPass = segredo('db.pass', 'DB_PASS');

try {
    $pdo = new PDO("mysql:host={$dbHost};dbname={$dbName}", $dbUser, $dbPass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Erro de conexão']);
    error_log("DB Error: " . $e->getMessage());
    exit;
}
