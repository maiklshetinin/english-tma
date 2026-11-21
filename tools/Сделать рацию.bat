@echo off
rem Двойной щелчок: из каждой PDF в папке pdf\ — экраны «Разговор · рация» (нажал — говоришь, нажал — ответ; один вопрос — один экран) в папку json\рация\ (tools/talk-json.py --ptt)
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
python talk-json.py --ptt
if %errorlevel%==9009 py talk-json.py --ptt
echo.
pause
