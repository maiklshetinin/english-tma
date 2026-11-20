@echo off
rem Двойной щелчок: все PDF из папки pdf\ превращаются в JSON в папке json\ (tools/kp-json.py)
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
python kp-json.py
if %errorlevel%==9009 py kp-json.py
echo.
pause
