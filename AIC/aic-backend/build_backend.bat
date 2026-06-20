@echo off
setlocal
set "BASEDIR=%~dp0"
set "BASEPATH=%BASEDIR:~0,-1%"
cd /d "%BASEDIR%"
python -m PyInstaller --name aic-backend --onefile --paths "%BASEPATH%" --hidden-import app.main --hidden-import openai --distpath dist "%BASEDIR%app\cli.py"
if errorlevel 1 exit /b 1
echo Built: dist\aic-backend.exe
