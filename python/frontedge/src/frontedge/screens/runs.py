"""Screen routers: runs, evals, datasets, logs, artifacts."""

from __future__ import annotations

import functools
import json
from collections.abc import AsyncIterator, Awaitable, Callable, Sequence
from itertools import count
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response

from ..config import ActionResult, UiConfig, load_config
from ..models import (
    DatasetDetail,
    DatasetInfo,
    EvalComparison,
    EvalSummary,
    LogLine,
    Run,
    RunsPage,
    RunsQuery,
)
from ..providers import (
    DatasetProvider,
    EvalProvider,
    ProviderError,
    ProviderInput,
    adapt_provider,
    as_model,
    as_model_or_none,
    as_models,
    provider_accepts_query,
    provider_has_logs,
    provider_reads_artifacts,
)
from ..runtime.sse import sse_response
from ..runtime.static import static_router

__all__ = ["ActionHandler", "mount", "runs"]

_log_ids = count(1)

ActionHandler = Callable[[Request, dict[str, Any]], Awaitable[Any]]


def _json_model(model: Any) -> Any:
    """Serialization to camelCase, like in the generated TypeScript types."""
    return model.model_dump(mode="json", by_alias=True)


def _json(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, default=str)


async def _empty_logs() -> AsyncIterator[tuple[str, Any]]:
    return
    yield  # pragma: no cover


def _run_payload(run: Run, path: str) -> dict[str, Any]:
    payload = _json_model(run)
    payload["logStreamUrl"] = f"{path}/api/runs/{run.id}/logs/stream"
    return payload


def meta(
    *,
    runs: Any = None,
    evals: Any = None,
    datasets: Any = None,
    actions: Sequence[str] = (),
) -> dict[str, Any]:
    """Metadata the interface and a tool need to know: the vocabulary and the capabilities."""
    from .. import __version__

    screens = ["runs", "run"]
    if evals is not None:
        screens.append("evals")
    if datasets is not None:
        screens.append("datasets")

    return {
        "name": "frontedge",
        "version": __version__,
        "statuses": ["queued", "running", "succeeded", "failed", "cancelled", "lost"],
        "freshness": ["live", "fresh", "stale", "partial"],
        "metricDirections": ["maximize", "minimize", "none"],
        "capabilities": {
            "screens": screens,
            "actions": list(actions),
            "runs": {
                "query": runs is not None and provider_accepts_query(runs),
                "logs": runs is not None and provider_has_logs(runs),
                "artifacts": runs is not None and provider_reads_artifacts(runs),
            },
            "evals": evals is not None,
            "datasets": datasets is not None,
        },
    }


def _provider_errors(endpoint: Callable[..., Awaitable[Any]]) -> Callable[..., Awaitable[Any]]:
    """A broken provider contract is a bad gateway, not an internal error.

    The detail names the method and the position, so the person who wired the provider can fix
    it instead of reading a serializer traceback.
    """

    @functools.wraps(endpoint)
    async def wrapper(*args: Any, **kwargs: Any) -> Any:
        try:
            return await endpoint(*args, **kwargs)
        except ProviderError as error:
            raise HTTPException(status_code=502, detail=str(error)) from error

    return wrapper


def _build_router(
    runs: ProviderInput,
    *,
    evals: EvalProvider | None = None,
    datasets: DatasetProvider | None = None,
    actions: dict[str, ActionHandler] | None = None,
    config: UiConfig | str | Path | dict[str, Any] | None = None,
    path: str = "/frontedge",
    title: str = "Frontedge",
) -> APIRouter:
    """Router assembly. The function is deliberately not named ``mount``: the ``path``
    parameter must not shadow the function of the same name (that bug broke
    ``frontedge.runs()``)."""
    source = adapt_provider(runs)
    ui_config = load_config(config)
    handlers = actions or {}
    router = APIRouter(prefix=path)

    # --- Runs -------------------------------------------------------------

    @router.get("/api/runs", tags=["frontedge"])
    @_provider_errors
    async def list_runs(
        request: Request,
        limit: int | None = None,
        offset: int = 0,
        search: str | None = None,
        status: str | None = None,
        dataset: str | None = None,
    ) -> Response:
        """A list of runs.

        If the provider accepts ``list_runs(request, query)``, the selection goes
        to its side; otherwise the library applies it and returns the total count
        in the ``X-Frontedge-Total`` header.
        """
        query = RunsQuery(
            limit=limit,
            offset=max(0, offset),
            search=search,
            status=[part for part in (status or "").split(",") if part],
            dataset=dataset,
        )

        if provider_accepts_query(source):
            result = await source.list_runs(request, query)  # type: ignore[call-arg]
            if isinstance(result, RunsPage):
                body = [_run_payload(run, path) for run in as_models(result.items, Run, "list_runs")]
                return Response(
                    content=_json(body),
                    media_type="application/json",
                    headers={"X-Frontedge-Total": str(result.total)},
                )
            runs_ = as_models(result, Run, "list_runs")
            total = len(runs_)
        else:
            runs_ = as_models(await source.list_runs(request), Run, "list_runs")
            total = len(runs_)
            if query.search:
                needle = query.search.strip().lower()
                runs_ = [run for run in runs_ if needle in run.name.lower()]
            if query.status:
                runs_ = [run for run in runs_ if run.status in query.status]
            if query.dataset:
                runs_ = [run for run in runs_ if run.dataset == query.dataset]
            total = len(runs_)
            if query.offset:
                runs_ = runs_[query.offset :]
            if query.limit is not None:
                runs_ = runs_[: query.limit]

        return Response(
            content=_json([_run_payload(run, path) for run in runs_]),
            media_type="application/json",
            headers={"X-Frontedge-Total": str(total)},
        )

    @router.get("/api/runs/{run_id}", tags=["frontedge"])
    @_provider_errors
    async def get_run(request: Request, run_id: str) -> dict[str, Any]:
        run = as_model_or_none(await source.get_run(request, run_id), Run, "get_run")
        if run is None:
            raise HTTPException(status_code=404, detail="Run not found")
        return _run_payload(run, path)

    @router.get("/api/runs/{run_id}/logs/stream", tags=["frontedge"])
    @_provider_errors
    async def stream_logs(request: Request, run_id: str) -> Response:
        if not provider_has_logs(source):
            return sse_response(_empty_logs())
        run = as_model_or_none(await source.get_run(request, run_id), Run, "get_run")
        if run is None:
            raise HTTPException(status_code=404, detail="Run not found")

        async def events() -> AsyncIterator[tuple[str, Any]]:
            try:
                async for line in source.stream_logs(request, run_id):
                    yield "log", _json_model(as_model(line, LogLine, "stream_logs"))
            except ProviderError as error:
                # The response is already open: the only honest move is a visible error line.
                yield "log", _json_model(log_line(str(error), level="error"))

        return sse_response(events())

    # --- Artifacts --------------------------------------------------------

    @router.get("/api/artifacts/{artifact_id}/content", tags=["frontedge"])
    @_provider_errors
    async def artifact_content(request: Request, artifact_id: str) -> Response:
        """Artifact content — if the provider can serve it."""
        if not provider_reads_artifacts(source):
            raise HTTPException(
                status_code=404, detail="Provider does not serve artifact content"
            )
        data = await source.read_artifact(request, artifact_id)
        if data is None:
            raise HTTPException(status_code=404, detail="Artifact not found")
        if not isinstance(data, (bytes, bytearray)):
            raise ProviderError(
                f"read_artifact returned {type(data).__name__}, expected bytes"
            )
        return Response(
            content=data,
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{artifact_id}"'},
        )

    # --- Evals ------------------------------------------------------------

    @router.get("/api/evals", tags=["frontedge"])
    @_provider_errors
    async def list_evals(request: Request) -> list[dict[str, Any]]:
        if evals is None:
            return []
        items = as_models(await evals.list_evals(request), EvalSummary, "list_evals")
        return [_json_model(item) for item in items]

    @router.get("/api/evals/{eval_id}/compare", tags=["frontedge"])
    @_provider_errors
    async def compare_evals(
        request: Request,
        eval_id: str,
        reference: str,
        comparison: str,
    ) -> dict[str, Any]:
        if evals is None:
            raise HTTPException(status_code=404, detail="Eval screens are not connected")
        result = as_model_or_none(
            await evals.compare_evals(request, eval_id, reference, comparison),
            EvalComparison,
            "compare_evals",
        )
        if result is None:
            raise HTTPException(status_code=404, detail="Eval not found")
        return _json_model(result)

    # --- Datasets ---------------------------------------------------------

    @router.get("/api/datasets", tags=["frontedge"])
    @_provider_errors
    async def list_datasets(request: Request) -> list[dict[str, Any]]:
        if datasets is None:
            return []
        items = as_models(await datasets.list_datasets(request), DatasetInfo, "list_datasets")
        return [_json_model(item) for item in items]

    @router.get("/api/datasets/{dataset_id}", tags=["frontedge"])
    @_provider_errors
    async def get_dataset(request: Request, dataset_id: str) -> dict[str, Any]:
        if datasets is None:
            raise HTTPException(status_code=404, detail="Dataset screens are not connected")
        result = as_model_or_none(
            await datasets.get_dataset(request, dataset_id), DatasetDetail, "get_dataset"
        )
        if result is None:
            raise HTTPException(status_code=404, detail="Dataset not found")
        return _json_model(result)

    # --- Metadata and interface -------------------------------------------

    @router.get("/api/meta", tags=["frontedge"])
    async def get_meta() -> dict[str, Any]:
        return meta(runs=source, evals=evals, datasets=datasets, actions=handlers.keys())

    @router.get("/api/config", tags=["frontedge"])
    async def get_config() -> dict[str, Any]:
        """Interface configuration: columns, tabs, declared actions."""
        return _json_model(ui_config)

    @router.post("/api/actions/{action_id}", tags=["frontedge"])
    async def run_action(action_id: str, request: Request, payload: dict[str, Any] | None = None) -> Any:
        """Run a project action. The library only knows the id."""
        handler = handlers.get(action_id)
        if handler is None:
            raise HTTPException(status_code=404, detail=f"Action is not declared: {action_id}")
        result = await handler(request, payload or {})
        if isinstance(result, ActionResult):
            return _json_model(result)
        return {"ok": True, "message": None, "data": result if isinstance(result, dict) else {}}

    @router.api_route(
        "/api/{rest:path}",
        methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        include_in_schema=False,
    )
    async def api_not_found(rest: str) -> Response:
        """Unknown API path — 404 in JSON, not an SPA HTML page."""
        raise HTTPException(status_code=404, detail=f"Unknown API endpoint: /{rest}")

    router.include_router(static_router(path))
    router.title = title
    return router


def mount(
    runs_provider: ProviderInput,
    *,
    evals: EvalProvider | None = None,
    datasets: DatasetProvider | None = None,
    actions: dict[str, ActionHandler] | None = None,
    config: UiConfig | str | Path | dict[str, Any] | None = None,
    path: str = "/frontedge",
    title: str = "Frontedge",
) -> APIRouter:
    """Mount the Frontedge interface into the application.

    ``runs_provider`` — run source: an object with ``list_runs`` / ``get_run``
    methods (and optionally ``stream_logs``) or an async function
    ``(request) -> Sequence[Run]``.
    ``evals`` and ``datasets`` — optional sources for the eval comparison and
    dataset screens; without them the matching sections do not appear.
    ``actions`` — project action handlers: ``{"stop": async def stop(request, payload)}``.
    ``config`` — interface configuration: a path to TOML/JSON, a dict or a ready object.
    """
    return _build_router(
        runs_provider,
        evals=evals,
        datasets=datasets,
        actions=actions,
        config=config,
        path=path,
        title=title,
    )


def runs(
    runs_provider: ProviderInput,
    *,
    actions: dict[str, ActionHandler] | None = None,
    config: UiConfig | str | Path | dict[str, Any] | None = None,
    path: str = "/frontedge",
    title: str = "Frontedge",
) -> APIRouter:
    """The runs screen only — a short form of :func:`mount`."""
    return _build_router(
        runs_provider, actions=actions, config=config, path=path, title=title
    )


def log_line(text: str, level: str = "info") -> LogLine:
    """Helper for log providers: a line with a unique id."""
    from datetime import UTC, datetime

    return LogLine(
        id=next(_log_ids),
        at=datetime.now(UTC),
        level=level,  # type: ignore[arg-type]
        text=text,
    )
