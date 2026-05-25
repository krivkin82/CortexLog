# AIC Backend (FastAPI)

Local backend service for the AI Companion MVP.

## Development

1. Create and activate a virtual environment.
2. Install dependencies:
   - `pip install -r requirements.txt`
3. Ensure Ollama is running (`ollama serve`) with the model installed (default: `gpt-oss:20b`).
4. Run the API:
   - `uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`

Health check: `GET http://127.0.0.1:8000/health`

## Packaged backend (`aic-backend.exe`)

From this folder:

```bat
pip install -r requirements.txt
pip install pyinstaller
build_backend.bat
```

Output: `dist\aic-backend.exe` (used by the Electron app’s `extraResources`).

If **PyInstaller** fails with access denied when writing `build\` or `dist\`, ensure the terminal can write under this directory and that antivirus is not blocking new executables. For the full desktop `.exe` flow (including permission tips for **electron-builder**), see `../aic-electron/README.md` → *Packaged app* / *If you hit permission or access issues*.

## LLM (Ollama) Configuration

- **Model**: Set `AIC_OLLAMA_MODEL` to your installed model (default: `gpt-oss:20b`).
- **Base URL**: Set `AIC_OLLAMA_BASE_URL` if Ollama runs elsewhere (default: `http://localhost:11434`).

## Conversation quality

Journal and exploration tone comes from **`app/llm/response.py`** (persona + per-mode prompts) plus **`cortexlog_llm`** settings stored in the app DB. Defaults include `openai_max_tokens`, `openai_temperature`, `local_num_predict`, and `local_temperature` (see **`app/llm/llm_settings.py`**). Frontier-style answers need all of: **a capable model**, **enough output budget** (tokens), and **those prompts**—small local models will still hit a quality ceiling regardless of prompting.
