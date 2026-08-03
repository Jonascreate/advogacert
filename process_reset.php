<?php
/**
 * process_reset.php — Processa a redefinição de senha (recebe token + nova senha)
 * ==================================================================================
 * 
 * Dependência: lib/db.php
 * 
 * Fluxo:
 *   1. Recebe JSON com token + nova_senha
 *   2. Valida os dados
 *   3. Busca usuário pelo token via lib/db.php
 *   4. Atualiza senha e limpa token
 */

require_once __DIR__ . '/lib/db.php';

header('Content-Type: application/json; charset=utf-8');

// Ler JSON
$input = json_decode(file_get_contents('php://input'), true);
$token = $input['token'] ?? null;
$novaSenha = $input['nova_senha'] ?? null;

if (!$token || !$novaSenha || strlen($novaSenha) < 6) {
    echo json_encode(['success' => false, 'error' => 'Dados inválidos']);
    exit;
}

// Buscar usuário pelo token (já verifica expiração internamente)
$user = getUserByToken($token);

if (!$user) {
    echo json_encode(['success' => false, 'error' => 'Token inválido ou expirado']);
    exit;
}

// Atualizar senha e limpar token
$senhaHash = password_hash($novaSenha, PASSWORD_BCRYPT);
$updated = updatePassword($user['id'], $senhaHash);

if ($updated) {
    echo json_encode(['success' => true, 'msg' => 'Senha atualizada']);
} else {
    echo json_encode(['success' => false, 'error' => 'Erro ao atualizar senha']);
}