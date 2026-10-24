"""Serving the built interface: static files + SPA fallback."""

from __future__ import annotations

from html import escape
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, Response

__all__ = ["STATIC_DIR", "static_router", "static_root"]

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

_INDEX = "index.html"
# Value placeholders (not keys!) — otherwise the replacement would eat the variable name too.
_MOUNT_PLACEHOLDER = "@@FRONTEDGE_MOUNT@@"
_TITLE_PLACEHOLDER = "@@FRONTEDGE_TITLE@@"


def static_root() -> Path:
    """Directory of the built interface (created at build time)."""
    return STATIC_DIR


def static_router(mount: str = "/frontedge", title: str = "Frontedge") -> APIRouter:
    """Router serving the built interface with an index.html fallback.

    The mount path and the document title are substituted into the HTML, so the interface knows
    where to look for its API and the browser tab says what the installation is.
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
                # Built assets carry a content hash: cache them forever. Everything else may
                # change between deployments.
                immutable = path.startswith("assets/")
                return FileResponse(
                    candidate,
                    headers={
                        "Cache-Control": (
                            "public, max-age=31536000, immutable"
                            if immutable
                            else "no-cache"
                        )
                    },
                )

        index = root / _INDEX
        if not index.is_file():
            raise HTTPException(
                status_code=503,
                detail="Interface is not built: run `pnpm build` and copy dist to frontedge/static",
            )
        html = (
            index.read_text(encoding="utf-8")
            .replace(_MOUNT_PLACEHOLDER, mount)
            .replace(_TITLE_PLACEHOLDER, escape(title))
        )
        return Response(html, media_type="text/html", headers={"Cache-Control": "no-cache"})

    return router
