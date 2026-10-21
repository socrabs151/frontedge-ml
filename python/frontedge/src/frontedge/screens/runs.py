"""Роутеры экранов: прогоны, оценки, датасеты, логи, артефакты."""

from __future__ import annotations

from collections.abc import AsyncIterator
from itertools import count
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response

from ..models import LogLine, Run
from ..providers import (
    DatasetProvider,
    EvalProvider,
    ProviderInput,
    adapt_provider,
    provider_has_logs,
)
from ..runtime.sse import sse_response
from ..runtime.static import static_router

__all__ = ["mount", "runs"]

_log_ids = count(1)


def _json_model(model: Any) -> Any:
    """Сериализация в camelCase, как в сгенерированных TypeScript-типах."""
    return model.model_dump(mode="json", by_alias=True)


async def _empty_logs() -> AsyncIterator[tuple[str, Any]]:
    return
    yield  # pragma: no cover


def _run_payload(run: Run, path: str) -> dict[str, Any]:
    payload = _json_model(run)
    payload["logStreamUrl"] = f"{path}/api/runs/{run.id}/logs/stream"
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


def _build_router(
    runs: ProviderInput,
    *,
    evals: EvalProvider | None = None,
    datasets: DatasetProvider | None = None,
    path: str = "/frontedge",
    title: str = "Frontedge",
) -> APIRouter:
    """Сборка роутера. Имя функции намеренно не ``mount``: параметр ``path`` не должен
    перекрывать одноимённую функцию (такая ошибка ломала ``frontedge.runs()``)."""
    source = adapt_provider(runs)
    router = APIRouter(prefix=path)

    # --- Прогоны ---------------------------------------------------------

    @router.get("/api/runs", tags=["frontedge"])
    async def list_runs(request: Request) -> list[dict[str, Any]]:
        return [_run_payload(run, path) for run in await source.list_runs(request)]

    @router.get("/api/runs/{run_id}", tags=["frontedge"])
    async def get_run(request: Request, run_id: str) -> dict[str, Any]:
        run = await source.get_run(request, run_id)
        if run is None:
            raise HTTPException(status_code=404, detail="Прогон не найден")
        return _run_payload(run, path)

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

    # --- Оценки ----------------------------------------------------------

    @router.get("/api/evals", tags=["frontedge"])
    async def list_evals(request: Request) -> list[dict[str, Any]]:
        if evals is None:
            return []
        return [_json_model(item) for item in await evals.list_evals(request)]

    @router.get("/api/evals/{eval_id}/compare", tags=["frontedge"])
    async def compare_evals(
        request: Request,
        eval_id: str,
        reference: str,
        comparison: str,
    ) -> dict[str, Any]:
        if evals is None:
            raise HTTPException(status_code=404, detail="Экраны оценок не подключены")
        result = await evals.compare_evals(request, eval_id, reference, comparison)
        if result is None:
            raise HTTPException(status_code=404, detail="Оценка не найдена")
        return _json_model(result)

    # --- Датасеты --------------------------------------------------------

    @router.get("/api/datasets", tags=["frontedge"])
    async def list_datasets(request: Request) -> list[dict[str, Any]]:
        if datasets is None:
            return []
        return [_json_model(item) for item in await datasets.list_datasets(request)]

    @router.get("/api/datasets/{dataset_id}", tags=["frontedge"])
    async def get_dataset(request: Request, dataset_id: str) -> dict[str, Any]:
        if datasets is None:
            raise HTTPException(status_code=404, detail="Экраны датасетов не подключены")
        result = await datasets.get_dataset(request, dataset_id)
        if result is None:
            raise HTTPException(status_code=404, detail="Датасет не найден")
        return _json_model(result)

    # --- Метаданные и интерфейс -------------------------------------------

    @router.get("/api/meta", tags=["frontedge"])
    async def get_meta() -> dict[str, Any]:
        return meta()

    @router.api_route(
        "/api/{rest:path}",
        methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        include_in_schema=False,
    )
    async def api_not_found(rest: str) -> Response:
        """Несуществующий путь API — 404 в JSON, а не HTML-страница SPA."""
        raise HTTPException(status_code=404, detail=f"Неизвестный эндпоинт API: /{rest}")

    router.include_router(static_router(path))
    router.title = title
    return router


def mount(
    runs_provider: ProviderInput,
    *,
    evals: EvalProvider | None = None,
    datasets: DatasetProvider | None = None,
    path: str = "/frontedge",
    title: str = "Frontedge",
) -> APIRouter:
    """Смонтировать интерфейс Frontedge в приложение.

    ``runs_provider`` — источник прогонов: объект с методами ``list_runs`` / ``get_run``
    (и опционально ``stream_logs``) либо async-функция ``(request) -> Sequence[Run]``.
    ``evals`` и ``datasets`` — необязательные источники для экранов сравнения оценок
    и датасетов; без них соответствующие разделы не появятся.
    """
    return _build_router(runs_provider, evals=evals, datasets=datasets, path=path, title=title)


def runs(
    runs_provider: ProviderInput,
    *,
    path: str = "/frontedge",
    title: str = "Frontedge",
) -> APIRouter:
    """Только экран прогонов — короткая запись для :func:`mount`."""
    return _build_router(runs_provider, path=path, title=title)


def log_line(text: str, level: str = "info") -> LogLine:
    """Помощник для провайдеров логов: строка с уникальным идентификатором."""
    from datetime import UTC, datetime

    return LogLine(
        id=next(_log_ids),
        at=datetime.now(UTC),
        level=level,  # type: ignore[arg-type]
        text=text,
    )
