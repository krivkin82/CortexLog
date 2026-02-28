@echo off
setlocal
set "BASEDIR=%~dp0"
set "BASEPATH=%BASEDIR:~0,-1%"
cd /d "%BASEDIR%"
"C:\Users\krivk\AppData\Local\Programs\Python\Python312\python.exe" -m PyInstaller --name aic-backend --onefile --paths "%BASEPATH%" --hidden-import app.main --distpath dist "%BASEDIR%app\cli.py"
