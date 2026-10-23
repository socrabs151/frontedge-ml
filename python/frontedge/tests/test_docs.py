"""The documentation is part of the contract: its examples must still parse and run.

Nothing here executes a snippet — a guide is not a test suite. The point is cheaper and still
useful: a Python block compiles, a TOML block loads and, when it is a Frontedge configuration,
validates; a documented CLI command exists with its flags.

The design document is excluded: it describes the plan, including commands that do not exist yet.
"""

from __future__ import annotations

import ast
import re
import tomllib
from pathlib import Path

import pytest

from frontedge.cli import build_parser
from frontedge.config import UiConfig

ROOT = Path(__file__).resolve().parents[3]
DOCS = [
    "README.md",
    "README.ru.md",
    "AGENTS.md",
    "CONTRIBUTING.md",
    "docs/integration.md",
    "packages/ui/README.md",
    "python/frontedge/README.md",
]
FENCE = re.compile(r"```(\w*)\r?\n(.*?)```", re.DOTALL)
CONFIG_KEYS = set(UiConfig.model_fields)


def blocks(language: str) -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []
    for name in DOCS:
        text = (ROOT / name).read_text(encoding="utf-8")
        for match in FENCE.finditer(text):
            if match.group(1) == language:
                found.append((name, match.group(2)))
    return found


@pytest.mark.parametrize(("name", "source"), blocks("python"), ids=lambda value: str(value)[:40])
def test_python_snippets_compile(name: str, source: str) -> None:
    try:
        ast.parse(source)
    except SyntaxError as error:  # pragma: no cover - the message is the assertion
        pytest.fail(f"{name}: Python example does not compile: {error}")


@pytest.mark.parametrize(("name", "source"), blocks("toml"), ids=lambda value: str(value)[:40])
def test_toml_snippets_load(name: str, source: str) -> None:
    try:
        data = tomllib.loads(source)
    except tomllib.TOMLDecodeError as error:  # pragma: no cover - the message is the assertion
        pytest.fail(f"{name}: TOML example does not load: {error}")

    if CONFIG_KEYS & set(data):
        UiConfig.model_validate(data)


def documented_commands() -> list[tuple[str, list[str]]]:
    """Every shell command from the guides that calls the CLI, with its arguments."""
    commands: list[tuple[str, list[str]]] = []
    for language in ("bash", "sh"):
        for name, source in blocks(language):
            for line in source.splitlines():
                code = line.split("#", 1)[0].strip()
                match = re.search(r"\bfrontedge\s+(gen|schema|check)\b(.*)", code)
                if not match:
                    continue
                rest = match.group(2).strip().strip("`").strip()
                commands.append((f"{name}: {line.strip()}", [match.group(1), *rest.split()]))
    return commands


@pytest.mark.parametrize(
    ("label", "arguments"), documented_commands(), ids=lambda value: str(value)[:50]
)
def test_documented_commands_exist(label: str, arguments: list[str]) -> None:
    """Every guide command parses against the real parser, so a rename cannot strand the docs."""
    try:
        build_parser().parse_args(arguments)
    except SystemExit as error:  # an unknown flag or command exits 2
        assert error.code == 0, f"{label}: the parser rejected the documented command"


def test_there_are_examples_to_check() -> None:
    """A guard against a silent zero-parametrisation if the markup changes."""
    languages: dict[str, int] = {
        language: len(blocks(language)) for language in ("python", "toml")
    }
    assert languages["python"] > 0
    assert languages["toml"] > 0


def test_capabilities_are_documented() -> None:
    text = (ROOT / "docs/integration.md").read_text(encoding="utf-8")
    for marker in ("capabilities", "runs.query", "artifacts", "detail"):
        assert marker in text, f"docs/integration.md lost the {marker} contract"


def test_every_doc_file_exists() -> None:
    for name in DOCS:
        assert (ROOT / name).is_file(), name


def test_help_lists_every_command() -> None:
    help_text = build_parser().format_help()
    for command in ("gen", "schema", "check"):
        assert command in help_text


def test_docs_use_the_fe_prefixed_tokens() -> None:
    """A guide showing `--surface` would teach the collision the prefix removed."""
    tokens = re.findall(
        r"^\s*--fe-([a-z0-9-]+):",
        (ROOT / "packages/ui/src/styles/tokens.css").read_text(encoding="utf-8"),
        re.MULTILINE,
    )
    for name in DOCS:
        text = (ROOT / name).read_text(encoding="utf-8")
        for token in tokens:
            assert not re.search(rf"--{token}(?![a-z0-9-])", text), (
                f"{name}: uses the unprefixed token --{token}"
            )
