@echo off
setlocal
set AIC_HOST=127.0.0.1
set AIC_PORT=8000
REM Optional: set AIC_PROFILE_ID=private or demo before running for manual dev without Electron
if not defined AIC_PROFILE_ID set AIC_PROFILE_ID=private
python -m uvicorn app.main:app --reload --host %AIC_HOST% --port %AIC_PORT%
