"""Demo: a FastAPI application with a fake ML backend and Frontedge mounted.

    uv run demo-ml
    → http://127.0.0.1:8000/frontedge
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator, Sequence
from pathlib import Path
from typing import Any

import frontedge
import uvicorn
from fastapi import FastAPI, Request
from frontedge.config import ActionResult
from frontedge.models import (
    ArtifactMeta,
    DatasetDetail,
    DatasetExamplesPage,
    DatasetInfo,
    EvalComparison,
    EvalSummary,
    Example,
    ExamplesPage,
    ExamplesQuery,
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
            if query.sort:
                key = query.sort
                field = {
                    "startedAt": "started_at",
                    "durationMs": "duration_ms",
                    "gitSha": "git_sha",
                }.get(key, key)

                def value(run: Run) -> Any:
                    return run.metrics[key] if key in run.metrics else getattr(run, field, None)

                present = [run for run in runs if value(run) is not None]
                present.sort(key=value, reverse=query.order == "desc")
                runs = present + [run for run in runs if value(run) is None]
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

    def _artifact(self, artifact_id: str) -> Any:
        for run in self.repository.runs:
            for artifact in run.artifacts:
                if artifact.id == artifact_id:
                    return artifact
        return None

    async def artifact_meta(
        self, request: Request, artifact_id: str
    ) -> ArtifactMeta | None:
        artifact = self._artifact(artifact_id)
        if artifact is None:
            return None
        data = f"Demo artifact {artifact_id}\n".encode()
        media_type = {
            "report": "text/html; charset=utf-8",
            "log": "text/plain; charset=utf-8",
        }.get(artifact.kind, "application/octet-stream")
        return ArtifactMeta(
            size=len(data),
            filename=artifact.name,
            media_type=media_type,
            etag=f"{artifact.id}-{len(data)}",
            last_modified=artifact.created_at,
        )

    async def stream_artifact(
        self, request: Request, artifact_id: str, start: int = 0, end: int | None = None
    ) -> AsyncIterator[bytes]:
        data = f"Demo artifact {artifact_id}\n".encode()
        yield data[start:end]

    async def read_artifact(self, request: Request, artifact_id: str) -> bytes | None:
        """Artifact content — in the demo it is a text stub."""
        if not artifact_id:
            return None
        return f"Demo artifact {artifact_id}\n".encode()

    async def list_examples(
        self, request: Request, run_id: str, query: ExamplesQuery
    ) -> ExamplesPage:
        """The examples of a run — the same slice for every run in the demo."""
        items = [Example.model_validate(item) for item in make_examples(24)]
        if query.changed:
            items = [
                example
                for example in items
                if example.baseline_score is not None
                and example.score != example.baseline_score
            ]
        total = len(items)
        page = items[query.offset :]
        if query.limit is not None:
            page = page[: query.limit]
        return ExamplesPage(items=page, total=total)


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
        detail = make_dataset_detail(dataset_id)
        # Examples live on their own paged endpoint: the detail stays metadata-sized.
        return detail.model_copy(update={"examples": []}) if detail is not None else None

    async def list_dataset_examples(
        self, request: Request, dataset_id: str, query: ExamplesQuery
    ) -> DatasetExamplesPage:
        detail = make_dataset_detail(dataset_id)
        if detail is None:
            return DatasetExamplesPage(items=[], total=0)
        items = detail.examples
        if query.search:
            needle = query.search.strip().lower()
            items = [
                example
                for example in items
                if needle in example.input.lower() or needle in example.output.lower()
            ]
        total = len(items)
        page = items[query.offset :]
        if query.limit is not None:
            page = page[: query.limit]
        return DatasetExamplesPage(items=page, total=total)


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
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("demo_ml.app:app", host="127.0.0.1", port=port, reload=False)


if __name__ == "__main__":
    main()
