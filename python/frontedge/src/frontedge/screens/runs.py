"""Роутеры экранов: список прогонов, детали прогона, логи, артефакты."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response

from ..models import LogLine, Run
from ..providers import ProviderInput, adapt_provider, provider_has_logs
from ..runtime.sse import sse_response
from ..runtime.static import static_router

__all__ = ["meta", "run_detail", "runs"]


def _json_model(model: Any) -> Any:
    """Сериализация в camelCase, как в сгенерированных TypeScript-типах."""
    return model.model_dump(mode="json", by_alias=True)


async def _empty_logs() -> AsyncIterator[tuple[str, Any]]:
    return
    yield  # pragma: no cover


def _run_payload(run: Run) -> dict[str, Any]:
    payload = _json_model(run)
    payload["logStreamUrl"] = f"/frontedge/api/runs/{run.id}/logs/stream"
    return payload


def meta() -> dict[str, Any]:
    """Метаданные, о которых должен знать интерфейс."""
    from .. import __version__

    return {
        "name": "frontedge",
        "version": __version__,
        "statuses": ["queued", "running", "succeeded", "failed", "cancelled", "lost"],
        "freshness": ["live", "fresh", "stale", "partial"],
        "metricDirections": ["maximize", "minimize", "none"],
    }


def runs(
    provider: ProviderInput,
    *,
    mount: str = "/frontedge",
    title: str = "Frontedge",
) -> APIRouter:
    """Роутер со списком прогонов.

    ``provider`` — объект с методами ``list_runs`` / ``get_run`` / ``stream_logs``
    либо async-функция ``(request) -> Sequence[Run]``.
    """
    source = adapt_provider(provider)
    router = APIRouter(prefix=mount)

    @router.get("/api/runs", tags=["frontedge"])
    async def list_runs(request: Request) -> list[dict[str, Any]]:
        runs_ = await source.list_runs(request)
        return [_run_payload(run) for run in runs_]

    @router.get("/api/runs/{run_id}", tags=["frontedge"])
    async def get_run(request: Request, run_id: str) -> dict[str, Any]:
        run = await source.get_run(request, run_id)
        if run is None:
            raise HTTPException(status_code=404, detail="Прогон не найден")
        return _run_payload(run)

    @router.get("/api/runs/{run_id}/logs/stream", tags=["frontedge"])
    async def stream_logs(request: Request, run_id: str) -> Response:
        if not provider_has_logs(source):
            return sse_response(_empty_logs())
        run = await source.get_run(request, run_id)
        if run is None:
            raise HTTPException(status_code=404, detail="Прогон не найден")

        async def events() -> AsyncIterator[tuple[str, Any]]:
            async for line in source.stream_logs(request, run_id):
                yield "log", _json_model(line)

        return sse_response(events())

    @router.get("/api/meta", tags=["frontedge"])
    async def get_meta() -> dict[str, Any]:
        return meta()

    router.include_router(static_router(mount))
    router.title = title
    return router


def run_detail(
    provider: ProviderInput,
    *,
    mount: str = "/frontedge",
    title: str = "Frontedge",
) -> APIRouter:
    """Алиас для одного экрана деталей: тот же контракт, другой акцент."""
    return runs(provider, mount=mount, title=title)


def log_line(text: str, level: str = "info") -> LogLine:
    """Помощник для провайдеров логов."""
    from datetime import UTC, datetime

    return LogLine(at=datetime.now(UTC), level=level, text=text)  # type: ignore[arg-type]
