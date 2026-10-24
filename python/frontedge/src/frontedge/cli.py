"""CLI Frontedge.

    frontedge gen --out apps/spike/src/generated
    frontedge schema --out frontedge.schema.json
    frontedge check                    # reads ./frontedge.toml or ./frontedge.json
    frontedge check path/to/frontedge.toml --json
"""

from __future__ import annotations

import argparse
import asyncio
import importlib
import json
import sys
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from . import __version__
from .config import ActionResult, ActionSpec, ColumnSpec, MetricSpec, UiConfig, load_config_file
from .gen import generate_client, generate_types
from .models import DatasetDetail, DatasetInfo, EvalSummary, Run, RunsPage, RunsQuery
from .providers import (
    ProviderError,
    adapt_provider,
    as_model_or_none,
    as_models,
    provider_accepts_query,
    provider_has_logs,
    provider_reads_artifacts,
)
from .models import (
    Artifact,
    DatasetDetail,
    DatasetInfo,
    EvalComparison,
    EvalSummary,
    Example,
    ExampleResult,
    LogLine,
    MetricPoint,
    Run,
    RunOption,
    Stage,
)

MODELS = [
    Run,
    RunOption,
    Stage,
    MetricPoint,
    Artifact,
    Example,
    ExampleResult,
    LogLine,
    EvalSummary,
    EvalComparison,
    DatasetInfo,
    DatasetDetail,
    UiConfig,
    ActionSpec,
    ActionResult,
    ColumnSpec,
    MetricSpec,
]

DEFAULT_CONFIG_NAMES = ("frontedge.toml", "frontedge.json")

INIT_TOML = """\
# Frontedge configuration. `frontedge check` validates it; `frontedge schema` prints its schema.

density = "default"
theme = "light"

# The columns of the run list: known ids plus your own metric ids.
run_columns = ["name", "status", "ribbon", "dataset", "startedAt", "durationMs", "answer_score"]

# The run screen draws a card for every metric here, and a chart when the run has a series.
[[metrics]]
id = "answer_score"
label = "Answer score"
direction = "maximize"
digits = 3
"""

INIT_PROVIDER = '''\
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
'''

INIT_APP = '''\
"""A Frontedge dashboard in one file.

    uvicorn app:app --reload
    open http://127.0.0.1:8000/frontedge
"""

from pathlib import Path

import frontedge
from fastapi import FastAPI

from provider import Provider

CONFIG = Path(__file__).with_name("frontedge.toml")

app = FastAPI(title="My ML dashboard")
app.include_router(
    frontedge.mount(
        Provider(),
        config=CONFIG,
        path="/frontedge",
        title="My ML dashboard",
    )
)
'''

INIT_README = """\
# My Frontedge dashboard

1. Install Frontedge (not on PyPI yet): `pip install ./python/frontedge` from a repository
   checkout, after `pnpm build:ui`.
2. Run the app: `uvicorn app:app --reload`.
3. Open http://127.0.0.1:8000/frontedge.

`provider.py` is the only file that talks to your data: replace the sample runs in `list_runs`
and `get_run`. `frontedge.toml` decides the columns, the metrics and the actions; check it with
`frontedge check`.

The full contract is in `docs/integration.md` of the Frontedge repository.
"""

INIT_FILES = {
    "frontedge.toml": INIT_TOML,
    "provider.py": INIT_PROVIDER,
    "app.py": INIT_APP,
    "README.md": INIT_README,
}


def _gen(args: argparse.Namespace) -> int:
    models = MODELS
    if args.models:
        models = []
        for spec in args.models:
            module_name, _, class_name = spec.partition(":")
            module = __import__(module_name, fromlist=[class_name])
            models.append(getattr(module, class_name))

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "types.ts").write_text(generate_types(models), encoding="utf-8")
    (out / "client.ts").write_text(generate_client(base_path=args.base_path), encoding="utf-8")
    print(f"frontedge: types and client written to {out}")
    return 0


def _init(args: argparse.Namespace) -> int:
    """Write a minimal FastAPI project that already shows the interface."""
    target = Path(args.path)
    existing = [name for name in INIT_FILES if (target / name).exists()]
    if existing and not args.force:
        print(
            f"frontedge: refusing to overwrite in {target}: {', '.join(existing)} "
            "(pass --force to replace them)",
            file=sys.stderr,
        )
        return 1
    target.mkdir(parents=True, exist_ok=True)
    for name, content in INIT_FILES.items():
        (target / name).write_text(content, encoding="utf-8")
    print(f"frontedge: created {len(INIT_FILES)} files in {target}")
    print("  run: uvicorn app:app --reload")
    print("  open: http://127.0.0.1:8000/frontedge")
    print("  then replace the sample runs in provider.py with your data")
    return 0


def _schema(args: argparse.Namespace) -> int:
    """Print the JSON Schema of the configuration file.

    ``by_alias=False``: the file uses snake_case keys, unlike the HTTP payloads.
    """
    schema = UiConfig.model_json_schema(by_alias=False)
    text = json.dumps(schema, indent=2, ensure_ascii=False)
    if args.out:
        Path(args.out).write_text(f"{text}\n", encoding="utf-8")
        print(f"frontedge: schema written to {args.out}")
    else:
        print(text)
    return 0


def _config_path(requested: str | None) -> Path:
    if requested:
        return Path(requested)
    for name in DEFAULT_CONFIG_NAMES:
        candidate = Path(name)
        if candidate.is_file():
            return candidate
    raise FileNotFoundError(
        "no configuration file found: pass a path or create frontedge.toml"
    )


def _config_problems(path: Path) -> list[dict[str, str]]:
    """Validate the file and return problems as {field, message} pairs."""
    try:
        config = load_config_file(path)
    except FileNotFoundError as error:
        return [{"field": "", "message": str(error)}]
    except (ValueError, ValidationError) as error:
        if isinstance(error, ValidationError):
            return [
                {"field": ".".join(str(part) for part in item["loc"]), "message": item["msg"]}
                for item in error.errors()
            ]
        return [{"field": "", "message": str(error)}]

    problems: list[dict[str, str]] = []
    seen_actions: set[str] = set()
    for index, action in enumerate(config.actions):
        if not action.id.strip():
            problems.append({"field": f"actions.{index}.id", "message": "the id is empty"})
        elif action.id in seen_actions:
            problems.append(
                {"field": f"actions.{index}.id", "message": f"duplicate action id: {action.id}"}
            )
        seen_actions.add(action.id)

    seen_columns: set[str] = set()
    for index, column in enumerate(config.run_columns):
        if column in seen_columns:
            problems.append(
                {"field": f"run_columns.{index}", "message": f"duplicate column: {column}"}
            )
        seen_columns.add(column)

    seen_column_specs: set[str] = set()
    for index, column in enumerate(config.columns):
        if not column.id.strip():
            problems.append({"field": f"columns.{index}.id", "message": "the id is empty"})
        elif column.id in seen_column_specs:
            problems.append(
                {"field": f"columns.{index}.id", "message": f"duplicate column: {column.id}"}
            )
        seen_column_specs.add(column.id)

    seen_eval_tabs: set[str] = set()
    for index, tab in enumerate(config.eval_tabs):
        if tab in seen_eval_tabs:
            problems.append(
                {"field": f"eval_tabs.{index}", "message": f"duplicate tab: {tab}"}
            )
        seen_eval_tabs.add(tab)

    seen_metrics: set[str] = set()
    for index, metric in enumerate(config.metrics):
        if not metric.id.strip():
            problems.append({"field": f"metrics.{index}.id", "message": "the id is empty"})
        elif metric.id in seen_metrics:
            problems.append(
                {"field": f"metrics.{index}.id", "message": f"duplicate metric id: {metric.id}"}
            )
        seen_metrics.add(metric.id)
    return problems


def _describe(config_path: Path, config: UiConfig) -> str:
    actions = ", ".join(
        f"{action.id} ({action.placement}{', danger' if action.danger else ''})"
        for action in config.actions
    )
    columns = ", ".join(config.run_columns) if config.run_columns else "built-in defaults"
    lines = [
        f"{config_path}: OK",
        f"  density: {config.density or 'default'}",
        f"  theme: {config.theme or 'light'}",
        f"  run columns: {columns}",
        f"  eval tabs: {', '.join(config.eval_tabs) or 'built-in defaults'}",
        f"  actions: {actions or 'none'}",
        f"  live refresh: {config.live_refresh_seconds}s",
        f"  baseline: {config.baseline_run or 'selected in the interface'}",
        f"  page size: {config.page_size}",
    ]
    return "\n".join(lines)


def _load_object(spec: str) -> Any:
    """``module:attribute`` (a dotted attribute is allowed) from the current directory."""
    module_name, _, attribute = spec.partition(":")
    if not module_name or not attribute:
        raise ValueError(f"expected module:attribute, got {spec!r}")
    module = importlib.import_module(module_name)
    target: Any = module
    for part in attribute.split("."):
        target = getattr(target, part)
    return target


def _dummy_request() -> Any:
    """A request with no body and no app: enough for headers, query and path."""
    from starlette.requests import Request

    async def receive() -> dict[str, Any]:
        return {"type": "http.disconnect"}

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": "/",
        "raw_path": b"/",
        "query_string": b"",
        "root_path": "",
        "headers": [],
        "client": ("127.0.0.1", 0),
        "server": ("localhost", 8000),
    }
    return Request(scope, receive)


async def _provider_report(args: argparse.Namespace) -> dict[str, Any]:
    """Call the provider the way the server will and validate every answer."""
    request = _dummy_request()
    errors: list[dict[str, str]] = []
    report: dict[str, Any] = {"query": False, "logs": False, "artifacts": False}

    try:
        provider = adapt_provider(_load_object(args.provider))
    except Exception as error:  # noqa: BLE001 - the message is the product here
        return {"ok": False, "errors": [{"field": "provider", "message": str(error)}]}

    report["query"] = provider_accepts_query(provider)
    report["logs"] = provider_has_logs(provider)
    report["artifacts"] = provider_reads_artifacts(provider)

    try:
        runs = as_models(await provider.list_runs(request), Run, "list_runs")
        report["runs"] = len(runs)
        if report["query"]:
            page = await provider.list_runs(request, RunsQuery(limit=1))  # type: ignore[call-arg]
            items = page.items if isinstance(page, RunsPage) else page
            as_models(items, Run, "list_runs(request, query)")

        wanted = args.run_id or (runs[0].id if runs else None)
        if wanted:
            run = as_model_or_none(await provider.get_run(request, wanted), Run, "get_run")
            if run is None:
                if args.run_id:
                    errors.append(
                        {"field": "get_run", "message": f"returned None for {args.run_id}"}
                    )
            else:
                report["run"] = run.id
    except ProviderError as error:
        errors.append({"field": "runs", "message": str(error)})

    if args.evals:
        try:
            evals = _load_object(args.evals)
            report["evals"] = len(
                as_models(await evals.list_evals(request), EvalSummary, "list_evals")
            )
        except (ProviderError, AttributeError, ImportError) as error:
            errors.append({"field": "evals", "message": str(error)})

    if args.datasets:
        try:
            datasets = _load_object(args.datasets)
            listed = as_models(
                await datasets.list_datasets(request), DatasetInfo, "list_datasets"
            )
            report["datasets"] = len(listed)
            if listed:
                detail = as_model_or_none(
                    await datasets.get_dataset(request, listed[0].id),
                    DatasetDetail,
                    "get_dataset",
                )
                if detail is None:
                    errors.append(
                        {
                            "field": "get_dataset",
                            "message": f"returned None for {listed[0].id}",
                        }
                    )
        except (ProviderError, AttributeError, ImportError) as error:
            errors.append({"field": "datasets", "message": str(error)})

    return {"ok": not errors, "errors": errors, **report}


def _print_provider_report(report: dict[str, Any]) -> None:
    def flag(name: str) -> str:
        return "yes" if report.get(name) else "no"

    print("providers: OK" if report["ok"] else "providers: problem(s)")
    if "runs" in report:
        print(f"  list_runs: {report['runs']} run(s)")
    if "run" in report:
        print(f"  get_run: {report['run']}")
    print(f"  query: {flag('query')}")
    print(f"  logs: {flag('logs')}")
    print(f"  artifacts: {flag('artifacts')}")
    if report.get("evals") is not None:
        print(f"  evals: {report['evals']}")
    if report.get("datasets") is not None:
        print(f"  datasets: {report['datasets']}")
    for error in report["errors"]:
        print(f"  - {error['field']}: {error['message']}", file=sys.stderr)


def _check_providers(args: argparse.Namespace) -> int:
    report = asyncio.run(_provider_report(args))
    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        _print_provider_report(report)
    return 0 if report["ok"] else 1


def _check(args: argparse.Namespace) -> int:
    if args.provider:
        status = _check_providers(args)
        if status != 0:
            return status
        # A provider that answers is half the check; the configuration is the other half.
        try:
            path = _config_path(args.path)
        except FileNotFoundError:
            return 0
        args.path = str(path)

    try:
        path = _config_path(args.path)
    except FileNotFoundError as error:
        if args.json:
            print(json.dumps({"ok": False, "errors": [{"field": "", "message": str(error)}]}))
        else:
            print(f"frontedge: {error}", file=sys.stderr)
        return 1

    problems = _config_problems(path)
    if problems:
        if args.json:
            print(json.dumps({"ok": False, "path": str(path), "errors": problems}, indent=2))
        else:
            print(f"{path}: {len(problems)} problem(s)", file=sys.stderr)
            for problem in problems:
                prefix = f"{problem['field']}: " if problem["field"] else ""
                print(f"  - {prefix}{problem['message']}", file=sys.stderr)
        return 1

    config = load_config_file(path)
    if args.json:
        print(
            json.dumps(
                {"ok": True, "path": str(path), "config": config.model_dump(mode="json")},
                indent=2,
                ensure_ascii=False,
            )
        )
    else:
        print(_describe(path, config))
    return 0


def build_parser() -> argparse.ArgumentParser:
    """The parser is public so a test can check that the documented commands exist."""
    parser = argparse.ArgumentParser(prog="frontedge", description="Frontedge tools")
    parser.add_argument("--version", action="version", version=f"frontedge {__version__}")
    sub = parser.add_subparsers(dest="command")

    gen = sub.add_parser("gen", help="generate TypeScript types and a client")
    gen.add_argument("--out", default="src/generated", help="directory for the generated files")
    gen.add_argument(
        "--base-path",
        default="/frontedge/api",
        help="API base path (default /frontedge/api)",
    )
    gen.add_argument(
        "--models",
        nargs="*",
        default=None,
        help="custom models: module:ClassName (default — built-in)",
    )

    init = sub.add_parser("init", help="create a minimal FastAPI project with the interface")
    init.add_argument(
        "path",
        nargs="?",
        default=".",
        help="directory to create (default: the current one)",
    )
    init.add_argument("--force", action="store_true", help="overwrite existing files")

    schema = sub.add_parser("schema", help="print the JSON Schema of frontedge.toml")
    schema.add_argument("--out", default=None, help="write to a file instead of stdout")

    check = sub.add_parser("check", help="validate a configuration file or a provider")
    check.add_argument(
        "path",
        nargs="?",
        default=None,
        help="frontedge.toml or frontedge.json (default: the one in the current directory)",
    )
    check.add_argument(
        "--provider",
        default=None,
        metavar="MODULE:OBJECT",
        help="call a runs provider and validate its answers before the server starts",
    )
    check.add_argument("--evals", default=None, metavar="MODULE:OBJECT")
    check.add_argument("--datasets", default=None, metavar="MODULE:OBJECT")
    check.add_argument(
        "--run-id",
        default=None,
        help="which run to fetch from the provider (default: the first listed)",
    )
    check.add_argument("--json", action="store_true", help="machine-readable output")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "gen":
        return _gen(args)
    if args.command == "init":
        return _init(args)
    if args.command == "schema":
        return _schema(args)
    if args.command == "check":
        return _check(args)

    parser.print_help()
    return 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
