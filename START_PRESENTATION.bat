@echo off
echo ========================================================
echo       AISIANT MUSIC STUDIO - LOCAL PRESENTATION MODE
echo ========================================================
echo.
echo 1. Starting Python AI Backend (Port 8000)...
start cmd /k "cd aisiant-backend && uvicorn main:app --reload"

echo 2. Starting Frontend (Port 5173)...
start cmd /k "npm run dev"

echo.
echo Waiting a few seconds for servers to start...
timeout /t 5 /nobreak > nul

echo 3. Opening your browser to localhost...
start http://localhost:5173

echo.
echo All set! Your AI Chat will now reply instantly and bypass Render completely.
echo You can close this window now.
pause
exit
