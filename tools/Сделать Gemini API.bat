@echo off
rem Двойной щелчок: из каждой PDF в папке pdf\ — экраны «Ответ по смыслу · Gemini API» (проверка напрямую, без моста) в папку json\gemini-live\ (tools/kpapi-json.py)
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
python kpapi-json.py
if %errorlevel%==9009 py kpapi-json.py
echo.
pause
