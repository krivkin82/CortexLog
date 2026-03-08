#!/usr/bin/env bash
# Run eval harness from repo root. Requires Ollama running.
cd "$(dirname "$0")/.."
export PYTHONPATH=aic-backend:.
python eval/run_eval.py
