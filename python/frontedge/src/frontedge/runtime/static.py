"""Раздача собранного интерфейса: статика + SPA-fallback."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response

__all__ = ["STATIC_DIR", "static_router", "static_root"]

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

_INDEX = "index.html"


def static_root() -> Path:
    """Каталог собранного интерфейса (создаётся на этапе сборки)."""
    return STATIC_DIR


def static_router(mount: str = "/frontedge") -> APIRouter:
    """Роутер, отдающий собранный интерфейс с fallback на index.html."""
    router = APIRouter()

    @router.get("/{path:path}", include_in_schema=False)
    def serve(path: str) -> Response:
        root = static_root()
        if path:
            candidate = (root / path).resolve()
            try:
                candidate.relative_to(root.resolve())
            except ValueError:
                raise HTTPException(status_code=404, detail="not found") from None
            if candidate.is_file():
                return FileResponse(candidate)

        index = root / _INDEX
        if not index.is_file():
            raise HTTPException(
                status_code=503,
                detail="Интерфейс не собран: выполните `pnpm build` и скопируйте dist в frontedge/static",
            )
        return FileResponse(index, headers={"Cache-Control": "no-cache"})

    return router
