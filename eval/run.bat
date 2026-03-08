@echo off
REM Run eval harness from repo root. Requires Ollama running.
cd /d "%~dp0.."
set PYTHONPATH=aic-backend;.
python eval/run_eval.py
