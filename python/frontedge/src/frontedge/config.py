"""Interface configuration and actions.

Two objects the user's product is built from:

* **config** — data: which columns to show, which tabs and actions are visible.
  It lives in TOML/JSON, so it is equally easy to edit by hand, from code and
  (later) in a visual editor;
* **actions** — code: handlers that run on the application backend.
  The library only calls them and shows the result.
"""

from __future__ import annotations

import json
import tomllib
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from .models import MetricDirection

__all__ = [
    "ActionResult",
    "ActionSpec",
    "ColumnSpec",
    "MetricSpec",
    "UiConfig",
    "load_config",
    "load_config_file",
]

Placement = Literal["runs", "run", "evals", "datasets"]


class ActionSpec(BaseModel):
    """Action description: what the interface shows."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    id: str
    label: str
    placement: Placement = "run"
    danger: bool = False
    description: str | None = None


class ActionResult(BaseModel):
    """Action response."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    ok: bool = True
    message: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)


class ColumnSpec(BaseModel):
    """A column of the runs table: how wide it starts and whether the user may resize it."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    id: str
    width: int | None = Field(default=None, ge=40, le=800)
    resizable: bool = True


class MetricSpec(BaseModel):
    """A metric of the project: what to call it and how to read it.

    The metric id is the key in ``Run.metrics``. Everything else is presentation: the interface
    already has the values, the direction and the series, but only the project knows that
    ``bleu`` is written "BLEU", has two digits and is better when it is higher.
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    id: str
    label: str | None = None
    digits: int | None = Field(default=None, ge=0, le=6)
    direction: MetricDirection | None = None
    #: Whether the run screen draws a chart for this metric (a card is always drawn).
    chart: bool = True


class UiConfig(BaseModel):
    """Project interface configuration."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    density: Literal["compact", "default", "comfortable"] | None = None
    theme: Literal["light", "dark"] | None = None
    run_columns: list[str] = Field(default_factory=list)
    #: Widths and resize locks per column id; the rest keep the built-in widths.
    columns: list[ColumnSpec] = Field(default_factory=list)
    #: Whether the table lets the user resize columns at all.
    column_resize: bool = True
    #: The metrics of the project. An empty list means "every metric a run returns".
    metrics: list[MetricSpec] = Field(default_factory=list)
    #: Which tabs the evaluation screen shows. An empty list means "all of them".
    eval_tabs: list[Literal["examples", "summary"]] = Field(default_factory=list)
    actions: list[ActionSpec] = Field(default_factory=list)
    #: How often to refresh the run list, in seconds. 0 — never refresh.
    live_refresh_seconds: int = Field(default=5, ge=0)
    #: Default run for comparison (baseline).
    baseline_run: str | None = None
    #: How many runs to request at a time (server-side pagination).
    page_size: int = Field(default=50, ge=1)

    def actions_for(self, placement: Placement) -> list[ActionSpec]:
        return [action for action in self.actions if action.placement == placement]


def load_config_file(path: str | Path) -> UiConfig:
    """Read the configuration from TOML or JSON."""
    file = Path(path)
    if not file.is_file():
        raise FileNotFoundError(f"Configuration file not found: {file}")
    raw = file.read_bytes()
    if file.suffix == ".json":
        data = json.loads(raw.decode("utf-8"))
    else:
        data = tomllib.loads(raw.decode("utf-8"))
    return UiConfig.model_validate(data)


def load_config(source: str | Path | dict[str, Any] | UiConfig | None) -> UiConfig:
    """Configuration from a ready object, a file path or a dict. ``None`` — empty."""
    if source is None:
        return UiConfig()
    if isinstance(source, UiConfig):
        return source
    if isinstance(source, dict):
        return UiConfig.model_validate(source)
    return load_config_file(source)
