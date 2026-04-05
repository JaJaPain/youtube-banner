@echo off
TITLE YouTube Banner Maker - Starting App
echo ==========================================
echo Starting YouTube Banner Maker
echo ==========================================

REM 1. Start the Backend in a new window
echo Starting Python Backend (FastAPI)...
start "YouTube Banner Backend" cmd /k "cd backend && venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8085"

REM 2. Wait a moment for the backend to initialize
timeout /t 3 >nul

REM 3. Open the Frontend in the default browser
echo Opening Frontend (index.html)...
start index.html

echo.
echo Setup Complete!
echo Backend is running on http://127.0.0.1:8085
echo Frontend is open in your browser.
echo.
