@echo off
rem Двойной щелчок: из каждой PDF в папке pdf\ — экран «Разговор с персонажем» (консул задаёт вопросы урока) в папку json\разговор\ (tools/talk-json.py)
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
python talk-json.py
if %errorlevel%==9009 py talk-json.py
echo.
pause
