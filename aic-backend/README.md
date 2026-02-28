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

## LLM (Ollama) Configuration

- **Model**: Set `AIC_OLLAMA_MODEL` to your installed model (default: `gpt-oss:20b`).
- **Base URL**: Set `AIC_OLLAMA_BASE_URL` if Ollama runs elsewhere (default: `http://localhost:11434`).
