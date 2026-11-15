@echo off
setlocal
cd /d "%~dp0"

if not exist "%~dp0scripts\cadastrar-conta.mjs" (
    echo [ERRO] Voce precisa EXTRAIR o arquivo ZIP antes de executar!
    echo Nao execute o arquivo direto de dentro do WinRAR ou 7-Zip.
    echo Extraia a pasta para o seu computador primeiro e tente novamente.
    echo.
    pause
    exit /b 1
)

title Google Flow - Cadastrar Conta
node scripts\cadastrar-conta.mjs
pause
