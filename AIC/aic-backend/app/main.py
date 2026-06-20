import secrets
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes import router as api_router
from app.api.llm_routes import router as llm_router
from app.api.modify_engine_routes import router as modify_engine_router
from app.core.config import settings
from app.storage import init_db
from app.storage.data_migration import migrate_legacy_data_files
from app.llm.debug_settings import ensure_debug_settings_defaults
from app.security.api_auth import get_api_token, _extract_token


def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name)
    prefix = settings.api_prefix or ""
    app.include_router(api_router, prefix=prefix)
    app.include_router(llm_router, prefix=prefix)
    app.include_router(modify_engine_router, prefix=prefix)

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
        migrate_legacy_data_files()
        ensure_debug_settings_defaults()
        get_api_token()  # Ensure token file exists
        init_db()

    # Outermost: must run before auth middleware so OPTIONS preflight succeeds.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://127.0.0.1:5173",
            "http://localhost:5173",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    return app


app = create_app()
