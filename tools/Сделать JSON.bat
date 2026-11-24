@echo off
rem Двойной щелчок: спросит, какое упражнение (номер из списка), и из каждой PDF в папке pdf\ сделает его экраны в папку json\(папка упражнения)\ (tools/make-json.py)
rem Один скрипт на все упражнения (24.11.2026): kp, kpapi, kpfile, talk, talkava, talkptt, talkptt2, talkvn, talkexam
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
python make-json.py
if %errorlevel%==9009 py make-json.py
echo.
pause
