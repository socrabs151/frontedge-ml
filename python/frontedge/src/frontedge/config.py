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

__all__ = [
    "ActionResult",
    "ActionSpec",
    "UiConfig",
    "load_config",
    "load_config_file",
]

Placement = Literal["runs", "run", "evals", "datasets"]


class ActionSpec(BaseModel):
    """Action description: what the interface shows."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

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


class UiConfig(BaseModel):
    """Project interface configuration."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    density: Literal["compact", "default", "comfortable"] | None = None
    theme: Literal["light", "dark"] | None = None
    run_columns: list[str] = Field(default_factory=list)
    eval_tabs: list[str] = Field(default_factory=list)
    actions: list[ActionSpec] = Field(default_factory=list)
    #: How often to refresh the run list, in seconds. 0 — never refresh.
    live_refresh_seconds: int = 5
    #: Default run for comparison (baseline).
    baseline_run: str | None = None
    #: How many runs to request at a time (server-side pagination).
    page_size: int = 50

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


def load_config(source: str | Path | dict[str, Any] | None) -> UiConfig:
    """Configuration from a file path or a dict. ``None`` — an empty configuration."""
    if source is None:
        return UiConfig()
    if isinstance(source, dict):
        return UiConfig.model_validate(source)
    return load_config_file(source)
