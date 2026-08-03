<?php
/**
 * secrets.php — Leitura centralizada das credenciais
 * ==================================================
 *
 * As chaves NAO ficam no codigo. Ordem de leitura:
 *   1) variavel de ambiente (producao)
 *   2) secrets_config.json na raiz do projeto (local — esta no .gitignore)
 *
 * Veja secrets_config.example.json para o formato.
 */

/**
 * Le um valor de secrets_config.json usando caminho com ponto ("brevo.api_key").
 * Se $envVar for informada e existir no ambiente, ela tem prioridade.
 */
function segredo(string $caminho, string $envVar = '', string $padrao = ''): string
{
    static $config = null;

    if ($envVar !== '') {
        $doAmbiente = getenv($envVar);
        if ($doAmbiente !== false && $doAmbiente !== '') {
            return $doAmbiente;
        }
    }

    if ($config === null) {
        $arquivo = __DIR__ . '/../secrets_config.json';
        $config  = is_readable($arquivo)
            ? (json_decode(file_get_contents($arquivo), true) ?: [])
            : [];
    }

    $valor = $config;
    foreach (explode('.', $caminho) as $parte) {
        if (!is_array($valor) || !array_key_exists($parte, $valor)) {
            return $padrao;
        }
        $valor = $valor[$parte];
    }

    return is_string($valor) ? $valor : $padrao;
}
