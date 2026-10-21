"""Доменная модель Frontedge.

Модель фиксирована продуктом: пользователь пишет адаптер (provider), который отдаёт
эти объекты. Роли ``x-frontedge`` в схеме — публичный контракт: по ним генератор
типов понимает, как показывать поле в интерфейсе.
"""

from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

__all__ = [
    "Artifact",
    "ArtifactKind",
    "Example",
    "Freshness",
    "LogLine",
    "LogLevel",
    "MetricDirection",
    "MetricEvent",
    "MetricPoint",
    "ProvenanceEntry",
    "Run",
    "RunStatus",
    "Stage",
    "StageName",
    "role",
]


def role(name: str, **extra: Any) -> dict[str, Any]:
    """Аннотация поля: роль в интерфейсе и её дополнительные параметры."""
    return {"x-frontedge": {"role": name, **extra}}


class RunStatus(StrEnum):
    """Канонические статусы прогона.

    ``failed`` — процесс завершился с ненулевым кодом выхода.
    ``lost`` — процесс исчез: умерла инфраструктура. Различие не сливается,
    по нему ведут триаж.
    """

    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"
    cancelled = "cancelled"
    lost = "lost"


class Freshness(StrEnum):
    """Свежесть данных — отдельное измерение поверх статуса."""

    live = "live"
    fresh = "fresh"
    stale = "stale"
    partial = "partial"


class StageName(StrEnum):
    prepare = "prepare"
    train = "train"
    eval = "eval"
    publish = "publish"


class MetricDirection(StrEnum):
    """Направление метрики: задаёт владелец, а не интерфейс."""

    maximize = "maximize"
    minimize = "minimize"
    none = "none"


ArtifactKind = Literal["checkpoint", "log", "report", "dataset", "figure"]
LogLevel = Literal["info", "progress", "warning", "error"]


class FrontedgeModel(BaseModel):
    """Базовая модель: JSON отдаётся в camelCase, как в TypeScript-типах."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class MetricPoint(FrontedgeModel):
    step: int = Field(description="Шаг обучения", json_schema_extra=role("series"))
    value: float = Field(json_schema_extra=role("metric"))


class MetricEvent(FrontedgeModel):
    stage: StageName
    step: int
    label: str
    kind: Literal["regression", "checkpoint", "notice"] = "notice"


class Stage(FrontedgeModel):
    name: StageName
    status: RunStatus
    started_at: datetime
    ended_at: datetime | None = None


class Artifact(FrontedgeModel):
    id: str = Field(json_schema_extra=role("id"))
    name: str = Field(json_schema_extra=role("text"))
    kind: ArtifactKind = "report"
    size_bytes: int
    created_at: datetime | None = None
    content_url: str | None = None


class ProvenanceEntry(FrontedgeModel):
    label: str
    value: str
    mono: bool = False


class Run(FrontedgeModel):
    """Прогон эксперимента."""

    id: str = Field(json_schema_extra=role("id"))
    name: str = Field(json_schema_extra=role("text"))
    status: RunStatus = Field(json_schema_extra=role("status"))
    freshness: Freshness = Field(default=Freshness.fresh, json_schema_extra=role("freshness"))
    dataset: str = Field(json_schema_extra=role("dataset"))
    git_sha: str = Field(json_schema_extra=role("code"))
    started_at: datetime = Field(json_schema_extra=role("timestamp"))
    duration_ms: int = Field(json_schema_extra=role("duration"))
    owner: str
    seed: int | None = None
    metrics: dict[str, float] = Field(json_schema_extra=role("metric"))
    series: dict[str, list[MetricPoint]]
    baseline_series: dict[str, list[MetricPoint]] = Field(default_factory=dict)
    metric_direction: dict[str, MetricDirection] = Field(default_factory=dict)
    stages: list[Stage] = Field(json_schema_extra=role("stage"))
    events: list[MetricEvent] = Field(default_factory=list)
    artifacts: list[Artifact] = Field(default_factory=list)
    provenance: list[ProvenanceEntry] = Field(default_factory=list)


class Example(FrontedgeModel):
    """Срез датасета: вход, выход, ожидание и оценка."""

    id: str = Field(json_schema_extra=role("id"))
    input: str = Field(json_schema_extra=role("text"))
    output: str = Field(json_schema_extra=role("text"))
    expected: str | None = None
    score: float = Field(json_schema_extra=role("metric"))
    baseline_score: float | None = None


class LogLine(FrontedgeModel):
    id: int
    at: datetime
    level: LogLevel
    text: str = Field(json_schema_extra=role("text"))


MetricValue = Annotated[float, Field(json_schema_extra=role("metric"))]

# --- Оценки и датасеты ---------------------------------------------------


class EvalSummary(FrontedgeModel):
    """Оценка: датасет × скорер × метрика.

    Скаляр «score» без скорера бессмыслен: столбец лидерборда — это тройка
    (датасет, скорер, агрегация).
    """

    id: str = Field(json_schema_extra=role("id"))
    name: str = Field(json_schema_extra=role("text"))
    dataset: str = Field(json_schema_extra=role("dataset"))
    scorer: str = Field(json_schema_extra=role("text"))
    metric: str = Field(json_schema_extra=role("text"))
    direction: MetricDirection
    aggregate: Literal["mean", "fraction"]
    runs: int = 0
    updated_at: datetime | None = None


class ExampleResult(FrontedgeModel):
    """Результат оценки на одном примере."""

    id: str = Field(json_schema_extra=role("id"))
    input: str = Field(json_schema_extra=role("text"))
    output: str = Field(json_schema_extra=role("text"))
    expected: str | None = Field(default=None, json_schema_extra=role("text"))
    reference_score: float | None = Field(default=None, json_schema_extra=role("metric"))
    comparison_score: float | None = Field(default=None, json_schema_extra=role("metric"))
    changed: bool


class EvalComparison(FrontedgeModel):
    """Сравнение двух прогонов по одной оценке: примеры как строки."""

    eval_id: str = Field(json_schema_extra=role("id"))
    name: str = Field(json_schema_extra=role("text"))
    dataset: str = Field(json_schema_extra=role("dataset"))
    scorer: str = Field(json_schema_extra=role("text"))
    metric: str = Field(json_schema_extra=role("text"))
    direction: MetricDirection
    aggregate: Literal["mean", "fraction"]
    reference_run: str = Field(json_schema_extra=role("id"))
    comparison_run: str = Field(json_schema_extra=role("id"))
    reference_name: str = Field(json_schema_extra=role("text"))
    comparison_name: str = Field(json_schema_extra=role("text"))
    examples: list[ExampleResult]
    reference_aggregate: float
    comparison_aggregate: float
    changed: int


class DatasetInfo(FrontedgeModel):
    """Датасет: версия, размер, datasheet и провенанс."""

    id: str = Field(json_schema_extra=role("id"))
    name: str = Field(json_schema_extra=role("text"))
    version: str = Field(json_schema_extra=role("text"))
    examples_count: int
    created_at: datetime | None = None
    tags: list[str]
    datasheet: list[ProvenanceEntry]
    provenance: list[ProvenanceEntry] = Field(default_factory=list)


class DatasetDetail(DatasetInfo):
    examples: list[ExampleResult]
