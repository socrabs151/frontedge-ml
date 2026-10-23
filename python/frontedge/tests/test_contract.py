"""Contract tests for the public package API.

Every test closes a real defect the audit found: a broken ``frontedge.runs()``, a wrong
keyword name, HTML instead of 404 on an unknown API path, and an SSE stream that died
after the first keepalive.
"""

from __future__ import annotations

import asyncio
import json
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
        """The ``mount`` parameter used to shadow the ``mount`` function — TypeError."""
        router = frontedge.runs(runs_provider)
        assert router is not None

    def test_documented_keyword(self) -> None:
        """The documented call: ``frontedge.mount(runs_provider=...)``."""
        router = frontedge.mount(runs_provider=runs_provider)
        assert router is not None

    def test_log_line_helper_builds_valid_model(self) -> None:
        line = log_line("something went wrong", "error")
        assert line.id > 0
        assert line.text == "something went wrong"
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
        """The SPA fallback must not answer an unknown API path with HTML."""
        response = client_for().get("/frontedge/api/typo")
        assert response.status_code == 404
        assert "application/json" in response.headers["content-type"]

    def test_mount_path_is_substituted_into_html(self) -> None:
        """The interface must know its prefix, otherwise assets and the API are looked up under /frontedge."""
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
        """The stream must not die after a pause longer than the keepalive interval."""

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
        assert any('"i": 1' in chunk for chunk in chunks), "events after the keepalive never arrived"


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
                        {"id": "stop", "label": "Stop", "placement": "run", "danger": True}
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
            return frontedge.ActionResult(ok=True, message="stopped")

        app = FastAPI()
        app.include_router(frontedge.mount(runs_provider, actions={"stop": stop}))
        response = TestClient(app).post("/frontedge/api/actions/stop", json={"runId": "run-000"})
        assert response.status_code == 200
        assert response.json()["message"] == "stopped"
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
            'label = "Export"\n'
            'placement = "runs"\n',
            encoding="utf-8",
        )
        app = FastAPI()
        app.include_router(frontedge.mount(runs_provider, config=file))
        payload = TestClient(app).get("/frontedge/api/config").json()
        assert payload["actions"][0]["placement"] == "runs"


class TestMetaCapabilities:
    def test_function_provider_has_no_extra_capabilities(self) -> None:
        capabilities = client_for().get("/frontedge/api/meta").json()["capabilities"]
        assert capabilities["screens"] == ["runs", "run"]
        assert capabilities["runs"] == {"query": False, "logs": False, "artifacts": False}
        assert capabilities["evals"] is False
        assert capabilities["datasets"] is False
        assert capabilities["actions"] == []

    def test_full_provider_reports_every_capability(self) -> None:
        class Full:
            async def list_runs(self, request: Any, query: Any = None) -> list[Run]:
                return [make_run()]

            async def get_run(self, request: Any, run_id: str) -> Run | None:
                return make_run()

            async def stream_logs(self, request: Any, run_id: str) -> Any:
                yield log_line("hello")

            async def read_artifact(self, request: Any, artifact_id: str) -> bytes:
                return b"data"

        class EvalStub:
            async def list_evals(self, request: Any) -> list[Any]:
                return []

            async def compare_evals(self, request: Any, eval_id: str, reference: str, comparison: str) -> Any:
                return None

        class DatasetStub:
            async def list_datasets(self, request: Any) -> list[Any]:
                return []

            async def get_dataset(self, request: Any, dataset_id: str) -> Any:
                return None

        async def stop(request: Any, payload: dict[str, Any]) -> frontedge.ActionResult:
            return frontedge.ActionResult()

        app = FastAPI()
        app.include_router(
            frontedge.mount(
                Full(),
                evals=EvalStub(),
                datasets=DatasetStub(),
                actions={"stop": stop},
            )
        )
        capabilities = TestClient(app).get("/frontedge/api/meta").json()["capabilities"]
        assert capabilities["screens"] == ["runs", "run", "evals", "datasets"]
        assert capabilities["runs"] == {"query": True, "logs": True, "artifacts": True}
        assert capabilities["evals"] is True
        assert capabilities["datasets"] is True
        assert capabilities["actions"] == ["stop"]


class TestProviderContract:
    """A provider that breaks the types must say so, not fail with a 500."""

    def test_wrong_item_type_is_a_bad_gateway(self) -> None:
        class Broken:
            async def list_runs(self, request: Any) -> list[Any]:
                return ["nope"]

            async def get_run(self, request: Any, run_id: str) -> Any:
                return None

        response = client_for(Broken()).get("/frontedge/api/runs")
        assert response.status_code == 502
        assert "list_runs item 0 returned str, expected Run" in response.json()["detail"]

    def test_mapping_is_coerced_into_a_model(self) -> None:
        class Coarse:
            async def list_runs(self, request: Any) -> list[Any]:
                return [make_run().model_dump()]

            async def get_run(self, request: Any, run_id: str) -> Any:
                return make_run().model_dump()

        client = client_for(Coarse())
        assert client.get("/frontedge/api/runs").status_code == 200
        assert client.get("/frontedge/api/runs/run-000").status_code == 200

    def test_incomplete_mapping_names_the_field(self) -> None:
        class Broken:
            async def list_runs(self, request: Any) -> list[Any]:
                return [{"id": "run-000"}]

            async def get_run(self, request: Any, run_id: str) -> Any:
                return None

        detail = client_for(Broken()).get("/frontedge/api/runs").json()["detail"]
        assert "not a valid Run" in detail
        assert "name" in detail

    def test_wrong_log_line_becomes_a_visible_stream_error(self) -> None:
        class BrokenLogs:
            async def list_runs(self, request: Any) -> list[Run]:
                return [make_run()]

            async def get_run(self, request: Any, run_id: str) -> Run:
                return make_run()

            async def stream_logs(self, request: Any, run_id: str) -> Any:
                yield "not a line"

        response = client_for(BrokenLogs()).get("/frontedge/api/runs/run-000/logs/stream")
        assert response.status_code == 200
        assert "stream_logs returned str, expected LogLine" in response.text

    def test_artifact_of_the_wrong_type_is_a_bad_gateway(self) -> None:
        class BrokenArtifact:
            async def list_runs(self, request: Any) -> list[Run]:
                return [make_run()]

            async def get_run(self, request: Any, run_id: str) -> Run:
                return make_run()

            async def read_artifact(self, request: Any, artifact_id: str) -> str:
                return "not bytes"

        response = client_for(BrokenArtifact()).get("/frontedge/api/artifacts/a/content")
        assert response.status_code == 502
        assert "expected bytes" in response.json()["detail"]


class TestCli:
    """The commands an agent or a person runs before the server starts."""

    def test_schema_is_a_json_schema(self, capsys: Any) -> None:
        from frontedge.cli import main

        assert main(["schema"]) == 0
        schema = json.loads(capsys.readouterr().out)
        assert schema["title"] == "UiConfig"
        assert {"density", "theme", "run_columns", "actions"} <= set(schema["properties"])

    def test_check_accepts_a_valid_config(self, tmp_path: Any, capsys: Any) -> None:
        from frontedge.cli import main

        file = tmp_path / "frontedge.toml"
        file.write_text(
            'density = "compact"\n'
            'run_columns = ["name", "status"]\n\n'
            "[[actions]]\n"
            'id = "stop"\n'
            'label = "Stop"\n',
            encoding="utf-8",
        )
        assert main(["check", str(file)]) == 0
        out = capsys.readouterr().out
        assert "OK" in out
        assert "stop (run)" in out

    def test_check_names_a_typo_in_a_key(self, tmp_path: Any, capsys: Any) -> None:
        from frontedge.cli import main

        file = tmp_path / "frontedge.toml"
        file.write_text("page_sise = 10\n", encoding="utf-8")
        assert main(["check", str(file)]) == 1
        err = capsys.readouterr().err
        assert "page_sise" in err

    def test_check_reports_duplicate_action_ids(self, tmp_path: Any, capsys: Any) -> None:
        from frontedge.cli import main

        file = tmp_path / "frontedge.toml"
        file.write_text(
            "[[actions]]\n"
            'id = "stop"\n'
            'label = "Stop"\n\n'
            "[[actions]]\n"
            'id = "stop"\n'
            'label = "Stop again"\n',
            encoding="utf-8",
        )
        assert main(["check", str(file)]) == 1
        assert "duplicate action id: stop" in capsys.readouterr().err

    def test_check_json_mode(self, tmp_path: Any, capsys: Any) -> None:
        from frontedge.cli import main

        file = tmp_path / "frontedge.json"
        file.write_text('{"pageSize": 2}\n', encoding="utf-8")
        assert main(["check", str(file), "--json"]) == 0
        payload = json.loads(capsys.readouterr().out)
        assert payload["ok"] is True
        assert payload["config"]["page_size"] == 2

    def test_check_without_a_file(self, tmp_path: Any, capsys: Any, monkeypatch: Any) -> None:
        from frontedge.cli import main

        monkeypatch.chdir(tmp_path)
        assert main(["check"]) == 1
        assert "no configuration file found" in capsys.readouterr().err


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(pytest.main([__file__]))
