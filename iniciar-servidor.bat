@echo off
REM OBSERVACAO (2026-07-18): erro EADDRINUSE ja ocorreu aqui quando um processo
REM "zumbi" fora do pm2 (ex: server.js iniciado direto num terminal e nao encerrado)
REM ficava preso na porta 3000. O passo abaixo mata qualquer processo na porta 3000
REM antes de subir o pm2, entao normalmente nao deve mais acontecer. Se acontecer de
REM novo, verifique C:\Users\<user>\.pm2\logs\site-timbrados-error.log.
cd /d "%~dp0"

REM Libera a porta 3000 caso algum processo "zumbi" (fora do pm2) esteja preso nela
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"

pm2 start server.js --name "site-timbrados" --silent 2>nul || pm2 restart site-timbrados --silent
echo Servidor rodando em http://localhost:3000
start http://localhost:3000
echo.

REM ---------------------------------------------------------------------
REM Equivalente em PowerShell (cole direto no PowerShell se preferir rodar
REM sem este .bat):
REM
REM cd "c:\Users\jonas\Desktop\tudo de 23 06 2026\site de timbrados"
REM Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue ^| Select-Object -ExpandProperty OwningProcess -Unique ^| ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
REM pm2 start server.js --name "site-timbrados" --silent 2^>$null
REM if (-not $?) { pm2 restart site-timbrados --silent }
REM Write-Host "Servidor rodando em http://localhost:3000"
REM start http://localhost:3000
REM ---------------------------------------------------------------------