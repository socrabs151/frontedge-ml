"""Демо: FastAPI-приложение с фейковым ML-бэкендом и смонтированным Frontedge.

    uv run demo-ml
    → http://127.0.0.1:8000/frontedge
"""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Sequence
from typing import Any

import uvicorn
from fastapi import FastAPI, Request

import frontedge
from frontedge.models import LogLine, Run

from .data import make_log_lines, make_runs


class DemoRepository:
    """Фейковый ML-бэкенд: прогоны в памяти."""

    def __init__(self) -> None:
        self.runs: list[Run] = make_runs(200)
        self.logs: dict[str, list[dict[str, Any]]] = {}

    def logs_for(self, run_id: str) -> list[dict[str, Any]]:
        if run_id not in self.logs:
            self.logs[run_id] = make_log_lines(80)
        return self.logs[run_id]


class DemoProvider:
    """Источник данных для Frontedge."""

    def __init__(self, repository: DemoRepository) -> None:
        self.repository = repository

    async def list_runs(self, request: Request) -> Sequence[Run]:
        return self.repository.runs

    async def get_run(self, request: Request, run_id: str) -> Run | None:
        return next((run for run in self.repository.runs if run.id == run_id), None)

    async def stream_logs(self, request: Request, run_id: str) -> AsyncIterator[LogLine]:
        """Логи приходят постепенно — как живой поток."""
        for line in self.repository.logs_for(run_id):
            yield LogLine.model_validate(line)
            await asyncio.sleep(0.15)


def create_app() -> FastAPI:
    app = FastAPI(title="frontedge demo", version="0.1.0")
    repository = DemoRepository()
    provider = DemoProvider(repository)

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(frontedge.runs(provider, mount="/frontedge", title="Frontedge — demo"))
    return app


app = create_app()


def main() -> None:
    uvicorn.run("demo_ml.app:app", host="127.0.0.1", port=8000, reload=False)


if __name__ == "__main__":
    main()
