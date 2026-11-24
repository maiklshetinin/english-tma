@echo off
rem Двойной щелчок: из каждой PDF в папке pdf\ — экраны «Собеседование · рация» (консул спрашивает один вопрос голосом; вопрос и эталон у экрана, роль — шаблон курса) в папку json\собеседование\ (tools/exam-json.py)
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
python exam-json.py
if %errorlevel%==9009 py exam-json.py
echo.
pause
