@echo off
echo ==============================================
echo    Starting Think to Build Platform
echo ==============================================

:: Start the Python CLIP Microservice in a new window
echo [1/2] Starting CLIP Microservice...
start "CLIP Microservice" cmd /k "cd clip_service && venv\Scripts\activate && python app.py"

:: Wait a couple of seconds to ensure the microservice is initializing
timeout /t 3 /nobreak >nul

:: Start the Node Backend in the current window
echo [2/2] Starting Node Backend...
cd backend
npm install
node server.js
