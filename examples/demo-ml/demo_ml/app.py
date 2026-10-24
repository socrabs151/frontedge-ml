"""Demo: a FastAPI application with a fake ML backend and Frontedge mounted.

    uv run demo-ml
    → http://127.0.0.1:8000/frontedge
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Sequence
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, Request

import frontedge
from frontedge.config import ActionResult
from frontedge.models import (
    DatasetDetail,
    DatasetInfo,
    EvalComparison,
    EvalSummary,
    Example,
    LogLine,
    Run,
    RunsPage,
    RunsQuery,
)

from .data import (
    make_comparison,
    make_dataset_detail,
    make_datasets,
    make_evals,
    make_examples,
    make_log_lines,
    make_runs,
)


class DemoRepository:
    """Fake ML backend: runs in memory."""

    def __init__(self) -> None:
        self.runs: list[Run] = make_runs(200)
        self.logs: dict[str, list[dict[str, Any]]] = {}

    def logs_for(self, run_id: str) -> list[dict[str, Any]]:
        if run_id not in self.logs:
            self.logs[run_id] = make_log_lines(80)
        return self.logs[run_id]


class DemoProvider:
    """Data source for Frontedge."""

    def __init__(self, repository: DemoRepository) -> None:
        self.repository = repository

    async def list_runs(self, request: Request, query: RunsQuery | None = None) -> RunsPage:
        """Filtering and pagination on the demo side — like a real backend."""
        runs = list(self.repository.runs)
        if query is not None:
            if query.search:
                needle = query.search.strip().lower()
                runs = [run for run in runs if needle in run.name.lower()]
            if query.status:
                runs = [run for run in runs if run.status in query.status]
            if query.dataset:
                runs = [run for run in runs if run.dataset == query.dataset]
            if query.tag:
                runs = [run for run in runs if query.tag in run.tags]
            total = len(runs)
            if query.offset:
                runs = runs[query.offset :]
            if query.limit is not None:
                runs = runs[: query.limit]
            return RunsPage(items=runs, total=total)
        return RunsPage(items=runs, total=len(runs))

    async def get_run(self, request: Request, run_id: str) -> Run | None:
        return next((run for run in self.repository.runs if run.id == run_id), None)

    async def stream_logs(self, request: Request, run_id: str) -> AsyncIterator[LogLine]:
        """Logs arrive gradually — like a live stream."""
        for line in self.repository.logs_for(run_id):
            yield LogLine.model_validate(line)
            await asyncio.sleep(0.15)

    async def read_artifact(self, request: Request, artifact_id: str) -> bytes | None:
        """Artifact content — in the demo it is a text stub."""
        if not artifact_id:
            return None
        return f"Demo artifact {artifact_id}\n".encode("utf-8")

    async def list_examples(self, request: Request, run_id: str) -> list[Example]:
        """The examples of a run — the same slice for every run in the demo."""
        return [Example.model_validate(item) for item in make_examples(24)]


class DemoEvalProvider:
    """Evals: dataset × scorer × metric, comparison of two runs."""

    def __init__(self, repository: DemoRepository) -> None:
        self.repository = repository

    def name_of(self, run_id: str) -> str:
        return next((run.name for run in self.repository.runs if run.id == run_id), run_id)

    async def list_evals(self, request: Request) -> Sequence[EvalSummary]:
        return make_evals()

    async def compare_evals(
        self,
        request: Request,
        eval_id: str,
        reference_run: str,
        comparison_run: str,
    ) -> EvalComparison | None:
        try:
            return make_comparison(
                eval_id,
                reference_run,
                comparison_run,
                reference_name=self.name_of(reference_run),
                comparison_name=self.name_of(comparison_run),
            )
        except StopIteration:
            return None


class DemoDatasetProvider:
    """Datasets: versions, datasheet, examples."""

    async def list_datasets(self, request: Request) -> Sequence[DatasetInfo]:
        return make_datasets()

    async def get_dataset(self, request: Request, dataset_id: str) -> DatasetDetail | None:
        return make_dataset_detail(dataset_id)


# --- Project actions -----------------------------------------------------
# A handler gets the request and the payload (here — the run id) and returns
# an ActionResult. The library only calls it and shows the result.


async def stop_run(request: Request, payload: dict[str, Any]) -> ActionResult:
    run_id = payload.get("runId")
    return ActionResult(ok=True, message=f"Run {run_id} stopped")


async def export_run(request: Request, payload: dict[str, Any]) -> ActionResult:
    run_id = payload.get("runId")
    return ActionResult(ok=True, message=f"Run {run_id} metrics exported to CSV")


async def rerun(request: Request, payload: dict[str, Any]) -> ActionResult:
    run_id = payload.get("runId")
    return ActionResult(ok=True, message=f"Run {run_id} queued")


CONFIG_PATH = Path(__file__).resolve().parent.parent / "frontedge.toml"


def create_app() -> FastAPI:
    app = FastAPI(title="frontedge demo", version="0.1.0")
    repository = DemoRepository()
    provider = DemoProvider(repository)

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(
        frontedge.mount(
            provider,
            evals=DemoEvalProvider(repository),
            datasets=DemoDatasetProvider(),
            actions={
                "stop": stop_run,
                "export": export_run,
                "rerun": rerun,
            },
            config=CONFIG_PATH,
            path="/frontedge",
            title="Frontedge — demo",
        )
    )
    return app


app = create_app()


def main() -> None:
    uvicorn.run("demo_ml.app:app", host="127.0.0.1", port=8000, reload=False)


if __name__ == "__main__":
    main()
