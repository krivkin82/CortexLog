# Eval harness

Fixture-based evaluation for AIC advice quality using golden prompts.

## Prerequisites

- Ollama running with the model used by the backend (same as normal chat)
- Python environment with project dependencies installed

## Run

From the **repo root**:

**Windows (PowerShell):**
```powershell
$env:PYTHONPATH = "aic-backend;."; python eval/run_eval.py
```

**Linux / macOS:**
```bash
PYTHONPATH=aic-backend:. python eval/run_eval.py
```

Results are written to `eval/outputs/eval_results.json`.

## Baseline

To save a baseline before prompt or routing changes, copy the first run's output:

```powershell
Copy-Item eval/outputs/eval_results.json eval/outputs/baseline_results.json
```
