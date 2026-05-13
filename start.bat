@echo off
echo ==============================================
echo    Starting Think to Build Platform
echo ==============================================

:: Start the Python CLIP Microservice in a new window
echo [1/2] Starting CLIP Microservice (FastAPI)...
start "CLIP Microservice" cmd /k "cd clip_service && venv\Scripts\activate && uvicorn app:app --host 127.0.0.1 --port 5000"

:: Wait a couple of seconds to ensure the microservice is initializing
timeout /t 5 /nobreak >nul

:: Start the Node Backend in the current window
echo [2/2] Starting Node Backend...
cd backend
npm install
node server.js
