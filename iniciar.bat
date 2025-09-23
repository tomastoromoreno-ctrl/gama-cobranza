@echo off
cls
echo.
echo 🚀 Iniciando servidor de Gama Seguridad - Gestión de Cobranza...
echo.

REM Cambiar al directorio del proyecto
cd /d "%~dp0"

REM Iniciar el servidor en segundo plano
start cmd /k "npm start"

REM Esperar 5 segundos para que el servidor se inicie
timeout /t 5 >nul

REM Abrir el navegador en localhost:3000
start http://localhost:3000

echo.
echo ✅ Servidor iniciado y navegador abierto en http://localhost:3000
echo.
pause