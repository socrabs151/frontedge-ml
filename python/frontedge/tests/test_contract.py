"""Контрактные тесты публичного API пакета.

Каждый тест закрывает реальный дефект, найденный аудитом: неработающий
``frontedge.runs()``, неверное имя аргумента, HTML вместо 404 на несуществующем
API-пути, поток SSE, который умирал после первого keepalive.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import frontedge
from frontedge import Run, RunStatus
from frontedge.providers import adapt_provider
from frontedge.runtime.sse import event_stream
from frontedge.screens.runs import log_line


def make_run(**overrides: Any) -> Run:
    payload: dict[str, Any] = {
        "id": "run-000",
        "name": "exp-000",
        "status": RunStatus.succeeded,
        "dataset": "demo",
        "git_sha": "abc1234",
        "started_at": datetime.now(UTC),
        "duration_ms": 1000,
        "owner": "tester",
        "metrics": {"accuracy": 0.9},
        "series": {},
        "metric_direction": {},
        "stages": [],
    }
    payload.update(overrides)
    return Run(**payload)


async def runs_provider(request: Any) -> list[Run]:
    return [make_run()]


def client_for(provider: Any = runs_provider, **kwargs: Any) -> TestClient:
    app = FastAPI()
    app.include_router(frontedge.mount(provider, **kwargs))
    return TestClient(app)


class TestPublicApi:
    def test_mount_accepts_provider(self) -> None:
        router = frontedge.mount(runs_provider)
        assert router is not None

    def test_runs_shortcut_works(self) -> None:
        """Раньше параметр ``mount`` перекрывал функцию ``mount`` — TypeError."""
        router = frontedge.runs(runs_provider)
        assert router is not None

    def test_documented_keyword(self) -> None:
        """В README пример: ``frontedge.mount(runs_provider=...)``."""
        router = frontedge.mount(runs_provider=runs_provider)
        assert router is not None

    def test_log_line_helper_builds_valid_model(self) -> None:
        line = log_line("что-то пошло не так", "error")
        assert line.id > 0
        assert line.text == "что-то пошло не так"
        assert line.level == "error"

    def test_provider_without_stream_logs_is_accepted(self) -> None:
        class Minimal:
            async def list_runs(self, request: Any) -> list[Run]:
                return [make_run()]

            async def get_run(self, request: Any, run_id: str) -> Run | None:
                return make_run()

        assert adapt_provider(Minimal()) is not None


class TestHttp:
    def test_runs_list(self) -> None:
        response = client_for().get("/frontedge/api/runs")
        assert response.status_code == 200
        assert response.json()[0]["name"] == "exp-000"

    def test_json_is_camel_case(self) -> None:
        payload = client_for().get("/frontedge/api/runs").json()[0]
        assert "startedAt" in payload
        assert "durationMs" in payload
        assert "started_at" not in payload

    def test_unknown_api_path_returns_404_json(self) -> None:
        """SPA-fallback не должен отдавать HTML на несуществующий путь API."""
        response = client_for().get("/frontedge/api/typo")
        assert response.status_code == 404
        assert "application/json" in response.headers["content-type"]

    def test_mount_path_is_substituted_into_html(self) -> None:
        """Интерфейс должен знать свой префикс: иначе ассеты и API ищутся в /frontedge."""
        response = client_for(path="/ml").get("/ml/")
        assert response.status_code == 200
        assert '__FRONTEDGE_MOUNT__ = "/ml"' in response.text

    def test_log_stream_url_follows_mount_path(self) -> None:
        payload = client_for(path="/ml").get("/ml/api/runs").json()[0]
        assert payload["logStreamUrl"] == "/ml/api/runs/run-000/logs/stream"

    def test_unknown_run_returns_404(self) -> None:
        class Empty:
            async def list_runs(self, request: Any) -> list[Run]:
                return []

            async def get_run(self, request: Any, run_id: str) -> Run | None:
                return None

        response = client_for(Empty()).get("/frontedge/api/runs/run-000")
        assert response.status_code == 404

    def test_meta_lists_statuses(self) -> None:
        meta = client_for().get("/frontedge/api/meta").json()
        assert "failed" in meta["statuses"]
        assert "lost" in meta["statuses"]

    def test_runs_support_pagination(self) -> None:
        response = client_for().get("/frontedge/api/runs?limit=5&offset=0")
        assert response.status_code == 200
        assert len(response.json()) == 1
        assert response.headers["X-Frontedge-Total"] == "1"

    def test_runs_filter_by_status(self) -> None:
        payload = client_for().get("/frontedge/api/runs?status=succeeded").json()
        assert all(run["status"] == "succeeded" for run in payload)

    def test_artifact_content_requires_provider_support(self) -> None:
        response = client_for().get("/frontedge/api/artifacts/art-1/content")
        assert response.status_code == 404

    def test_artifact_content_is_served(self) -> None:
        async def read_artifact(request: Any, artifact_id: str) -> bytes:
            return f"bytes of {artifact_id}".encode()

        class WithArtifacts:
            async def list_runs(self, request: Any) -> list[Run]:
                return [make_run()]

            async def get_run(self, request: Any, run_id: str) -> Run | None:
                return make_run()

            async def read_artifact(self, request: Any, artifact_id: str) -> bytes:
                return await read_artifact(request, artifact_id)

        app = FastAPI()
        app.include_router(frontedge.mount(WithArtifacts()))
        response = TestClient(app).get("/frontedge/api/artifacts/art-1/content")
        assert response.status_code == 200
        assert b"art-1" in response.content

    def test_error_reason_reaches_the_client(self) -> None:
        failed = make_run(status=RunStatus.failed, error="CUDA out of memory", exit_code=1)

        class Failing:
            async def list_runs(self, request: Any) -> list[Run]:
                return [failed]

            async def get_run(self, request: Any, run_id: str) -> Run | None:
                return failed

        app = FastAPI()
        app.include_router(frontedge.mount(Failing()))
        payload = TestClient(app).get("/frontedge/api/runs").json()[0]
        assert payload["error"] == "CUDA out of memory"
        assert payload["exitCode"] == 1


class TestSse:
    def test_stream_survives_keepalive(self) -> None:
        """Поток не должен умирать после паузы длиннее keepalive."""

        async def scenario() -> list[str]:
            chunks: list[str] = []

            async def source() -> Any:
                yield ("log", {"i": 0})
                await asyncio.sleep(1.2)
                yield ("log", {"i": 1})

            async def collect() -> None:
                async for chunk in event_stream(source(), keepalive=0.3):
                    chunks.append(chunk)

            await asyncio.wait_for(collect(), timeout=10)
            return chunks

        chunks = asyncio.run(scenario())
        assert any(": keepalive" in chunk for chunk in chunks)
        assert any('"i": 1' in chunk for chunk in chunks), "события после keepalive не дошли"


class TestConfigAndActions:
    def test_config_is_served(self) -> None:
        app = FastAPI()
        app.include_router(
            frontedge.mount(
                runs_provider,
                config={
                    "density": "compact",
                    "run_columns": ["name", "status"],
                    "actions": [
                        {"id": "stop", "label": "Остановить", "placement": "run", "danger": True}
                    ],
                },
            )
        )
        payload = TestClient(app).get("/frontedge/api/config").json()
        assert payload["density"] == "compact"
        assert payload["runColumns"] == ["name", "status"]
        assert payload["actions"][0]["id"] == "stop"

    def test_action_runs_the_handler(self) -> None:
        seen: dict[str, Any] = {}

        async def stop(request: Any, payload: dict[str, Any]) -> Any:
            seen.update(payload)
            return frontedge.ActionResult(ok=True, message="остановлен")

        app = FastAPI()
        app.include_router(frontedge.mount(runs_provider, actions={"stop": stop}))
        response = TestClient(app).post("/frontedge/api/actions/stop", json={"runId": "run-000"})
        assert response.status_code == 200
        assert response.json()["message"] == "остановлен"
        assert seen["runId"] == "run-000"

    def test_unknown_action_returns_404(self) -> None:
        app = FastAPI()
        app.include_router(frontedge.mount(runs_provider))
        response = TestClient(app).post("/frontedge/api/actions/nope", json={})
        assert response.status_code == 404

    def test_config_from_toml_file(self, tmp_path: Any) -> None:
        file = tmp_path / "frontedge.toml"
        file.write_text(
            'density = "compact"\n\n'
            "[[actions]]\n"
            'id = "export"\n'
            'label = "Экспорт"\n'
            'placement = "runs"\n',
            encoding="utf-8",
        )
        app = FastAPI()
        app.include_router(frontedge.mount(runs_provider, config=file))
        payload = TestClient(app).get("/frontedge/api/config").json()
        assert payload["actions"][0]["placement"] == "runs"


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(pytest.main([__file__]))
