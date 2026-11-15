@echo off
setlocal
cd /d "%~dp0"

if not exist "%~dp0scripts\configurar-claude.mjs" (
    echo [ERRO] Voce precisa EXTRAIR o arquivo ZIP antes de executar!
    echo Nao execute o arquivo direto de dentro do WinRAR ou 7-Zip.
    echo Extraia a pasta para o seu computador primeiro e tente novamente.
    echo.
    pause
    exit /b 1
)

title Configurar Claude Desktop - Google Flow Studio
node scripts\configurar-claude.mjs
pause
