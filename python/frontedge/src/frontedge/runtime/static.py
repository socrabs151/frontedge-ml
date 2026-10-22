"""Serving the built interface: static files + SPA fallback."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response

__all__ = ["STATIC_DIR", "static_router", "static_root"]

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

_INDEX = "index.html"
# Value placeholder (not a key!) — otherwise the replacement would eat the variable name too.
_MOUNT_PLACEHOLDER = "@@FRONTEDGE_MOUNT@@"


def static_root() -> Path:
    """Directory of the built interface (created at build time)."""
    return STATIC_DIR


def static_router(mount: str = "/frontedge") -> APIRouter:
    """Router serving the built interface with an index.html fallback.

    The mount path is substituted into the HTML, so the interface knows where to
    look for its API and works under any prefix.
    """
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
                detail="Interface is not built: run `pnpm build` and copy dist to frontedge/static",
            )
        html = index.read_text(encoding="utf-8").replace(_MOUNT_PLACEHOLDER, mount)
        return Response(html, media_type="text/html", headers={"Cache-Control": "no-cache"})

    return router
