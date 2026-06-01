@echo off
title CotiZap Backend
color 0A
echo.
echo  ============================================
echo    CotiZap Backend - NO CERRAR ESTA VENTANA
echo  ============================================
echo.
echo  Dashboard: http://localhost:3001/dashboard.html
echo.
cd /d "%~dp0"
node src/index.js
pause
