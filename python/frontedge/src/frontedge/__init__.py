"""Frontedge — фронтенд-слой для ML-инжиниринга.

    from fastapi import FastAPI
    import frontedge

    app = FastAPI()
    app.include_router(frontedge.runs(runs_provider=my_provider))
"""

from .models import (
    Artifact,
    Example,
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
)
from .providers import CallableProvider, FrontedgeProvider
from .screens import run_detail, runs

__version__ = "0.1.0"

__all__ = [
    "Artifact",
    "CallableProvider",
    "Example",
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
    "__version__",
    "run_detail",
    "runs",
]
