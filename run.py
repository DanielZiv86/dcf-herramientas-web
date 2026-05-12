"""Entry point: starts the FastAPI backend."""
import sys
import os
from pathlib import Path

# Add backend to Python path and change cwd so uvicorn finds main.py
backend_dir = Path(__file__).resolve().parent / "backend"
sys.path.insert(0, str(backend_dir))
os.chdir(str(backend_dir))

import uvicorn
from config import settings

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.app_host,
        port=settings.app_port,
        reload=settings.debug,
        log_level="debug" if settings.debug else "info",
    )
