"""Frontedge — the frontend layer for ML engineering.

    from fastapi import FastAPI
    import frontedge

    app = FastAPI()
    app.include_router(frontedge.mount(my_runs_provider))
"""

from .config import ActionResult, ActionSpec, ColumnSpec, MetricSpec, UiConfig, load_config
from .models import (
    Artifact,
    DatasetDetail,
    DatasetInfo,
    EvalComparison,
    EvalSummary,
    Example,
    ExampleResult,
    Freshness,
    LogLine,
    MetricDirection,
    MetricEvent,
    MetricPoint,
    ProvenanceEntry,
    Run,
    RunStatus,
    Stage,
    StageName,
    role,
)
from .providers import (
    CallableProvider,
    DatasetProvider,
    EvalProvider,
    FrontedgeProvider,
    ProviderError,
)
from .screens import mount, runs

__version__ = "0.1.1"

__all__ = [
    "ActionResult",
    "ActionSpec",
    "Artifact",
    "CallableProvider",
    "ColumnSpec",
    "DatasetDetail",
    "DatasetInfo",
    "DatasetProvider",
    "EvalComparison",
    "EvalProvider",
    "EvalSummary",
    "Example",
    "ExampleResult",
    "Freshness",
    "FrontedgeProvider",
    "LogLine",
    "MetricDirection",
    "MetricEvent",
    "MetricSpec",
    "MetricPoint",
    "ProviderError",
    "ProvenanceEntry",
    "Run",
    "RunStatus",
    "Stage",
    "StageName",
    "UiConfig",
    "load_config",
    "__version__",
    "mount",
    "role",
    "runs",
]
