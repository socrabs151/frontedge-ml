"""CLI Frontedge.

    frontedge gen --out apps/spike/src/generated
"""

from __future__ import annotations

import argparse
from pathlib import Path

from . import __version__
from .gen import generate_client, generate_types
from .config import ActionResult, ActionSpec, UiConfig
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

    args = parser.parse_args(argv)

    if args.command != "gen":
        parser.print_help()
        return 1

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


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
