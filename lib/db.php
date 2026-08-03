<?php
/**
 * lib/db.php — Camada de abstração de banco de dados
 * ===================================================
 * 
 * MODO ATUAL:   usa arquivo JSON (simulação)
 * MODO FUTURO:  quando migrar para PostgreSQL/MySQL na VPS,
 *               basta descomentar a seção PDO abaixo e comentar
 *               toda a parte JSON.
 * 
 * Para trocar o armazenamento:
 *   1. Crie a tabela no banco com a mesma estrutura do JSON
 *   2. Descomente a seção PDO
 *   3. Ajuste as credenciais (host, dbname, user, password)
 *   4. Comente/remova a seção JSON_FILE abaixo
 *   5. As funções têm a mesma assinatura — não precisa mudar nada no resto do código
 */

// ============================================================
// [CONFIG] Arquivo JSON usado como banco (apenas para testes)
// ============================================================
define('JSON_DB_PATH', __DIR__ . '/../usuarios.json');

// ============================================================
// FUNÇÕES DE ACESSO A DADOS (abstração)
// ============================================================

/**
 * Obtém um usuário pelo e-mail
 * @param string $email
 * @return array|null
 */
function getUserByEmail(string $email): ?array {
    // ---- INÍCIO: Modo JSON (testes) ----
    $db = loadJsonDb();
    foreach ($db['usuarios'] as $user) {
        if ($user['email'] === $email) {
            return $user;
        }
    }
    // ---- FIM: Modo JSON ----

    /* ---- INÍCIO: Modo PDO (produção) ----
    try {
        $pdo = new PDO(
            'pgsql:host=localhost;dbname=juspaperdb;charset=utf8',
            'usuario',
            'senha',
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
        $stmt = $pdo->prepare("SELECT * FROM usuarios WHERE email = ?");
        $stmt->execute([$email]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    } catch (Exception $e) {
        error_log("DB Error: " . $e->getMessage());
        return null;
    }
    ---- FIM: Modo PDO ---- */

    return null;
}

/**
 * Obtém um usuário pelo token de reset
 * @param string $token
 * @return array|null
 */
function getUserByToken(string $token): ?array {
    // ---- INÍCIO: Modo JSON (testes) ----
    $db = loadJsonDb();
    foreach ($db['usuarios'] as $user) {
        if (isset($user['reset_token']) && $user['reset_token'] === $token) {
            // Verificar expiração
            if (isset($user['token_expires']) && strtotime($user['token_expires']) > time()) {
                return $user;
            }
        }
    }
    // ---- FIM: Modo JSON ----

    /* ---- INÍCIO: Modo PDO (produção) ----
    try {
        $pdo = new PDO('pgsql:host=localhost;dbname=juspaperdb', 'usuario', 'senha', [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
        ]);
        $stmt = $pdo->prepare(
            "SELECT * FROM usuarios WHERE reset_token = ? AND token_expires > NOW()"
        );
        $stmt->execute([$token]);
        return $stmt->fetch(PDO::FETCH_ASSOC) ?: null;
    } catch (Exception $e) {
        error_log("DB Error: " . $e->getMessage());
        return null;
    }
    ---- FIM: Modo PDO ---- */

    return null;
}

/**
 * Cria um novo usuário
 * @param string $email
 * @param string $senhaHash
 * @return bool
 */
function createUser(string $email, string $senhaHash): bool {
    // ---- INÍCIO: Modo JSON (testes) ----
    $db = loadJsonDb();
    $newId = count($db['usuarios']) + 1;
    $db['usuarios'][] = [
        'id' => $newId,
        'email' => $email,
        'senha' => $senhaHash,
        'reset_token' => null,
        'token_expires' => null,
        'created_at' => date('Y-m-d H:i:s')
    ];
    return saveJsonDb($db);
    // ---- FIM: Modo JSON ----

    /* ---- INÍCIO: Modo PDO (produção) ----
    try {
        $pdo = new PDO('pgsql:host=localhost;dbname=juspaperdb', 'usuario', 'senha', [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
        ]);
        $stmt = $pdo->prepare("INSERT INTO usuarios (email, senha) VALUES (?, ?)");
        return $stmt->execute([$email, $senhaHash]);
    } catch (Exception $e) {
        error_log("DB Error: " . $e->getMessage());
        return false;
    }
    ---- FIM: Modo PDO ---- */
}

/**
 * Atualiza o token de reset de um usuário
 * @param string $email
 * @param string $token
 * @param string $expires
 * @return bool
 */
function updateResetToken(string $email, string $token, string $expires): bool {
    // ---- INÍCIO: Modo JSON (testes) ----
    $db = loadJsonDb();
    foreach ($db['usuarios'] as &$user) {
        if ($user['email'] === $email) {
            $user['reset_token'] = $token;
            $user['token_expires'] = $expires;
            return saveJsonDb($db);
        }
    }
    return false;
    // ---- FIM: Modo JSON ----

    /* ---- INÍCIO: Modo PDO (produção) ----
    try {
        $pdo = new PDO('pgsql:host=localhost;dbname=juspaperdb', 'usuario', 'senha', [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
        ]);
        $stmt = $pdo->prepare(
            "UPDATE usuarios SET reset_token = ?, token_expires = ? WHERE email = ?"
        );
        return $stmt->execute([$token, $expires, $email]);
    } catch (Exception $e) {
        error_log("DB Error: " . $e->getMessage());
        return false;
    }
    ---- FIM: Modo PDO ---- */
}

/**
 * Atualiza a senha e limpa o token
 * @param int $userId
 * @param string $novaSenhaHash
 * @return bool
 */
function updatePassword(int $userId, string $novaSenhaHash): bool {
    // ---- INÍCIO: Modo JSON (testes) ----
    $db = loadJsonDb();
    foreach ($db['usuarios'] as &$user) {
        if ($user['id'] === $userId) {
            $user['senha'] = $novaSenhaHash;
            $user['reset_token'] = null;
            $user['token_expires'] = null;
            return saveJsonDb($db);
        }
    }
    return false;
    // ---- FIM: Modo JSON ----

    /* ---- INÍCIO: Modo PDO (produção) ----
    try {
        $pdo = new PDO('pgsql:host=localhost;dbname=juspaperdb', 'usuario', 'senha', [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
        ]);
        $stmt = $pdo->prepare(
            "UPDATE usuarios SET senha = ?, reset_token = NULL, token_expires = NULL WHERE id = ?"
        );
        return $stmt->execute([$novaSenhaHash, $userId]);
    } catch (Exception $e) {
        error_log("DB Error: " . $e->getMessage());
        return false;
    }
    ---- FIM: Modo PDO ---- */
}

// ============================================================
// FUNÇÕES AUXILIARES DO JSON (NÃO PRECISAM MUDAR NA MIGRAÇÃO)
// ============================================================

function loadJsonDb(): array {
    if (!file_exists(JSON_DB_PATH)) {
        return ['usuarios' => []];
    }
    $content = file_get_contents(JSON_DB_PATH);
    $data = json_decode($content, true);
    return $data ?: ['usuarios' => []];
}

function saveJsonDb(array $data): bool {
    $dir = dirname(JSON_DB_PATH);
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    return file_put_contents(JSON_DB_PATH, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) !== false;
}

// Limpar referências (&)
// (Isso é importante para evitar efeitos colaterais indesejados)
unset($user);