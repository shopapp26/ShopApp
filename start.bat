@echo off
title ShopApp Server
color 0A
echo.
echo  ================================
echo    ShopApp - Starting up...
echo  ================================
echo.

cd /d "%~dp0"

echo  Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
  echo  ERROR: Node.js not found!
  echo  Download from https://nodejs.org
  pause
  exit
)

echo  Checking dependencies...
if not exist node_modules (
  echo  Installing packages - please wait...
  npm install
  echo.
)

echo  Starting server...
echo.
echo  ================================
echo   Admin panel : http://localhost:3000
echo   Scanner     : http://localhost:3000/scan.html
echo   Admin pass  : shop@admin
echo  ================================
echo.
echo  Keep this window open while using the app.
echo  Press Ctrl+C to stop the server.
echo.

node server.js
pause
