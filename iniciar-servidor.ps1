# OBSERVACAO (2026-07-18): erro EADDRINUSE ja ocorreu aqui quando um processo
# "zumbi" fora do pm2 (ex: server.js iniciado direto num terminal e nao encerrado)
# ficava preso na porta 3000. O passo abaixo mata qualquer processo na porta 3000
# antes de subir o pm2, entao normalmente nao deve mais acontecer. Se acontecer de
# novo, verifique C:\Users\<user>\.pm2\logs\site-timbrados-error.log.

Set-Location -Path $PSScriptRoot

# Libera a porta 3000 caso algum processo "zumbi" (fora do pm2) esteja preso nela
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }

# Dois ambientes de verdade: local usa usuarios.json, nunca o Supabase real
# do Render, mesmo que a chave esteja em secrets_config.json. "pm2 restart"
# sozinho não pega variável nova num processo que já existe, por isso apaga
# e sobe de novo em vez de só reiniciar.
$env:BANCO_LOCAL = "1"
# Painel local sem senha: é teste, com dados de teste. Nunca no Render.
$env:ADMIN_SEM_SENHA = "1"
pm2 delete site-timbrados 2>$null | Out-Null
pm2 start server.js --name "site-timbrados" --silent

Write-Host "Servidor rodando em http://localhost:3000 (banco local: usuarios.json)"
Write-Host "Painel sem senha: http://localhost:3000/admin.html"
Start-Process "http://localhost:3000"
