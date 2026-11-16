@echo off
chcp 65001 >nul
title Ulusoy Market Sunucusu
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js bulunamadi. https://nodejs.org adresinden kurup tekrar deneyin.
  pause
  exit /b 1
)

netstat -ano | findstr /R /C:":3000 .*LISTENING" >nul
if not errorlevel 1 (
  echo Sunucu zaten calisiyor. Tarayici aciliyor...
  start "" http://localhost:3000
  start "" http://localhost:3000/panel
  timeout /t 3 >nul
  exit /b 0
)

echo Sunucu baslatiliyor...
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep 2; Start-Process 'http://localhost:3000'; Start-Process 'http://localhost:3000/panel'"
echo.
echo  Magaza:          http://localhost:3000
echo  Yonetim paneli:  http://localhost:3000/panel
echo  Panel girisi:    kullanici adi "admin", sifre ilk kurulumda ADMIN_PASSWORD
echo                   (verilmediyse admin123 - panelden Hesabim ile hemen degistirin)
echo.
echo  Bu pencere acik kaldigi surece market calisir. Kapatmak icin pencereyi kapatin.
echo  Veriler data\ klasorundedir (db.json, backups\, uploads\).
echo.
node server.js
pause
