import uvicorn

# Ensure PyInstaller bundles the local app package.
import app.main  # noqa: F401

from app.core.config import settings


def main() -> None:
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level,
    )


if __name__ == "__main__":
    main()
