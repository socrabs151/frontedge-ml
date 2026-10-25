"""Screen routers: runs, evals, datasets, logs, artifacts."""

from __future__ import annotations

import functools
import re
from collections.abc import AsyncIterator, Awaitable, Callable
from datetime import date, datetime
from itertools import count
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import StreamingResponse

from ..config import ActionResult, UiConfig, load_config
from ..meta import Meta, build_meta
from ..models import (
    DatasetDetail,
    DatasetInfo,
    EvalComparison,
    EvalSummary,
    Example,
    ExampleResult,
    LogLine,
    Run,
    RunOption,
    RunsPage,
    RunsQuery,
    RunStatus,
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
    provider_has_examples,
    provider_has_logs,
    provider_reads_artifacts,
)
from ..runtime.sse import sse_response
from ..runtime.static import static_router

__all__ = ["ActionHandler", "mount", "runs"]

_log_ids = count(1)

ActionHandler = Callable[[Request, dict[str, Any]], Awaitable[Any]]


class RunPayload(Run):
    """A run as the API returns it: the domain fields plus the resolved log stream URL."""

    log_stream_url: str


#: The list only draws a sparkline: 24 points are enough, and the payload stays small.
SPARKLINE_POINTS = 24


_SORT_FIELDS = {"startedAt": "started_at", "durationMs": "duration_ms", "gitSha": "git_sha"}
_SORTABLE_COLUMNS = {
    "name",
    "status",
    "dataset",
    "gitSha",
    "owner",
    "startedAt",
    "durationMs",
}
#: UI-only columns and containers: a column of dicts or a ribbon has no order.
_NOT_SORTABLE = {
    "actions",
    "artifacts",
    "baselineSeries",
    "baseline_series",
    "events",
    "metrics",
    "provenance",
    "ribbon",
    "series",
    "stages",
    "tags",
}
#: A page bigger than this is a mistake or a bypass of pagination; the UI asks for 50.
MAX_PAGE_SIZE = 1000
_SCALARS = (str, int, float, bool, date, datetime)


def _sort_value(run: Run, key: str) -> Any:
    """A scalar to sort by, or ``None``: a dict or a list is not an order."""
    value = (
        run.metrics[key]
        if key in run.metrics
        else getattr(run, _SORT_FIELDS.get(key, key), None)
    )
    return value if isinstance(value, _SCALARS) else None


def _sorted_runs(runs: list[Run], key: str, order: str) -> list[Run]:
    """Sort the in-memory fallback; nulls always last, strings and numbers stay homogeneous."""
    present = [run for run in runs if _sort_value(run, key) is not None]
    missing = [run for run in runs if _sort_value(run, key) is None]

    def sort_key(run: Run) -> tuple[int, Any]:
        value = _sort_value(run, key)
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            return (0, float(value))
        return (1, str(value))

    present.sort(key=sort_key, reverse=order == "desc")
    return present + missing


def _check_query(
    ui_config: UiConfig,
    *,
    limit: int | None,
    statuses: list[str],
    sort: str | None,
) -> None:
    """A wrong selection is a client error, not a 500 from a provider or a silent no-op."""
    if limit is not None and not 1 <= limit <= MAX_PAGE_SIZE:
        raise HTTPException(
            status_code=422, detail=f"limit must be between 1 and {MAX_PAGE_SIZE}"
        )
    known_statuses = {item.value for item in RunStatus}
    unknown = [status for status in statuses if status not in known_statuses]
    if unknown:
        raise HTTPException(
            status_code=422, detail=f"Unknown run status: {', '.join(unknown)}"
        )
    if sort is None:
        return
    if sort in _NOT_SORTABLE:
        raise HTTPException(status_code=422, detail=f"Column is not sortable: {sort}")
    declared = {metric.id for metric in ui_config.metrics} | set(ui_config.run_columns)
    # Without a declared column set the table shows every metric a run returns, so the
    # provider may sort by a metric name the configuration has never heard of.
    if declared and sort not in _SORTABLE_COLUMNS | declared:
        raise HTTPException(status_code=422, detail=f"Unknown sort key: {sort}")


def _downsample(points: list[Any], limit: int = SPARKLINE_POINTS) -> list[Any]:
    if len(points) <= limit:
        return points
    step = (len(points) - 1) / (limit - 1)
    return [points[round(index * step)] for index in range(limit)]


def _run_payload(run: Run, path: str, *, sparkline: bool = False) -> RunPayload:
    """A run as the API returns it.

    ``sparkline=True`` is for the list: every series is downsampled, because the table draws a
    24-pixel graph. The detail endpoint returns the full series for the charts.
    """
    series = (
        {name: _downsample(points) for name, points in run.series.items()}
        if sparkline
        else run.series
    )
    baseline_series = (
        {name: _downsample(points) for name, points in run.baseline_series.items()}
        if sparkline
        else run.baseline_series
    )
    return RunPayload(
        **run.model_dump(exclude={"series", "baseline_series"}),
        series=series,
        baseline_series=baseline_series,
        log_stream_url=f"{path}/api/runs/{run.id}/logs/stream",
    )


def _json_model(model: Any) -> Any:
    """Serialization to camelCase, like in the generated TypeScript types."""
    return model.model_dump(mode="json", by_alias=True)


async def _empty_logs() -> AsyncIterator[tuple[str, Any]]:
    return
    yield  # pragma: no cover


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
    # A handler is callable only when the configuration declares the action: an internal helper
    # in the dict must not become a remote endpoint.
    declared = {action.id for action in ui_config.actions}
    callable_actions = [action.id for action in ui_config.actions if action.id in handlers]
    # The browser must not draw a button for an action the server cannot run.
    served_config = ui_config.model_copy(
        update={"actions": [action for action in ui_config.actions if action.id in handlers]}
    )
    router = APIRouter(prefix=path)

    # --- Runs -------------------------------------------------------------

    @router.get(
        "/api/runs",
        tags=["frontedge"],
        response_model=list[RunPayload],
        responses={200: {"headers": {"X-Frontedge-Total": {"schema": {"type": "integer"}}}}},
    )
    @_provider_errors
    async def list_runs(
        request: Request,
        response: Response,
        limit: int | None = Query(default=None, ge=1, le=MAX_PAGE_SIZE),
        offset: int = Query(default=0, ge=0),
        search: str | None = None,
        status: str | None = None,
        dataset: str | None = None,
        tag: str | None = None,
        sort: str | None = None,
        order: Literal["asc", "desc"] = "desc",
    ) -> list[RunPayload]:
        """A list of runs.

        If the provider accepts ``list_runs(request, query)``, the selection goes
        to its side; otherwise the library applies it and returns the total count
        in the ``X-Frontedge-Total`` header.
        """
        statuses = [part for part in (status or "").split(",") if part]
        _check_query(ui_config, limit=limit, statuses=statuses, sort=sort)
        query = RunsQuery(
            limit=limit,
            offset=offset,
            search=search,
            status=statuses,
            dataset=dataset,
            tag=tag,
            sort=sort,
            order=order,
        )

        if provider_accepts_query(source):
            result = await source.list_runs(request, query)  # type: ignore[call-arg]
            if isinstance(result, RunsPage):
                runs_ = as_models(result.items, Run, "list_runs")
                response.headers["X-Frontedge-Total"] = str(result.total)
                return [_run_payload(run, path, sparkline=True) for run in runs_]
            runs_ = as_models(result, Run, "list_runs")
            response.headers["X-Frontedge-Total"] = str(len(runs_))
            return [_run_payload(run, path, sparkline=True) for run in runs_]
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
            if query.tag:
                runs_ = [run for run in runs_ if query.tag in run.tags]
            if query.sort:
                runs_ = _sorted_runs(runs_, query.sort, query.order)
            total = len(runs_)
            if query.offset:
                runs_ = runs_[query.offset :]
            if query.limit is not None:
                runs_ = runs_[: query.limit]

        response.headers["X-Frontedge-Total"] = str(total)
        return [_run_payload(run, path, sparkline=True) for run in runs_]

    @router.get(
        "/api/runs/options",
        tags=["frontedge"],
        response_model=list[RunOption],
    )
    @_provider_errors
    async def run_options(
        request: Request,
        limit: int = 200,
        search: str | None = None,
    ) -> list[RunOption]:
        """A compact list for the baseline and comparison pickers: no series, no stages."""
        capped = max(1, min(limit, 1000))
        if provider_accepts_query(source):
            result = await source.list_runs(  # type: ignore[call-arg]
                request, RunsQuery(limit=capped, search=search, offset=0)
            )
            items = result.items if isinstance(result, RunsPage) else result
        else:
            items = await source.list_runs(request)
            found = as_models(items, Run, "list_runs")
            if search:
                needle = search.strip().lower()
                found = [run for run in found if needle in run.name.lower()]
            items = found[:capped]
        return [
            RunOption(
                id=run.id,
                name=run.name,
                status=run.status,
                dataset=run.dataset,
                started_at=run.started_at,
                tags=run.tags,
            )
            for run in as_models(items, Run, "list_runs")
        ]

    @router.get("/api/runs/{run_id}", tags=["frontedge"], response_model=RunPayload)
    @_provider_errors
    async def get_run(request: Request, run_id: str) -> RunPayload:
        run = as_model_or_none(await source.get_run(request, run_id), Run, "get_run")
        if run is None:
            raise HTTPException(status_code=404, detail="Run not found")
        return _run_payload(run, path)

    @router.get(
        "/api/runs/{run_id}/examples",
        tags=["frontedge"],
        response_model=list[Example],
    )
    @_provider_errors
    async def list_examples(
        request: Request,
        response: Response,
        run_id: str,
        offset: int = 0,
        limit: int | None = None,
        changed: bool = False,
    ) -> list[Example]:
        """The examples of a run, a page at a time; the total is in X-Frontedge-Total."""
        if not provider_has_examples(source):
            return []
        run = as_model_or_none(await source.get_run(request, run_id), Run, "get_run")
        if run is None:
            raise HTTPException(status_code=404, detail="Run not found")
        items = as_models(await source.list_examples(request, run_id), Example, "list_examples")
        if changed:
            items = [
                example
                for example in items
                if example.baseline_score is not None
                and example.score != example.baseline_score
            ]
        response.headers["X-Frontedge-Total"] = str(len(items))
        page = items[max(0, offset) :]
        return page[: max(0, limit)] if limit is not None else page

    @router.get(
        "/api/runs/{run_id}/logs/stream",
        tags=["frontedge"],
        response_class=StreamingResponse,
        responses={
            200: {
                "description": "Server-sent events, one `log` event per line",
                "content": {"text/event-stream": {"schema": {"type": "string"}}},
            }
        },
    )
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

    @router.get(
        "/api/artifacts/{artifact_id}/content",
        tags=["frontedge"],
        response_class=Response,
        responses={
            200: {
                "description": "Raw artifact content",
                "content": {
                    "application/octet-stream": {
                        "schema": {"type": "string", "format": "binary"}
                    }
                },
            }
        },
    )
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
            headers={
                "Content-Disposition": (
                    'attachment; filename="'
                    + (re.sub(r"[^A-Za-z0-9._-]", "_", artifact_id) or "artifact")
                    + '"'
                )
            },
        )

    # --- Evals ------------------------------------------------------------

    @router.get("/api/evals", tags=["frontedge"], response_model=list[EvalSummary])
    @_provider_errors
    async def list_evals(request: Request) -> list[EvalSummary]:
        if evals is None:
            return []
        return as_models(await evals.list_evals(request), EvalSummary, "list_evals")

    @router.get(
        "/api/evals/{eval_id}/compare",
        tags=["frontedge"],
        response_model=EvalComparison,
    )
    @_provider_errors
    async def compare_evals(
        request: Request,
        eval_id: str,
        reference: str,
        comparison: str,
    ) -> EvalComparison:
        if evals is None:
            raise HTTPException(status_code=404, detail="Eval screens are not connected")
        result = as_model_or_none(
            await evals.compare_evals(request, eval_id, reference, comparison),
            EvalComparison,
            "compare_evals",
        )
        if result is None:
            raise HTTPException(status_code=404, detail="Eval not found")
        return result

    # --- Datasets ---------------------------------------------------------

    @router.get("/api/datasets", tags=["frontedge"], response_model=list[DatasetInfo])
    @_provider_errors
    async def list_datasets(request: Request) -> list[DatasetInfo]:
        if datasets is None:
            return []
        return as_models(await datasets.list_datasets(request), DatasetInfo, "list_datasets")

    @router.get(
        "/api/datasets/{dataset_id}",
        tags=["frontedge"],
        response_model=DatasetDetail,
    )
    @_provider_errors
    async def get_dataset(request: Request, dataset_id: str) -> DatasetDetail:
        if datasets is None:
            raise HTTPException(status_code=404, detail="Dataset screens are not connected")
        result = as_model_or_none(
            await datasets.get_dataset(request, dataset_id), DatasetDetail, "get_dataset"
        )
        if result is None:
            raise HTTPException(status_code=404, detail="Dataset not found")
        return result

    @router.get(
        "/api/datasets/{dataset_id}/examples",
        tags=["frontedge"],
        response_model=list[ExampleResult],
    )
    @_provider_errors
    async def dataset_examples(
        request: Request,
        response: Response,
        dataset_id: str,
        offset: int = 0,
        limit: int | None = None,
        search: str | None = None,
    ) -> list[ExampleResult]:
        """A page of the dataset examples; X-Frontedge-Total carries the filtered total."""
        if datasets is None:
            return []
        detail = as_model_or_none(
            await datasets.get_dataset(request, dataset_id), DatasetDetail, "get_dataset"
        )
        if detail is None:
            raise HTTPException(status_code=404, detail="Dataset not found")
        items = as_models(detail.examples, ExampleResult, "get_dataset")
        if search:
            needle = search.strip().lower()
            items = [
                example
                for example in items
                if needle in example.input.lower() or needle in example.output.lower()
            ]
        response.headers["X-Frontedge-Total"] = str(len(items))
        page = items[max(0, offset) :]
        return page[: max(0, limit)] if limit is not None else page

    # --- Metadata and interface -------------------------------------------

    @router.get("/api/meta", tags=["frontedge"], response_model=Meta)
    async def get_meta() -> Meta:
        return build_meta(
            runs=source, evals=evals, datasets=datasets, actions=callable_actions
        )

    @router.get("/api/config", tags=["frontedge"], response_model=UiConfig)
    async def get_config() -> UiConfig:
        """Interface configuration: columns, tabs and the actions that have a handler."""
        return served_config

    @router.post(
        "/api/actions/{action_id}",
        tags=["frontedge"],
        response_model=ActionResult,
    )
    async def run_action(
        action_id: str, request: Request, payload: dict[str, Any] | None = None
    ) -> ActionResult:
        """Run a project action. The library only knows the id."""
        handler = handlers.get(action_id)
        if handler is None or action_id not in declared:
            raise HTTPException(status_code=404, detail=f"Action is not declared: {action_id}")
        try:
            result = await handler(request, payload or {})
        except HTTPException:
            raise
        except Exception as error:  # noqa: BLE001 - the project's handler is a black box
            raise HTTPException(
                status_code=502, detail=f"Action {action_id} failed: {error}"
            ) from error
        if isinstance(result, ActionResult):
            return result
        return ActionResult(data=result if isinstance(result, dict) else {})

    @router.api_route(
        "/api/{rest:path}",
        methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        include_in_schema=False,
    )
    async def api_not_found(rest: str) -> Response:
        """Unknown API path — 404 in JSON, not an SPA HTML page."""
        raise HTTPException(status_code=404, detail=f"Unknown API endpoint: /{rest}")

    router.include_router(static_router(path, title))
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
        level=level,
        text=text,
    )
