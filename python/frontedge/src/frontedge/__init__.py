"""Frontedge — фронтенд-слой для ML-инжиниринга.

    from fastapi import FastAPI
    import frontedge

    app = FastAPI()
    app.include_router(frontedge.mount(my_runs_provider))
"""

from .config import ActionResult, ActionSpec, UiConfig, load_config
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
    MetricEvent,
    MetricPoint,
    MetricDirection,
    ProvenanceEntry,
    Run,
    RunStatus,
    Stage,
    StageName,
    role,
)
from .providers import CallableProvider, DatasetProvider, EvalProvider, FrontedgeProvider
from .screens import mount, runs

__version__ = "0.1.0"

__all__ = [
    "ActionResult",
    "ActionSpec",
    "Artifact",
    "CallableProvider",
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
    "MetricPoint",
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
