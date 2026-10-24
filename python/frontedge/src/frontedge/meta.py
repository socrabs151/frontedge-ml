"""Metadata: the public vocabularies and the capabilities of an installation.

The interface reads this to know what it may show; a tool (or an agent) reads it instead of
guessing from the configuration file.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

from .providers import (
    provider_accepts_query,
    provider_has_examples,
    provider_has_logs,
    provider_reads_artifacts,
)

__all__ = ["Capabilities", "Meta", "RunsCapabilities", "build_meta"]

ScreenName = Literal["runs", "run", "evals", "datasets"]


class RunsCapabilities(BaseModel):
    """What the runs provider can do beyond the two required methods."""

    query: bool
    logs: bool
    artifacts: bool
    examples: bool


class Capabilities(BaseModel):
    screens: list[ScreenName]
    actions: list[str]
    runs: RunsCapabilities
    evals: bool
    datasets: bool


class Meta(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    name: str
    version: str
    statuses: list[str]
    freshness: list[str]
    metric_directions: list[str]
    capabilities: Capabilities


def build_meta(
    *,
    runs: Any = None,
    evals: Any = None,
    datasets: Any = None,
    actions: Sequence[str] = (),
) -> Meta:
    """The vocabulary plus what this mount actually supports."""
    from . import __version__

    screens: list[ScreenName] = ["runs", "run"]
    if evals is not None:
        screens.append("evals")
    if datasets is not None:
        screens.append("datasets")

    return Meta(
        name="frontedge",
        version=__version__,
        statuses=["queued", "running", "succeeded", "failed", "cancelled", "lost"],
        freshness=["live", "fresh", "stale", "partial"],
        metric_directions=["maximize", "minimize", "none"],
        capabilities=Capabilities(
            screens=screens,
            actions=list(actions),
            runs=RunsCapabilities(
                query=runs is not None and provider_accepts_query(runs),
                logs=runs is not None and provider_has_logs(runs),
                artifacts=runs is not None and provider_reads_artifacts(runs),
                examples=runs is not None and provider_has_examples(runs),
            ),
            evals=evals is not None,
            datasets=datasets is not None,
        ),
    )
