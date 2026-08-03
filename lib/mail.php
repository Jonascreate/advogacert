<?php
/**
 * lib/mail.php — Envio de e-mail via API Brevo (cURL)
 * =====================================================
 * 
 * MODO ATUAL:   usa API Brevo (Sendinblue) via cURL diretamente
 *               (não precisa de PHPMailer instalado)
 * 
 * MODO FUTURO:  se quiser usar PHPMailer em vez da API,
 *               basta descomentar a seção PHPMailer e comentar
 *               a seção cURL.
 * 
 * Para usar:
 *   1. Obtenha sua API key em https://app.brevo.com/settings/keys/api
 *   2. Coloque em secrets_config.json (ou na variável de ambiente
 *      BREVO_API_KEY) — veja secrets_config.example.json
 *   3. Verifique o domínio remetente no painel Brevo (DKIM/SPF)
 *   4. Pronto!
 */

// ============================================================
// [CONFIG] SUA CHAVE DE API BREVO
// ============================================================
// A chave vem da variável de ambiente BREVO_API_KEY ou de
// secrets_config.json (ignorado pelo Git). Veja lib/secrets.php.
require_once __DIR__ . '/secrets.php';

define('BREVO_API_KEY', segredo('brevo.api_key', 'BREVO_API_KEY'));
define('BREVO_API_URL', 'https://api.brevo.com/v3/smtp/email');

/**
 * Envia um e-mail usando a API Brevo (Sendinblue)
 * 
 * @param string $paraEmail   E-mail do destinatário
 * @param string $paraNome    Nome do destinatário
 * @param string $assunto     Assunto do e-mail
 * @param string $htmlBody    Corpo HTML
 * @param string $textoAlt    Texto alternativo (plain text)
 * @return array              ['success' => bool, 'message' => string]
 */
function enviarEmailBrevo(
    string $paraEmail,
    string $paraNome,
    string $assunto,
    string $htmlBody,
    string $textoAlt = ''
): array {
    
    $payload = json_encode([
        'sender' => [
            'name' => 'AgenteJ.us',
            'email' => 'advogare@agentej.us'
            // ⚠️ Este e-mail PRECISA estar verificado no Brevo!
            //    Vá em: https://app.brevo.com/senders/domains
            //    Adicione o domínio agentej.us e configure os registros
            //    DNS (DKIM + SPF) apontados pelo Brevo.
        ],
        'to' => [
            [
                'email' => $paraEmail,
                'name' => $paraNome
            ]
        ],
        'subject' => $assunto,
        'htmlContent' => $htmlBody,
        'textContent' => $textoAlt ?: strip_tags($htmlBody)
    ]);

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => BREVO_API_URL,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Accept: application/json',
            'api-key: ' . BREVO_API_KEY
        ],
        CURLOPT_TIMEOUT => 15,
        CURLOPT_CONNECTTIMEOUT => 10
    ]);

    $resposta = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $erroCurl = curl_error($ch);
    curl_close($ch);

    if ($erroCurl) {
        error_log("Brevo cURL Error: " . $erroCurl);
        return ['success' => false, 'message' => 'Erro de conexão com servidor de e-mail'];
    }

    $data = json_decode($resposta, true);

    if ($httpCode >= 200 && $httpCode < 300) {
        error_log("Brevo: E-mail enviado para {$paraEmail} | ID: " . ($data['messageId'] ?? 'N/A'));
        return ['success' => true, 'message' => 'E-mail enviado com sucesso'];
    }

    $erro = $data['message'] ?? "Erro HTTP {$httpCode}";
    error_log("Brevo API Error ({$httpCode}): " . $erro);
    return ['success' => false, 'message' => 'Falha ao enviar e-mail: ' . $erro];
}

/*
 * ============================================================
 * [FUTURO] ALTERNATIVA USANDO PHPMailer (caso prefira SMTP)
 * ============================================================
 * Descomente o bloco abaixo e comente a função acima se quiser
 * usar SMTP em vez da API HTTP.
 *
 * Requer: composer require phpmailer/phpmailer
 *
function enviarEmailBrevo(string $paraEmail, string $paraNome, string $assunto, string $htmlBody, string $textoAlt = ''): array {
    require __DIR__ . '/../vendor/autoload.php';
    
    $mail = new PHPMailer\PHPMailer\PHPMailer(true);
    
    try {
        $mail->isSMTP();
        $mail->Host       = 'smtp-relay.brevo.com';  // 👈 Nome atualizado
        $mail->SMTPAuth   = true;
        $mail->Username   = 'advogare@agentej.us';     // 👈 Ajuste conforme seu login SMTP
        $mail->Password   = BREVO_API_KEY;              // 👈 Mesma chave, mas modo SMTP
        $mail->SMTPSecure = PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = 587;
        $mail->CharSet    = 'UTF-8';
        
        $mail->setFrom('advogare@agentej.us', 'AgenteJ.us');
        $mail->addAddress($paraEmail, $paraNome);
        $mail->isHTML(true);
        $mail->Subject = $assunto;
        $mail->Body    = $htmlBody;
        $mail->AltBody = $textoAlt ?: strip_tags($htmlBody);
        
        $mail->send();
        return ['success' => true, 'message' => 'E-mail enviado com sucesso'];
    } catch (Exception $e) {
        error_log("PHPMailer Error: " . $e->getMessage());
        return ['success' => false, 'message' => 'Falha ao enviar e-mail: ' . $e->getMessage()];
    }
}
*/