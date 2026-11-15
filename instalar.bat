@echo off
setlocal
cd /d "%~dp0"

if not exist "%~dp0package.json" (
    echo [ERRO] Voce precisa EXTRAIR o arquivo ZIP antes de executar!
    echo Nao execute o arquivo direto de dentro do WinRAR ou 7-Zip.
    echo Extraia a pasta para o seu computador primeiro e tente novamente.
    echo.
    pause
    exit /b 1
)

echo ============================================================
echo      INSTALACAO - GOOGLE FLOW POOL (ROBO DE ROTACAO)
echo ============================================================
echo.
echo Baixando pacotes necessarios (Playwright)...
cmd.exe /c "npm install --no-audit --no-fund"
echo.
echo ============================================================
echo [SUCESSO] Instalacao concluida!
echo.
echo Proximos passos:
echo  1. De dois cliques em "cadastrar-conta.bat" para logar nas contas.
echo  2. De dois cliques em "configurar-claude.bat" para ligar ao Claude.
echo ============================================================
echo.
pause
