import secrets
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.routes import router as api_router
from app.core.config import settings
from app.storage import init_db
from app.security.api_auth import get_api_token, _extract_token


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name)
    app.include_router(api_router, prefix=settings.api_prefix)

    @app.middleware("http")
    async def require_api_token(request: Request, call_next):
        path = request.url.path.rstrip("/")
        base = (settings.api_prefix or "").rstrip("/")
        health_path = f"{base}/health" if base else "/health"
        if path == health_path or path == "/health":
            return await call_next(request)
        token = _extract_token(request)
        expected = get_api_token()
        if not token or not secrets.compare_digest(token, expected):
            return JSONResponse(status_code=401, content={"detail": "Missing or invalid API key"})
        return await call_next(request)

    @app.on_event("startup")
    def on_startup() -> None:
        get_api_token()  # Ensure token file exists
        init_db()

    return app


app = create_app()
