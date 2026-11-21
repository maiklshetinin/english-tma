@echo off
rem Двойной щелчок: из каждой PDF в папке pdf\ — экраны «Ответ по смыслу» (проверка через мост, в чат) в папку json\мост\ (tools/kp-json.py)
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
python kp-json.py
if %errorlevel%==9009 py kp-json.py
echo.
pause
