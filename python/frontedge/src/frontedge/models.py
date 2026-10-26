"""The Frontedge domain model.

The model is fixed by the product: the user writes an adapter (provider) that
returns these objects. The ``x-frontedge`` roles in the schema are a public
contract: the type generator uses them to know how to render a field.
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
    "RunOption",
    "RunStatus",
    "Stage",
    "StageName",
    "role",
]


def role(name: str, **extra: Any) -> dict[str, Any]:
    """Field annotation: its role in the interface plus extra parameters."""
    return {"x-frontedge": {"role": name, **extra}}


class RunStatus(StrEnum):
    """Canonical run statuses.

    ``failed`` — the process finished with a non-zero exit code.
    ``lost`` — the process vanished: the infrastructure died. The two are not
    merged, triage relies on the difference.
    """

    queued = "queued"
    running = "running"
    succeeded = "succeeded"
    failed = "failed"
    cancelled = "cancelled"
    lost = "lost"


class Freshness(StrEnum):
    """Data freshness — a separate dimension on top of the status."""

    live = "live"
    fresh = "fresh"
    stale = "stale"
    partial = "partial"


class StageName(StrEnum):
    """Canonical stage names: a starting point, not a closed vocabulary.

    ``Stage.name`` is a plain string, so a project keeps ``tokenize``, ``embed`` or ``deploy``.
    The interface draws the name as a caption and never switches on it.
    """

    prepare = "prepare"
    train = "train"
    eval = "eval"
    publish = "publish"


class MetricDirection(StrEnum):
    """Metric direction: set by the owner, not by the interface."""

    maximize = "maximize"
    minimize = "minimize"
    none = "none"


#: Known kinds of an artifact. The field is a string: a project may have its own.
ArtifactKind = str
#: Known log levels. The field is a string: an unknown level still renders, with its raw name.
LogLevel = str


class FrontedgeModel(BaseModel):
    """Base model: JSON is served in camelCase, like in the TypeScript types."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class MetricPoint(FrontedgeModel):
    step: int = Field(description="Training step", json_schema_extra=role("series"))
    value: float = Field(json_schema_extra=role("metric"))


class MetricEvent(FrontedgeModel):
    stage: str
    step: int
    label: str
    kind: Literal["regression", "checkpoint", "notice"] = "notice"


class Stage(FrontedgeModel):
    #: ``StageName`` values are the canonical ones; any other step name is allowed.
    name: str
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


class ArtifactMeta(FrontedgeModel):
    """What a range or conditional request needs to know before the bytes are read."""

    size: int
    filename: str | None = None
    media_type: str = "application/octet-stream"
    etag: str | None = None
    last_modified: datetime | None = None


class ProvenanceEntry(FrontedgeModel):
    label: str
    value: str
    mono: bool = False


class Run(FrontedgeModel):
    """An experiment run."""

    id: str = Field(json_schema_extra=role("id"))
    name: str = Field(json_schema_extra=role("text"))
    status: RunStatus = Field(json_schema_extra=role("status"))
    freshness: Freshness = Field(default=Freshness.fresh, json_schema_extra=role("freshness"))
    # Empty when the project has no dataset, no git metadata or no owner: the interface shows
    # an en dash instead of forcing an adapter to invent a value.
    dataset: str = Field(default="", json_schema_extra=role("dataset"))
    git_sha: str = Field(default="", json_schema_extra=role("code"))
    #: A queued run may have neither: the interface shows an en dash instead of inventing time.
    started_at: datetime | None = Field(default=None, json_schema_extra=role("timestamp"))
    duration_ms: int | None = Field(default=None, json_schema_extra=role("duration"))
    owner: str = ""
    #: Free labels of the project ("production", "nightly"): filtered by, shown as chips.
    tags: list[str] = Field(default_factory=list)
    seed: int | None = None
    #: The run configuration (learning rate, batch size, ...): JSON values, shown in Config.
    params: dict[str, Any] = Field(default_factory=dict)
    error: str | None = Field(default=None, json_schema_extra=role("text"))
    exit_code: int | None = None
    metrics: dict[str, float] = Field(json_schema_extra=role("metric"))
    series: dict[str, list[MetricPoint]]
    baseline_series: dict[str, list[MetricPoint]] = Field(default_factory=dict)
    metric_direction: dict[str, MetricDirection] = Field(default_factory=dict)
    stages: list[Stage] = Field(json_schema_extra=role("stage"))
    events: list[MetricEvent] = Field(default_factory=list)
    artifacts: list[Artifact] = Field(default_factory=list)
    provenance: list[ProvenanceEntry] = Field(default_factory=list)


class RunOption(FrontedgeModel):
    """A compact run entry for the baseline and comparison pickers: no series, no stages."""

    id: str
    name: str
    status: RunStatus
    dataset: str = ""
    started_at: datetime | None = None
    tags: list[str] = Field(default_factory=list)


class Example(FrontedgeModel):
    """A dataset slice: input, output, expectation and score."""

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

# --- Evals and datasets ---------------------------------------------------


class EvalSummary(FrontedgeModel):
    """An eval: dataset × scorer × metric.

    A bare "score" without a scorer is meaningless: a leaderboard column is a
    triple (dataset, scorer, aggregation).
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
    """The eval result for a single example."""

    id: str = Field(json_schema_extra=role("id"))
    input: str = Field(json_schema_extra=role("text"))
    output: str = Field(json_schema_extra=role("text"))
    expected: str | None = Field(default=None, json_schema_extra=role("text"))
    reference_score: float | None = Field(default=None, json_schema_extra=role("metric"))
    comparison_score: float | None = Field(default=None, json_schema_extra=role("metric"))
    changed: bool


class ExamplesQuery(FrontedgeModel):
    """A page of examples; a provider may apply it instead of the library."""

    offset: int = 0
    limit: int | None = None
    changed: bool = False
    search: str | None = None


class ExamplesPage(FrontedgeModel):
    """A page of run examples with the total count — when the provider pages itself."""

    items: list[Example]
    total: int


class DatasetExamplesPage(FrontedgeModel):
    """A page of dataset examples with the filtered total."""

    items: list[ExampleResult]
    total: int


class EvalComparison(FrontedgeModel):
    """Comparison of two runs on one eval: examples as rows."""

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


class RunsQuery(FrontedgeModel):
    """Run selection parameters.

    A provider can take them as the second argument of ``list_runs(request, query)``
    and filter on its own side. If it does not, the library applies the selection.
    """

    limit: int | None = None
    offset: int = 0
    search: str | None = None
    status: list[str] = Field(default_factory=list)
    dataset: str | None = None
    tag: str | None = None
    #: A column id (known field or metric) and its direction. Sent to the provider.
    sort: str | None = None
    order: Literal["asc", "desc"] = "desc"


class RunsPage(FrontedgeModel):
    """A page of runs with the total count — when the provider filters itself."""

    items: list[Run]
    total: int


class DatasetInfo(FrontedgeModel):
    """A dataset: version, size, datasheet and provenance."""

    id: str = Field(json_schema_extra=role("id"))
    name: str = Field(json_schema_extra=role("text"))
    version: str = Field(json_schema_extra=role("text"))
    examples_count: int
    created_at: datetime | None = None
    tags: list[str]
    datasheet: list[ProvenanceEntry]
    provenance: list[ProvenanceEntry] = Field(default_factory=list)


class DatasetDetail(DatasetInfo):
    #: Optional for a provider that serves examples through its own paged method.
    examples: list[ExampleResult] = Field(default_factory=list)
