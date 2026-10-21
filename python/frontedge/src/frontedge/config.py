"""Конфигурация интерфейса и действия.

Два объекта, из которых собирается продукт у пользователя:

* **конфигурация** — данные: какие колонки показывать, какие вкладки и действия
  видны. Лежит в TOML/JSON, поэтому её одинаково легко править руками, из кода
  и (позже) визуальным редактором;
* **действия** — код: обработчики, которые выполняются на бэкенде приложения.
  Библиотека только вызывает их и показывает результат.
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
    """Описание действия: что видно в интерфейсе."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    label: str
    placement: Placement = "run"
    danger: bool = False
    description: str | None = None


class ActionResult(BaseModel):
    """Ответ действия."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    ok: bool = True
    message: str | None = None
    data: dict[str, Any] = Field(default_factory=dict)


class UiConfig(BaseModel):
    """Конфигурация интерфейса проекта."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    density: Literal["compact", "default", "comfortable"] | None = None
    theme: Literal["light", "dark"] | None = None
    run_columns: list[str] = Field(default_factory=list)
    eval_tabs: list[str] = Field(default_factory=list)
    actions: list[ActionSpec] = Field(default_factory=list)

    def actions_for(self, placement: Placement) -> list[ActionSpec]:
        return [action for action in self.actions if action.placement == placement]


def load_config_file(path: str | Path) -> UiConfig:
    """Прочитать конфигурацию из TOML или JSON."""
    file = Path(path)
    if not file.is_file():
        raise FileNotFoundError(f"Файл конфигурации не найден: {file}")
    raw = file.read_bytes()
    if file.suffix == ".json":
        data = json.loads(raw.decode("utf-8"))
    else:
        data = tomllib.loads(raw.decode("utf-8"))
    return UiConfig.model_validate(data)


def load_config(source: str | Path | dict[str, Any] | None) -> UiConfig:
    """Конфигурация из пути к файлу или из словаря. ``None`` — пустая конфигурация."""
    if source is None:
        return UiConfig()
    if isinstance(source, dict):
        return UiConfig.model_validate(source)
    return load_config_file(source)
