@echo off
rem Двойной щелчок: спросит, какое упражнение (номер из списка), и из каждой PDF в папке pdf\ сделает папку урока в json\(папка упражнения)\ — по JSON-файлу на вопрос (tools/make-json.py)
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
python make-json.py
if %errorlevel%==9009 py make-json.py
echo.
pause
