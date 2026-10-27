"""Contract tests for the public package API.

Every test closes a real defect the audit found: a broken ``frontedge.runs()``, a wrong
keyword name, HTML instead of 404 on an unknown API path, and an SSE stream that died
after the first keepalive.
"""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

import frontedge
from frontedge import Run, RunStatus
from frontedge.providers import adapt_provider
from frontedge.runtime.sse import event_stream
from frontedge.screens.runs import log_line

STATIC_INDEX = (
    Path(__file__).resolve().parents[1] / "src" / "frontedge" / "static" / "index.html"
)
# The built interface is generated, not stored: tests that read it skip on a source tree.
requires_interface = pytest.mark.skipif(
    not STATIC_INDEX.is_file(), reason="the interface is not built (run pnpm build:ui)"
)


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


def make_example(**overrides: Any) -> frontedge.Example:
    payload: dict[str, Any] = {
        "id": "ex-000",
        "input": "question",
        "output": "answer",
        "score": 0.5,
        "changed": False,
    }
    payload.update(overrides)
    return frontedge.Example(**payload)


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


class TestCustomMetrics:
    """A project's own metric is not a special case: it comes from the config and the data."""

    def test_metrics_reach_the_client(self, tmp_path: Any) -> None:
        file = tmp_path / "frontedge.toml"
        file.write_text(
            '[[metrics]]\nid = "bleu"\nlabel = "BLEU"\ndigits = 2\n',
            encoding="utf-8",
        )
        app = FastAPI()
        app.include_router(frontedge.mount(runs_provider, config=file))
        config = TestClient(app).get("/frontedge/api/config").json()
        assert config["metrics"] == [
            {"id": "bleu", "label": "BLEU", "digits": 2, "direction": None, "chart": True}
        ]

    def test_an_unknown_metric_key_is_rejected(self, tmp_path: Any) -> None:
        from frontedge.config import UiConfig

        with pytest.raises(ValidationError):
            UiConfig.model_validate({"metrics": [{"id": "bleu", "precision": 2}]})

    def test_metric_spec_is_in_the_schema(self) -> None:
        from frontedge.config import UiConfig

        schema = UiConfig.model_json_schema(by_alias=False)
        assert "metrics" in schema["properties"]
        assert "MetricSpec" in schema["$defs"]


class TestStaticCache:
    def test_hashed_assets_are_immutable(self) -> None:
        from frontedge.runtime.static import STATIC_DIR

        assets = sorted((STATIC_DIR / "assets").glob("*.js"))
        if not assets:
            pytest.skip("the interface is not built")
        response = client_for().get(f"/frontedge/assets/{assets[0].name}")
        assert response.status_code == 200
        assert response.headers["cache-control"] == "public, max-age=31536000, immutable"

    def test_the_document_is_not_cached(self) -> None:
        response = client_for().get("/frontedge/")
        assert response.headers["cache-control"] == "no-cache"

    @requires_interface
    def test_index_html_is_substituted_like_the_root(self) -> None:
        response = client_for().get("/frontedge/index.html")
        assert response.status_code == 200
        assert "@@FRONTEDGE_MOUNT@@" not in response.text
        assert "@@FRONTEDGE_TITLE@@" not in response.text
        assert 'content="/frontedge"' in response.text


class TestExamplePaging:
    def test_run_examples_are_paged(self) -> None:
        examples = [make_example(id=f"ex-{index:02d}") for index in range(45)]

        class WithExamples:
            async def list_runs(self, request: Any) -> list[Run]:
                return [make_run()]

            async def get_run(self, request: Any, run_id: str) -> Run | None:
                return make_run()

            async def list_examples(self, request: Any, run_id: str) -> list[Any]:
                return examples

        response = client_for(WithExamples()).get(
            "/frontedge/api/runs/run-000/examples?offset=20&limit=10"
        )
        assert [example["id"] for example in response.json()] == [
            f"ex-{index:02d}" for index in range(20, 30)
        ]
        assert response.headers["x-frontedge-total"] == "45"

    def test_changed_only_is_filtered_before_paging(self) -> None:
        examples = [
            make_example(id="ex-0", score=0.5, baseline_score=0.5),
            make_example(id="ex-1", score=0.7, baseline_score=0.5),
        ]

        class WithExamples:
            async def list_runs(self, request: Any) -> list[Run]:
                return [make_run()]

            async def get_run(self, request: Any, run_id: str) -> Run | None:
                return make_run()

            async def list_examples(self, request: Any, run_id: str) -> list[Any]:
                return examples

        response = client_for(WithExamples()).get(
            "/frontedge/api/runs/run-000/examples?changed=true"
        )
        assert [example["id"] for example in response.json()] == ["ex-1"]
        assert response.headers["x-frontedge-total"] == "1"

    def test_a_query_provider_pages_run_examples(self) -> None:
        seen: dict[str, Any] = {}

        class Paged:
            async def list_runs(self, request: Any) -> list[Run]:
                return [make_run()]

            async def get_run(self, request: Any, run_id: str) -> Run | None:
                return make_run()

            async def list_examples(
                self, request: Any, run_id: str, query: frontedge.ExamplesQuery
            ) -> frontedge.ExamplesPage:
                seen["query"] = query
                return frontedge.ExamplesPage(items=[make_example(id="ex-9")], total=999)

        response = client_for(Paged()).get(
            "/frontedge/api/runs/run-000/examples?offset=40&limit=5&changed=true"
        )
        assert response.status_code == 200
        assert [example["id"] for example in response.json()] == ["ex-9"]
        assert response.headers["x-frontedge-total"] == "999"
        assert seen["query"].offset == 40
        assert seen["query"].limit == 5
        assert seen["query"].changed is True

    def test_dataset_examples_query_provider_and_metadata_detail(self) -> None:
        seen: dict[str, Any] = {}

        class Datasets:
            async def list_datasets(self, request: Any) -> list[Any]:
                return []

            async def get_dataset(self, request: Any, dataset_id: str) -> Any:
                return frontedge.DatasetDetail(
                    id=dataset_id,
                    name="demo",
                    version="v1",
                    examples_count=20_000,
                    tags=[],
                    datasheet=[],
                    examples=[
                        frontedge.ExampleResult(
                            id="ex-0", input="a", output="b", changed=False
                        )
                    ],
                )

            async def list_dataset_examples(
                self, request: Any, dataset_id: str, query: frontedge.ExamplesQuery
            ) -> frontedge.DatasetExamplesPage:
                seen["query"] = query
                return frontedge.DatasetExamplesPage(
                    items=[
                        frontedge.ExampleResult(
                            id="ex-1", input="alpha", output="a", changed=False
                        )
                    ],
                    total=20_000,
                )

        client = client_for(datasets=Datasets())
        detail = client.get("/frontedge/api/datasets/d1").json()
        assert detail["examples"] == []
        assert detail["examplesCount"] == 20_000

        response = client.get(
            "/frontedge/api/datasets/d1/examples?offset=100&limit=20&search=alpha"
        )
        assert [example["id"] for example in response.json()] == ["ex-1"]
        assert response.headers["x-frontedge-total"] == "20000"
        assert seen["query"].offset == 100
        assert seen["query"].limit == 20
        assert seen["query"].search == "alpha"

    def test_dataset_examples_are_paged_and_searchable(self) -> None:
        rows = [
            frontedge.ExampleResult(id="ex-0", input="alpha", output="a", changed=False),
            frontedge.ExampleResult(id="ex-1", input="beta", output="b", changed=False),
            frontedge.ExampleResult(id="ex-2", input="alpha two", output="c", changed=False),
        ]

        class Datasets:
            async def list_datasets(self, request: Any) -> list[Any]:
                return []

            async def get_dataset(self, request: Any, dataset_id: str) -> Any:
                return frontedge.DatasetDetail(
                    id="d1",
                    name="demo",
                    version="v1",
                    examples_count=len(rows),
                    tags=[],
                    datasheet=[],
                    examples=rows,
                )

        response = client_for(datasets=Datasets()).get(
            "/frontedge/api/datasets/d1/examples?search=alpha&offset=1&limit=1"
        )
        assert [example["id"] for example in response.json()] == ["ex-2"]
        assert response.headers["x-frontedge-total"] == "2"


class TestScale:
    def test_the_list_returns_a_sparkline_not_the_full_series(self) -> None:
        points = [frontedge.MetricPoint(step=index, value=index / 100) for index in range(100)]
        run = make_run(
            series={"accuracy": points}, baseline_series={"accuracy": points}
        )

        async def series_provider(request: Any) -> list[Run]:
            return [run]

        client = client_for(series_provider)
        listed = client.get("/frontedge/api/runs").json()[0]
        detail = client.get("/frontedge/api/runs/run-000").json()
        assert len(listed["series"]["accuracy"]) == 24
        assert len(listed["baselineSeries"]["accuracy"]) == 24
        assert len(detail["series"]["accuracy"]) == 100
        assert listed["series"]["accuracy"][0]["step"] == 0
        assert listed["series"]["accuracy"][-1]["step"] == 99

    def test_ten_thousand_runs_page_and_pick(self) -> None:
        many = [make_run(id=f"run-{index:05d}", name=f"exp-{index:05d}") for index in range(10_000)]

        async def many_provider(request: Any) -> list[Run]:
            return many

        client = client_for(many_provider)
        response = client.get("/frontedge/api/runs?limit=50")
        assert len(response.json()) == 50
        assert response.headers["x-frontedge-total"] == "10000"
        assert len(client.get("/frontedge/api/runs/options?limit=1000").json()) == 1000


class TestFunctionProvider:
    def test_dicts_work_for_the_detail_too(self) -> None:
        async def provider(request: Any) -> list[Any]:
            return [make_run().model_dump()]

        response = client_for(provider).get("/frontedge/api/runs/run-000")
        assert response.status_code == 200
        assert response.json()["name"] == "exp-000"


class TestTags:
    def test_tags_default_to_empty(self) -> None:
        assert make_run().tags == []

    def test_the_list_filters_by_tag(self) -> None:
        async def tagged(request: Any) -> list[Run]:
            return [
                make_run(id="run-1", tags=["production"]),
                make_run(id="run-2", tags=["nightly"]),
            ]

        client = client_for(tagged)
        payload = client.get("/frontedge/api/runs?tag=production").json()
        assert [run["id"] for run in payload] == ["run-1"]
        assert client.get("/frontedge/api/runs?tag=production").headers["x-frontedge-total"] == "1"

    def test_options_carry_tags(self) -> None:
        async def tagged(request: Any) -> list[Run]:
            return [make_run(tags=["production"])]

        options = client_for(tagged).get("/frontedge/api/runs/options").json()
        assert options[0]["tags"] == ["production"]


class TestRunExtras:
    """The endpoints the interface needs beyond the run itself."""

    def test_examples_endpoint_returns_the_slice(self) -> None:
        class WithExamples:
            async def list_runs(self, request: Any) -> list[Run]:
                return [make_run()]

            async def get_run(self, request: Any, run_id: str) -> Run | None:
                return make_run()

            async def list_examples(self, request: Any, run_id: str) -> list[Any]:
                return [make_example()]

        payload = client_for(WithExamples()).get("/frontedge/api/runs/run-000/examples").json()
        assert payload[0]["id"] == "ex-000"

    def test_examples_endpoint_is_empty_without_the_method(self) -> None:
        response = client_for().get("/frontedge/api/runs/run-000/examples")
        assert response.status_code == 200
        assert response.json() == []

    def test_run_options_are_compact(self) -> None:
        options = client_for().get("/frontedge/api/runs/options").json()
        assert options[0]["id"] == "run-000"
        assert options[0]["name"] == "exp-000"
        assert "series" not in options[0]
        assert "stages" not in options[0]

    def test_run_options_honour_the_limit(self) -> None:
        async def many(request: Any) -> list[Run]:
            return [make_run(id=f"run-{index:03d}") for index in range(5)]

        options = client_for(many).get("/frontedge/api/runs/options?limit=2").json()
        assert [option["id"] for option in options] == ["run-000", "run-001"]


class TestOpenModel:
    """A project keeps its own stage names, and a queued run may have no time yet."""

    def test_a_custom_stage_name_is_allowed(self) -> None:
        run = make_run(
            stages=[
                frontedge.Stage(
                    name="tokenize",
                    status=RunStatus.succeeded,
                    started_at=datetime.now(UTC),
                )
            ]
        )
        assert run.stages[0].name == "tokenize"

    def test_a_queued_run_needs_no_time(self) -> None:
        run = make_run(status=RunStatus.queued, started_at=None, duration_ms=None)
        assert run.started_at is None
        assert run.duration_ms is None


class TestOptionalFields:
    """A project without git metadata, a dataset or an owner must not invent values."""

    def test_a_run_may_omit_dataset_git_and_owner(self) -> None:
        payload = make_run().model_dump()
        for field in ("dataset", "git_sha", "owner"):
            payload.pop(field)
        run = Run(**payload)
        assert (run.dataset, run.git_sha, run.owner) == ("", "", "")


class TestOpenVocabularies:
    def test_a_project_may_have_its_own_artifact_kind(self) -> None:
        artifact = frontedge.Artifact(id="a", name="model.bin", kind="model", size_bytes=1)
        assert artifact.kind == "model"

    def test_a_project_may_log_its_own_level(self) -> None:
        line = frontedge.LogLine(id=1, at=datetime.now(UTC), level="debug", text="x")
        assert line.level == "debug"


@requires_interface
class TestDocumentTitle:
    def test_the_mount_title_reaches_the_document(self) -> None:
        app = FastAPI()
        app.include_router(frontedge.mount(runs_provider, title="My ML"))
        response = TestClient(app).get("/frontedge/")
        assert response.status_code == 200
        assert "<title>My ML</title>" in response.text

    def test_the_title_is_escaped(self) -> None:
        app = FastAPI()
        app.include_router(frontedge.mount(runs_provider, title="<script>"))
        response = TestClient(app).get("/frontedge/")
        assert "<title>&lt;script&gt;</title>" in response.text


class TestColumnSpecs:
    """Widths and resize locks are configuration, and the user's own widths win at runtime."""

    def test_columns_reach_the_client(self, tmp_path: Any) -> None:
        file = tmp_path / "frontedge.toml"
        file.write_text(
            '[[columns]]\nid = "name"\nwidth = 150\n\n'
            '[[columns]]\nid = "status"\nresizable = false\n',
            encoding="utf-8",
        )
        app = FastAPI()
        app.include_router(frontedge.mount(runs_provider, config=file))
        config = TestClient(app).get("/frontedge/api/config").json()
        assert config["columns"] == [
            {"id": "name", "width": 150, "resizable": True},
            {"id": "status", "width": None, "resizable": False},
        ]
        assert config["columnResize"] is True

    def test_a_width_outside_the_bounds_is_rejected(self) -> None:
        from frontedge.config import UiConfig

        with pytest.raises(ValidationError):
            UiConfig.model_validate({"columns": [{"id": "name", "width": 10}]})

    def test_column_resize_can_be_switched_off(self) -> None:
        from frontedge.config import UiConfig

        assert UiConfig.model_validate({"column_resize": False}).column_resize is False

    def test_duplicate_column_specs_are_reported(self, tmp_path: Any, capsys: Any) -> None:
        from frontedge.cli import main

        file = tmp_path / "frontedge.toml"
        file.write_text('[[columns]]\nid = "name"\n\n[[columns]]\nid = "name"\n', encoding="utf-8")
        assert main(["check", str(file)]) == 1
        assert "duplicate column: name" in capsys.readouterr().err

    def test_a_duplicate_is_named_even_when_another_key_is_wrong(
        self, tmp_path: Any, capsys: Any
    ) -> None:
        from frontedge.cli import main

        file = tmp_path / "frontedge.toml"
        file.write_text(
            'density = "tiny"\n[[actions]]\nid = "stop"\n\n[[actions]]\nid = "stop"\n',
            encoding="utf-8",
        )
        assert main(["check", str(file)]) == 1
        errors = capsys.readouterr().err
        assert "duplicate action id: stop" in errors
        assert "density" in errors

    def test_an_unknown_column_is_a_warning(self, tmp_path: Any, capsys: Any) -> None:
        from frontedge.cli import main

        file = tmp_path / "frontedge.toml"
        file.write_text('run_columns = ["name", "acuracy"]\n', encoding="utf-8")
        assert main(["check", str(file)]) == 0
        assert "unknown column id: acuracy" in capsys.readouterr().err


class TestEvalTabs:
    """The evaluation screen's tabs are configuration, not screen code."""

    def test_eval_tabs_reach_the_client(self, tmp_path: Any) -> None:
        file = tmp_path / "frontedge.toml"
        file.write_text('eval_tabs = ["summary"]\n', encoding="utf-8")
        app = FastAPI()
        app.include_router(frontedge.mount(runs_provider, config=file))
        config = TestClient(app).get("/frontedge/api/config").json()
        assert config["evalTabs"] == ["summary"]

    def test_an_unknown_tab_is_rejected(self) -> None:
        from frontedge.config import UiConfig

        with pytest.raises(ValidationError):
            UiConfig.model_validate({"eval_tabs": ["charts"]})

    def test_the_schema_limits_the_tabs(self) -> None:
        from frontedge.config import UiConfig

        schema = UiConfig.model_json_schema(by_alias=False)
        definition = schema["properties"]["eval_tabs"]["items"]
        assert sorted(definition["enum"]) == ["examples", "summary"]


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

    @requires_interface
    def test_mount_path_is_substituted_into_html(self) -> None:
        """The prefix must reach the HTML, or assets and the API resolve under /frontedge."""
        response = client_for(path="/ml").get("/ml/")
        assert response.status_code == 200
        assert '<meta name="frontedge-mount" content="/ml"' in response.text

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

    def test_eval_comparison_carries_evidence(self) -> None:
        comparison = frontedge.EvalComparison(
            eval_id="e1",
            name="demo",
            dataset="d1",
            scorer="exact",
            metric="accuracy",
            direction=frontedge.MetricDirection.maximize,
            aggregate="mean",
            reference_run="r1",
            comparison_run="r2",
            reference_name="run one",
            comparison_name="run two",
            examples=[
                frontedge.ExampleResult(
                    id="ex-0",
                    input="question",
                    output="old",
                    expected="gold",
                    reference_output="reference answer",
                    comparison_output="comparison answer",
                    reference_score=0.4,
                    comparison_score=0.8,
                    changed=True,
                ),
                frontedge.ExampleResult(
                    id="ex-1",
                    input="question 2",
                    output="same",
                    reference_score=0.5,
                    comparison_score=0.5,
                    changed=False,
                ),
            ],
            reference_aggregate=0.45,
            comparison_aggregate=0.65,
            changed=1,
        )

        class Evals:
            async def list_evals(self, request: Any) -> list[Any]:
                return []

            async def compare_evals(
                self, request: Any, eval_id: str, reference: str, comparison_run: str
            ) -> frontedge.EvalComparison:
                return comparison

        payload = client_for(evals=Evals()).get(
            "/frontedge/api/evals/e1/compare?reference=r1&comparison=r2"
        )
        assert payload.status_code == 200, payload.text
        rows = payload.json()["examples"]
        assert rows[0]["referenceOutput"] == "reference answer"
        assert rows[0]["comparisonOutput"] == "comparison answer"
        assert rows[0]["expected"] == "gold"
        assert rows[1].get("referenceOutput") is None
        assert rows[1].get("expected") is None

    def test_run_params_reach_the_client(self) -> None:
        run = make_run(
            params={
                "learning_rate": 1e-4,
                "batch_size": 256,
                "fp16": True,
                "scheduler": {"name": "cosine"},
            }
        )

        class Params:
            async def list_runs(self, request: Any) -> list[Run]:
                return [run]

            async def get_run(self, request: Any, run_id: str) -> Run | None:
                return run

        client = client_for(Params())
        detail = client.get("/frontedge/api/runs/run-000").json()
        assert detail["params"]["batch_size"] == 256
        assert detail["params"]["scheduler"] == {"name": "cosine"}
        assert client.get("/frontedge/api/runs").json()[0]["params"]["fp16"] is True

    def test_runs_filter_by_status(self) -> None:
        payload = client_for().get("/frontedge/api/runs?status=succeeded").json()
        assert all(run["status"] == "succeeded" for run in payload)

    def test_runs_sort_by_metric_with_missing_last(self) -> None:
        class Sorted:
            async def list_runs(self, request: Any) -> list[Run]:
                return [
                    make_run(id="low", metrics={"accuracy": 0.5}),
                    make_run(id="high", metrics={"accuracy": 0.9}),
                    make_run(id="none", metrics={}),
                ]

            async def get_run(self, request: Any, run_id: str) -> Run | None:
                return None

        client = client_for(Sorted())
        desc = client.get("/frontedge/api/runs?sort=accuracy&order=desc&limit=3").json()
        assert [run["id"] for run in desc] == ["high", "low", "none"]
        asc = client.get("/frontedge/api/runs?sort=accuracy&order=asc&limit=3").json()
        assert [run["id"] for run in asc] == ["low", "high", "none"]

    def test_query_is_not_guessed_from_arity(self) -> None:
        """A keyword-only switch is not the selection: the provider still gets the bare list."""

        class KeywordOnly:
            async def list_runs(self, request: Any, *, include_archived: bool = False) -> list[Run]:
                return [
                    make_run(),
                    make_run(id="run-failed", status=RunStatus.failed),
                ]

            async def get_run(self, request: Any, run_id: str) -> Run | None:
                return None

        response = client_for(KeywordOnly()).get("/frontedge/api/runs?status=failed")
        assert response.status_code == 200
        assert [run["id"] for run in response.json()] == ["run-failed"]

    def test_query_is_detected_by_annotation_and_name(self) -> None:
        from frontedge.models import RunsQuery

        class Annotated:
            async def list_runs(self, request: Any, selection: RunsQuery) -> list[Run]:
                return [make_run(), make_run(id="run-running", status=RunStatus.running)]

            async def get_run(self, request: Any, run_id: str) -> Run | None:
                return None

        class Named:
            async def list_runs(self, request: Any, query: Any) -> list[Run]:
                return [make_run(id="run-query")]

            async def get_run(self, request: Any, run_id: str) -> Run | None:
                return None

        annotated = client_for(Annotated()).get("/frontedge/api/runs")
        named = client_for(Named()).get("/frontedge/api/runs")
        assert annotated.status_code == 200
        assert named.status_code == 200

    def test_runs_reject_invalid_selection(self) -> None:
        client = client_for()
        assert client.get("/frontedge/api/runs?sort=metrics").status_code == 422
        assert client.get("/frontedge/api/runs?sort=accuracy").status_code == 200
        assert client.get("/frontedge/api/runs?limit=0").status_code == 422
        assert client.get("/frontedge/api/runs?limit=1001").status_code == 422
        assert client.get("/frontedge/api/runs?offset=-1").status_code == 422
        assert client.get("/frontedge/api/runs?order=sideways").status_code == 422
        assert client.get("/frontedge/api/runs?status=exploded").status_code == 422

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

    def test_artifact_filename_is_sanitised(self) -> None:
        class WithArtifacts:
            async def list_runs(self, request: Any) -> list[Run]:
                return [make_run()]

            async def get_run(self, request: Any, run_id: str) -> Run | None:
                return make_run()

            async def read_artifact(self, request: Any, artifact_id: str) -> bytes:
                return b"data"

        app = FastAPI()
        app.include_router(frontedge.mount(WithArtifacts()))
        response = TestClient(app).get('/frontedge/api/artifacts/a%22b%0D%0AX/content')
        header = response.headers["content-disposition"]
        assert '"' not in header.removeprefix('attachment; filename="').removesuffix('"')
        assert "\r" not in header and "\n" not in header

    def test_bytes_artifact_supports_ranges_and_revalidation(self) -> None:
        class WithArtifacts:
            async def list_runs(self, request: Any) -> list[Run]:
                return [make_run()]

            async def get_run(self, request: Any, run_id: str) -> Run | None:
                return make_run()

            async def read_artifact(self, request: Any, artifact_id: str) -> bytes:
                return b"0123456789"

        app = FastAPI()
        app.include_router(frontedge.mount(WithArtifacts()))
        client = TestClient(app)
        path = "/frontedge/api/artifacts/art-1/content"

        full = client.get(path)
        assert full.status_code == 200
        assert full.content == b"0123456789"
        assert full.headers["accept-ranges"] == "bytes"
        assert full.headers["content-length"] == "10"
        assert full.headers["etag"].startswith('"')

        part = client.get(path, headers={"Range": "bytes=2-5"})
        assert part.status_code == 206
        assert part.content == b"2345"
        assert part.headers["content-range"] == "bytes 2-5/10"
        assert part.headers["content-length"] == "4"

        assert client.get(path, headers={"Range": "bytes=-3"}).content == b"789"
        assert client.get(path, headers={"Range": "bytes=8-"}).content == b"89"

        beyond = client.get(path, headers={"Range": "bytes=20-"})
        assert beyond.status_code == 416
        assert beyond.headers["content-range"] == "bytes */10"

        cached = client.get(path, headers={"If-None-Match": full.headers["etag"]})
        assert cached.status_code == 304

        head = client.head(path)
        assert head.status_code == 200
        assert head.content == b""
        assert head.headers["content-length"] == "10"

    def test_streamed_artifact_gets_the_range_and_the_meta(self) -> None:
        seen: dict[str, Any] = {}

        class Streaming:
            async def list_runs(self, request: Any) -> list[Run]:
                return [make_run()]

            async def get_run(self, request: Any, run_id: str) -> Run | None:
                return make_run()

            async def artifact_meta(
                self, request: Any, artifact_id: str
            ) -> frontedge.ArtifactMeta | None:
                if artifact_id != "art-1":
                    return None
                return frontedge.ArtifactMeta(
                    size=10,
                    filename="model.bin",
                    media_type="text/plain",
                    etag="v1",
                    last_modified=datetime(2026, 1, 1, tzinfo=UTC),
                )

            async def stream_artifact(
                self,
                request: Any,
                artifact_id: str,
                start: int = 0,
                end: int | None = None,
            ) -> Any:
                seen["range"] = (start, end)

                async def chunks() -> Any:
                    yield b"0123456789"[start:end]

                return chunks()

        app = FastAPI()
        app.include_router(frontedge.mount(Streaming()))
        client = TestClient(app)
        path = "/frontedge/api/artifacts/art-1/content"

        response = client.get(path, headers={"Range": "bytes=2-5"})
        assert response.status_code == 206
        assert response.content == b"2345"
        assert seen["range"] == (2, 6)
        assert response.headers["etag"] == '"v1"'
        assert response.headers["content-type"].startswith("text/plain")
        assert "model.bin" in response.headers["content-disposition"]
        assert response.headers["last-modified"].endswith("GMT")

        full = client.get(path)
        assert full.status_code == 200
        assert full.content == b"0123456789"
        assert seen["range"] == (0, 10)

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
        assert any('"i": 1' in chunk for chunk in chunks), (
            "events after the keepalive never arrived"
        )


class TestConfigAndActions:
    def test_config_is_served(self) -> None:
        async def stop(request: Any, payload: dict[str, Any]) -> Any:
            return frontedge.ActionResult(ok=True)

        app = FastAPI()
        app.include_router(
            frontedge.mount(
                runs_provider,
                actions={"stop": stop},
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
        app.include_router(
            frontedge.mount(
                runs_provider,
                actions={"stop": stop},
                config={"actions": [{"id": "stop", "label": "Stop"}]},
            )
        )
        response = TestClient(app).post("/frontedge/api/actions/stop", json={"runId": "run-000"})
        assert response.status_code == 200
        assert response.json()["message"] == "stopped"
        assert seen["runId"] == "run-000"

    def test_an_undeclared_handler_is_not_callable(self) -> None:
        async def internal(request: Any, payload: dict[str, Any]) -> Any:
            return frontedge.ActionResult(ok=True)

        app = FastAPI()
        app.include_router(frontedge.mount(runs_provider, actions={"internal": internal}))
        client = TestClient(app)
        assert client.post("/frontedge/api/actions/internal", json={}).status_code == 404
        assert client.get("/frontedge/api/meta").json()["capabilities"]["actions"] == []

    def test_unknown_action_returns_404(self) -> None:
        app = FastAPI()
        app.include_router(frontedge.mount(runs_provider))
        response = TestClient(app).post("/frontedge/api/actions/nope", json={})
        assert response.status_code == 404

    def test_a_failing_action_is_a_502_with_the_id(self) -> None:
        async def broken(request: Any, payload: dict[str, Any]) -> Any:
            raise RuntimeError("boom")

        app = FastAPI()
        app.include_router(
            frontedge.mount(
                runs_provider,
                actions={"stop": broken},
                config={"actions": [{"id": "stop", "label": "Stop"}]},
            )
        )
        response = TestClient(app).post("/frontedge/api/actions/stop", json={})
        assert response.status_code == 502
        assert "stop" in response.json()["detail"]

    def test_only_callable_actions_reach_the_browser(self) -> None:
        async def stop(request: Any, payload: dict[str, Any]) -> Any:
            return frontedge.ActionResult(ok=True)

        app = FastAPI()
        app.include_router(
            frontedge.mount(
                runs_provider,
                actions={"stop": stop},
                config={
                    "actions": [
                        {"id": "stop", "label": "Stop"},
                        {"id": "ghost", "label": "Ghost"},
                    ]
                },
            )
        )
        config = TestClient(app).get("/frontedge/api/config").json()
        assert [action["id"] for action in config["actions"]] == ["stop"]

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
        async def export(request: Any, payload: dict[str, Any]) -> Any:
            return frontedge.ActionResult(ok=True)

        app = FastAPI()
        app.include_router(
            frontedge.mount(runs_provider, actions={"export": export}, config=file)
        )
        payload = TestClient(app).get("/frontedge/api/config").json()
        assert payload["actions"][0]["placement"] == "runs"


class TestOpenApi:
    """The schema is a contract for tools that never read our TypeScript."""

    def schema_of(self, path: str) -> Any:
        spec = client_for().get("/openapi.json").json()
        return spec["paths"][f"/frontedge/api/{path}"]["get"]["responses"]["200"]["content"][
            "application/json"
        ]["schema"]

    def test_runs_list_is_typed(self) -> None:
        schema = self.schema_of("runs")
        assert schema["type"] == "array"
        assert schema["items"]["$ref"].endswith("/RunPayload")

    def test_run_detail_is_typed(self) -> None:
        assert self.schema_of("runs/{run_id}")["$ref"].endswith("/RunPayload")

    def test_meta_is_typed(self) -> None:
        assert self.schema_of("meta")["$ref"].endswith("/Meta")

    def test_config_is_typed(self) -> None:
        assert self.schema_of("config")["$ref"].endswith("/UiConfig")

    def test_components_have_properties(self) -> None:
        spec = client_for().get("/openapi.json").json()
        payload = spec["components"]["schemas"]["RunPayload"]
        assert {"id", "name", "status", "metrics", "logStreamUrl"} <= set(payload["properties"])
        meta = spec["components"]["schemas"]["Meta"]
        assert "capabilities" in meta["properties"]
        capabilities = spec["components"]["schemas"]["Capabilities"]
        assert {"screens", "actions", "runs"} <= set(capabilities["properties"])


class TestMetaCapabilities:
    def test_function_provider_has_no_extra_capabilities(self) -> None:
        capabilities = client_for().get("/frontedge/api/meta").json()["capabilities"]
        assert capabilities["screens"] == ["runs", "run"]
        assert capabilities["runs"] == {
            "query": False,
            "logs": False,
            "artifacts": False,
            "examples": False,
        }
        assert capabilities["evals"] is False
        assert capabilities["datasets"] is False
        assert capabilities["actions"] == []

    def test_an_object_provider_does_not_claim_what_it_lacks(self) -> None:
        """The adapter defines every optional method: the flags must come from the wrapped one."""

        class Minimal:
            async def list_runs(self, request: Any) -> list[Run]:
                return [make_run()]

            async def get_run(self, request: Any, run_id: str) -> Run | None:
                return make_run()

        capabilities = client_for(Minimal()).get("/frontedge/api/meta").json()["capabilities"]
        assert capabilities["runs"] == {
            "query": False,
            "logs": False,
            "artifacts": False,
            "examples": False,
        }

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

            async def list_examples(self, request: Any, run_id: str) -> list[Any]:
                return [make_example()]

        class EvalStub:
            async def list_evals(self, request: Any) -> list[Any]:
                return []

            async def compare_evals(
                self, request: Any, eval_id: str, reference: str, comparison: str
            ) -> Any:
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
                config={"actions": [{"id": "stop", "label": "Stop"}]},
            )
        )
        capabilities = TestClient(app).get("/frontedge/api/meta").json()["capabilities"]
        assert capabilities["screens"] == ["runs", "run", "evals", "datasets"]
        assert capabilities["runs"] == {
            "query": True,
            "logs": True,
            "artifacts": True,
            "examples": True,
        }
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


class TestProviderCheck:
    """`frontedge check --provider` calls the adapter the way the server will."""

    GOOD = """
from datetime import UTC, datetime
from frontedge import Run


def make():
    return Run(
        id="run-1", name="exp-1", status="succeeded", dataset="demo", git_sha="abc1234",
        started_at=datetime.now(UTC), duration_ms=10, owner="tester",
        metrics={}, series={}, metric_direction={}, stages=[],
    )


class Provider:
    async def list_runs(self, request, query=None):
        return [make()]

    async def get_run(self, request, run_id):
        return make()


provider = Provider()
"""

    BROKEN = """
class Provider:
    async def list_runs(self, request):
        return ["not a run"]

    async def get_run(self, request, run_id):
        return None


provider = Provider()
"""

    def install(self, monkeypatch: Any, tmp_path: Any, name: str, source: str) -> None:
        (tmp_path / f"{name}.py").write_text(source, encoding="utf-8")
        monkeypatch.syspath_prepend(str(tmp_path))
        monkeypatch.chdir(tmp_path)

    def test_good_provider_passes(self, tmp_path: Any, monkeypatch: Any, capsys: Any) -> None:
        from frontedge.cli import main

        self.install(monkeypatch, tmp_path, "provider_good", self.GOOD)
        assert main(["check", "--provider", "provider_good:provider"]) == 0
        out = capsys.readouterr().out
        assert "providers: OK" in out
        assert "list_runs: 1 run(s)" in out
        assert "query: yes" in out

    def test_broken_provider_names_the_method(
        self, tmp_path: Any, monkeypatch: Any, capsys: Any
    ) -> None:
        from frontedge.cli import main

        self.install(monkeypatch, tmp_path, "provider_broken", self.BROKEN)
        assert main(["check", "--provider", "provider_broken:provider"]) == 1
        err = capsys.readouterr().err
        assert "list_runs item 0 returned str" in err

    def test_unknown_module_is_a_clear_error(
        self, tmp_path: Any, monkeypatch: Any, capsys: Any
    ) -> None:
        from frontedge.cli import main

        monkeypatch.chdir(tmp_path)
        assert main(["check", "--provider", "no_such_module_xyz:provider"]) == 1
        assert "no_such_module_xyz" in capsys.readouterr().err

    def test_json_report(self, tmp_path: Any, monkeypatch: Any, capsys: Any) -> None:
        from frontedge.cli import main

        self.install(monkeypatch, tmp_path, "provider_json", self.GOOD)
        assert main(["check", "--provider", "provider_json:provider", "--json"]) == 0
        report = json.loads(capsys.readouterr().out)
        assert report["ok"] is True
        assert report["runs"] == 1


class TestInit:
    """`frontedge init` is the first command a newcomer runs."""

    def test_creates_a_runnable_project(self, tmp_path: Any) -> None:
        from frontedge.cli import main

        target = tmp_path / "dashboard"
        assert main(["init", str(target)]) == 0
        for name in ("app.py", "provider.py", "frontedge.toml", "README.md"):
            assert (target / name).is_file(), name
        config = frontedge.load_config(target / "frontedge.toml")
        assert config.metrics[0].id == "answer_score"
        assert "frontedge.mount" in (target / "app.py").read_text(encoding="utf-8")
        for name in ("app.py", "provider.py"):
            compile((target / name).read_text(encoding="utf-8"), name, "exec")

    def test_check_provider_finds_the_generated_instance(
        self, tmp_path: Any, monkeypatch: Any
    ) -> None:
        from frontedge.cli import main

        target = tmp_path / "dashboard"
        assert main(["init", str(target)]) == 0
        monkeypatch.chdir(target)
        assert main(["check", "--provider", "provider:provider"]) == 0

    def test_refuses_to_overwrite_without_force(self, tmp_path: Any, capsys: Any) -> None:
        from frontedge.cli import main

        target = tmp_path / "dashboard"
        assert main(["init", str(target)]) == 0
        assert main(["init", str(target)]) == 1
        assert "refusing to overwrite" in capsys.readouterr().err
        assert main(["init", str(target), "--force"]) == 0


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

    def test_check_reports_duplicate_eval_tabs(self, tmp_path: Any, capsys: Any) -> None:
        from frontedge.cli import main

        file = tmp_path / "frontedge.toml"
        file.write_text('eval_tabs = ["examples", "examples"]\n', encoding="utf-8")
        assert main(["check", str(file)]) == 1
        assert "duplicate tab: examples" in capsys.readouterr().err

    def test_check_reports_duplicate_metric_ids(self, tmp_path: Any, capsys: Any) -> None:
        from frontedge.cli import main

        file = tmp_path / "frontedge.toml"
        file.write_text(
            '[[metrics]]\nid = "bleu"\n\n[[metrics]]\nid = "bleu"\n',
            encoding="utf-8",
        )
        assert main(["check", str(file)]) == 1
        assert "duplicate metric id: bleu" in capsys.readouterr().err

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
