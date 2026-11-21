@echo off
rem Двойной щелчок: из каждой PDF в папке pdf\ — экраны «Разговор · рация» (нажал — говоришь, нажал — ответ; один вопрос — один экран) в папку json\рация\ (tools/ptt-json.py)
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
python ptt-json.py
if %errorlevel%==9009 py ptt-json.py
echo.
pause
