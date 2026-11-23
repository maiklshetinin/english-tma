@echo off
rem Двойной щелчок: из каждой PDF в папке pdf\ — экраны «Ответ по смыслу · целым аудио» (запись целиком → Gemini) в папку json\запись целиком\ (tools/kpfile-json.py)
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
python kpfile-json.py
if %errorlevel%==9009 py kpfile-json.py
echo.
pause
