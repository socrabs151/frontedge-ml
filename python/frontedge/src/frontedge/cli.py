"""CLI Frontedge.

    frontedge gen --out apps/spike/src/generated
    frontedge schema --out frontedge.schema.json
    frontedge check                    # reads ./frontedge.toml or ./frontedge.json
    frontedge check path/to/frontedge.toml --json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from . import __version__
from .config import ActionResult, ActionSpec, UiConfig, load_config_file
from .gen import generate_client, generate_types
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
    Stage,
)

MODELS = [
    Run,
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
]

DEFAULT_CONFIG_NAMES = ("frontedge.toml", "frontedge.json")


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


def _check(args: argparse.Namespace) -> int:
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


def main(argv: list[str] | None = None) -> int:
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

    schema = sub.add_parser("schema", help="print the JSON Schema of frontedge.toml")
    schema.add_argument("--out", default=None, help="write to a file instead of stdout")

    check = sub.add_parser("check", help="validate a configuration file")
    check.add_argument(
        "path",
        nargs="?",
        default=None,
        help="frontedge.toml or frontedge.json (default: the one in the current directory)",
    )
    check.add_argument("--json", action="store_true", help="machine-readable output")

    args = parser.parse_args(argv)

    if args.command == "gen":
        return _gen(args)
    if args.command == "schema":
        return _schema(args)
    if args.command == "check":
        return _check(args)

    parser.print_help()
    return 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
