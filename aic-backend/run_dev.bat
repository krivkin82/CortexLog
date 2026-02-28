@echo off
setlocal
set AIC_HOST=127.0.0.1
set AIC_PORT=8000
python -m uvicorn app.main:app --reload --host %AIC_HOST% --port %AIC_PORT%
