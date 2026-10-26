"""The bridge between your data and Frontedge.

Replace the bodies of ``list_runs`` and ``get_run`` with a query to your database. The interface
only needs the models: metrics, a series for the sparklines, stages for the ribbon.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Sequence
from datetime import UTC, datetime, timedelta

from fastapi import Request

from frontedge import (
    LogLine,
    MetricDirection,
    MetricPoint,
    Run,
    RunStatus,
    Stage,
    StageName,
)


def _sample_runs() -> list[Run]:
    """Two runs to look at. Delete this function together with the sample in ``list_runs``."""
    started = datetime.now(UTC) - timedelta(minutes=42)
    stages = [
        Stage(
            name=StageName.prepare,
            status=RunStatus.succeeded,
            started_at=started,
            ended_at=started + timedelta(seconds=40),
        ),
        Stage(
            name=StageName.train,
            status=RunStatus.succeeded,
            started_at=started + timedelta(seconds=40),
            ended_at=started + timedelta(seconds=100),
        ),
        Stage(
            name=StageName.eval,
            status=RunStatus.succeeded,
            started_at=started + timedelta(seconds=100),
            ended_at=started + timedelta(seconds=130),
        ),
    ]
    series = [
        MetricPoint(step=step, value=round(0.66 + step * 0.0025, 4))
        for step in range(40)
    ]
    return [
        Run(
            id="run-001",
            name="baseline",
            status=RunStatus.succeeded,
            dataset="demo",
            git_sha="",
            started_at=started,
            duration_ms=130_000,
            owner="",
            params={
                "learning_rate": 3e-4,
                "batch_size": 128,
                "optimizer": "adamw",
            },
            metrics={"answer_score": 0.66},
            series={"answer_score": series},
            metric_direction={"answer_score": MetricDirection.maximize},
            stages=stages,
        ),
        Run(
            id="run-002",
            name="candidate",
            status=RunStatus.succeeded,
            dataset="demo",
            git_sha="",
            started_at=started + timedelta(minutes=5),
            duration_ms=155_000,
            owner="",
            params={
                "learning_rate": 1e-4,
                "batch_size": 256,
                "optimizer": "adamw",
                "fp16": True,
            },
            metrics={"answer_score": 0.76},
            series={"answer_score": [MetricPoint(step=p.step, value=round(p.value + 0.08, 4)) for p in series]},
            metric_direction={"answer_score": MetricDirection.maximize},
            stages=stages,
        ),
    ]


class Provider:
    async def list_runs(self, request: Request) -> Sequence[Run]:
        # TODO: return the runs of your project. `request` is here for authorisation.
        return _sample_runs()

    async def get_run(self, request: Request, run_id: str) -> Run | None:
        return next((run for run in _sample_runs() if run.id == run_id), None)

    async def stream_logs(self, request: Request, run_id: str) -> AsyncIterator[LogLine]:
        for index, text in enumerate(["loading", "running", "done"]):
            yield LogLine(id=index + 1, at=datetime.now(UTC), level="info", text=text)
