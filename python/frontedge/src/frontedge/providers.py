"""Data sources for the Frontedge screens.

The user passes a provider — an object with ``list_runs`` / ``get_run`` /
``stream_logs`` methods, or a plain async function returning a list of runs.
The library knows nothing about authentication: ``request`` is passed to the
provider, the decision stays with the user's application.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable, Iterable, Mapping, Sequence
from typing import Any, Protocol, TypeVar, runtime_checkable

from fastapi import Request
from pydantic import BaseModel, ValidationError

from .models import (
    ArtifactMeta,
    DatasetDetail,
    DatasetInfo,
    EvalComparison,
    EvalSummary,
    Example,
    ExamplesQuery,
    LogLine,
    Run,
    RunsQuery,
)

__all__ = [
    "CallableProvider",
    "DatasetProvider",
    "EvalProvider",
    "FrontedgeProvider",
    "ProviderError",
    "ProviderInput",
    "adapt_provider",
    "as_model",
    "as_models",
]

ModelT = TypeVar("ModelT", bound=BaseModel)


class ProviderError(RuntimeError):
    """The provider broke the contract: a wrong type instead of a Frontedge model.

    Raised at the boundary, right where the data enters the library, so the message names the
    method and the position instead of surfacing as a 500 from the serializer.
    """


def _type_name(value: Any) -> str:
    if value is None:
        return "None"
    return type(value).__name__


def as_model(value: Any, model: type[ModelT], where: str) -> ModelT:
    """A model instance, or a mapping that validates into one. Anything else — ProviderError."""
    if isinstance(value, model):
        return value
    if isinstance(value, Mapping):
        try:
            return model.model_validate(value)
        except ValidationError as error:
            fields = ", ".join(
                ".".join(str(part) for part in item["loc"]) for item in error.errors()
            )
            raise ProviderError(
                f"{where} returned a mapping that is not a valid {model.__name__} "
                f"(check {fields})"
            ) from error
    raise ProviderError(f"{where} returned {_type_name(value)}, expected {model.__name__}")


def as_model_or_none(value: Any, model: type[ModelT], where: str) -> ModelT | None:
    """Like :func:`as_model`, but ``None`` means "not found" and stays ``None``."""
    if value is None:
        return None
    return as_model(value, model, where)


def as_models(values: Any, model: type[ModelT], where: str) -> list[ModelT]:
    """A validated sequence of models. Reports the index of the first bad item."""
    if isinstance(values, (str, bytes, Mapping)) or not isinstance(values, Iterable):
        raise ProviderError(
            f"{where} returned {_type_name(values)}, expected a sequence of {model.__name__}"
        )
    return [as_model(item, model, f"{where} item {index}") for index, item in enumerate(values)]


@runtime_checkable
class EvalProvider(Protocol):
    """Data source for the eval comparison screen."""

    async def list_evals(self, request: Request) -> Sequence[EvalSummary]:
        """All project evals: dataset × scorer × metric."""
        ...

    async def compare_evals(
        self,
        request: Request,
        eval_id: str,
        reference_run: str,
        comparison_run: str,
    ) -> EvalComparison | None:
        """Comparison of two runs on one eval."""
        ...


@runtime_checkable
class DatasetProvider(Protocol):
    """Data source for the datasets screen."""

    async def list_datasets(self, request: Request) -> Sequence[DatasetInfo]:
        ...

    async def get_dataset(self, request: Request, dataset_id: str) -> DatasetDetail | None:
        ...


@runtime_checkable
class FrontedgeProvider(Protocol):
    """Full data source contract."""

    async def list_runs(self, request: Request) -> Sequence[Run]:
        """All project runs."""
        ...

    async def get_run(self, request: Request, run_id: str) -> Run | None:
        """One run by id."""
        ...

    def stream_logs(self, request: Request, run_id: str) -> AsyncIterator[LogLine]:
        """Run log stream."""
        ...

    async def list_examples(self, request: Request, run_id: str) -> Sequence[Example]:
        """The examples of a run, for the Examples tab."""
        ...

    async def read_artifact(self, request: Request, artifact_id: str) -> bytes | None:
        """Artifact content, for the Download link."""
        ...

class CallableProvider:
    """Adapter for an async function ``(request) -> Sequence[Run]``.

    Details and logs come from the same list: enough to build the interface
    when a run has no separate log stream.
    """

    def __init__(self, fn: Callable[[Request], Awaitable[Sequence[Run]]]) -> None:
        self._fn = fn

    async def list_runs(self, request: Request) -> Sequence[Run]:
        return await self._fn(request)

    async def get_run(self, request: Request, run_id: str) -> Run | None:
        for item in await self.list_runs(request):
            # A function provider may return mappings: the detail path must coerce them too.
            run = as_model(item, Run, "list_runs")
            if run.id == run_id:
                return run
        return None

    async def stream_logs(  # pragma: no cover
        self, request: Request, run_id: str
    ) -> AsyncIterator[LogLine]:
        if False:
            yield LogLine(at=None)  # type: ignore[arg-type]

    async def list_examples(self, request: Request, run_id: str) -> Sequence[Example]:
        """A function provider has no examples of its own."""
        return []

    async def read_artifact(self, request: Request, artifact_id: str) -> bytes | None:
        """A function provider has no artifacts of its own."""
        return None


ProviderInput = FrontedgeProvider | Callable[[Request], Awaitable[Sequence[Run]]]


class _ProviderAdapter:
    """Wrapper for a provider that may lack the optional methods.

    The adapter defines every optional method, so the capability flags must be captured from the
    wrapped provider at construction time — otherwise ``/api/meta`` would report features that do
    not exist.
    """

    def __init__(self, provider: Any) -> None:
        self._provider = provider
        self.supports_query = _accepts_query(getattr(provider, "list_runs", None))
        self.has_logs = callable(getattr(provider, "stream_logs", None))
        self.has_artifact_meta = callable(getattr(provider, "artifact_meta", None))
        self.has_artifact_stream = callable(getattr(provider, "stream_artifact", None))
        self.has_artifact_range = _accepts_artifact_range(
            getattr(provider, "stream_artifact", None)
        )
        self.has_artifacts = (
            callable(getattr(provider, "read_artifact", None)) or self.has_artifact_stream
        )
        self.has_examples = callable(getattr(provider, "list_examples", None))
        self.has_examples_query = _accepts_query_at(
            getattr(provider, "list_examples", None), 2, ExamplesQuery
        )

    async def list_runs(self, request: Request, query: Any = None) -> Any:
        if self.supports_query:
            return await self._provider.list_runs(request, query)
        return await self._provider.list_runs(request)

    async def get_run(self, request: Request, run_id: str) -> Run | None:
        return await self._provider.get_run(request, run_id)

    async def stream_logs(self, request: Request, run_id: str) -> AsyncIterator[LogLine]:
        stream = getattr(self._provider, "stream_logs", None)
        if stream is None:
            return
        async for line in stream(request, run_id):
            yield line

    async def read_artifact(self, request: Request, artifact_id: str) -> bytes | None:
        reader = getattr(self._provider, "read_artifact", None)
        if reader is None:
            return None
        return await reader(request, artifact_id)

    async def artifact_meta(
        self, request: Request, artifact_id: str
    ) -> ArtifactMeta | None:
        meta = getattr(self._provider, "artifact_meta", None)
        if meta is None:
            return None
        return await meta(request, artifact_id)

    def stream_artifact(
        self, request: Request, artifact_id: str, start: int = 0, end: int | None = None
    ) -> Any:
        stream = getattr(self._provider, "stream_artifact", None)
        if stream is None:
            return None
        if self.has_artifact_range:
            return stream(request, artifact_id, start, end)
        return stream(request, artifact_id)

    async def list_examples(
        self, request: Request, run_id: str, query: Any = None
    ) -> Any:
        lister = getattr(self._provider, "list_examples", None)
        if lister is None:
            return []
        if self.has_examples_query:
            return await lister(request, run_id, query)
        return await lister(request, run_id)


def _accepts_query_at(target: Any, position: int, query_model: Any) -> bool:
    """Whether a method takes the selection at ``position`` (positional, not a switch).

    Arity alone is wrong: ``list_runs(request, *, include_archived=False)`` would be
    called with a query it never expected. The argument is recognised by its name, by
    the query annotation, or as an extra positional argument (the historical shape).
    """
    import inspect

    if target is None:
        return False
    try:
        parameters = list(inspect.signature(target).parameters.values())
    except (TypeError, ValueError):  # pragma: no cover
        return False
    if len(parameters) <= position:
        return False
    argument = parameters[position]
    if argument.kind in (argument.VAR_POSITIONAL, argument.VAR_KEYWORD):
        return False
    if argument.kind is argument.KEYWORD_ONLY:
        # The adapter passes the query positionally; a keyword-only switch is not it.
        return False
    if argument.name in {"query", "selection"}:
        return True
    annotation = argument.annotation
    if annotation is query_model:
        return True
    if isinstance(annotation, str) and query_model.__name__ in annotation:
        return True
    return True


def _accepts_query(target: Any) -> bool:
    """Whether the function takes the selection, ``list_runs(request, query)``."""
    return _accepts_query_at(target, 1, RunsQuery)


def provider_accepts_examples_query(provider: Any) -> bool:
    """Whether ``list_examples`` takes ``ExamplesQuery`` and pages itself."""
    if isinstance(provider, _ProviderAdapter):
        return provider.has_examples_query
    return _accepts_query_at(getattr(provider, "list_examples", None), 2, ExamplesQuery)


def provider_has_dataset_examples(provider: Any) -> bool:
    """Whether a dataset provider serves examples through its own paged method."""
    return callable(getattr(provider, "list_dataset_examples", None))


def provider_accepts_dataset_examples_query(provider: Any) -> bool:
    return _accepts_query_at(
        getattr(provider, "list_dataset_examples", None), 2, ExamplesQuery
    )


def provider_accepts_query(provider: Any) -> bool:
    """Whether the provider filters the selection itself: ``list_runs(request, query)``."""
    if isinstance(provider, _ProviderAdapter):
        return provider.supports_query
    return _accepts_query(getattr(provider, "list_runs", None))


def _accepts_artifact_range(target: Any) -> bool:
    """Whether ``stream_artifact`` takes ``(start, end)`` after the artifact id."""
    import inspect

    if target is None:
        return False
    try:
        parameters = list(inspect.signature(target).parameters.values())
    except (TypeError, ValueError):  # pragma: no cover
        return False
    if len(parameters) < 4:
        return False
    forbidden = (
        inspect.Parameter.KEYWORD_ONLY,
        inspect.Parameter.VAR_POSITIONAL,
        inspect.Parameter.VAR_KEYWORD,
    )
    return all(parameter.kind not in forbidden for parameter in parameters[2:4])


def provider_reads_artifacts(provider: Any) -> bool:
    """Whether the provider can serve artifact content (bytes or a stream)."""
    if isinstance(provider, CallableProvider):
        return False
    if isinstance(provider, _ProviderAdapter):
        return provider.has_artifacts
    return callable(getattr(provider, "read_artifact", None)) or callable(
        getattr(provider, "stream_artifact", None)
    )


def provider_has_artifact_meta(provider: Any) -> bool:
    if isinstance(provider, _ProviderAdapter):
        return provider.has_artifact_meta
    return callable(getattr(provider, "artifact_meta", None))


def provider_streams_artifact(provider: Any) -> bool:
    if isinstance(provider, CallableProvider):
        return False
    if isinstance(provider, _ProviderAdapter):
        return provider.has_artifact_stream
    return callable(getattr(provider, "stream_artifact", None))


def provider_streams_artifact_ranges(provider: Any) -> bool:
    if isinstance(provider, _ProviderAdapter):
        return provider.has_artifact_range
    return _accepts_artifact_range(getattr(provider, "stream_artifact", None))


def provider_has_examples(provider: Any) -> bool:
    """Whether the provider can list the examples of a run."""
    if isinstance(provider, CallableProvider):
        return False
    if isinstance(provider, _ProviderAdapter):
        return provider.has_examples
    return callable(getattr(provider, "list_examples", None))


def adapt_provider(provider: ProviderInput) -> FrontedgeProvider:
    """Bring the input to the protocol.

    Accepts an object with ``list_runs`` and ``get_run`` (the ``stream_logs``
    method is optional — without it the log stream stays empty) or an async
    function ``(request) -> Sequence[Run]``.
    """
    if isinstance(provider, FrontedgeProvider):
        return provider
    if callable(provider) and not hasattr(provider, "list_runs"):
        return CallableProvider(provider)
    if hasattr(provider, "list_runs") and hasattr(provider, "get_run"):
        return _ProviderAdapter(provider)
    raise TypeError(
        "provider must be an object with list_runs/get_run methods "
        "or an async function (request) -> Sequence[Run]"
    )


def provider_has_logs(provider: Any) -> bool:
    """Whether the provider has a log stream (the callable adapter has none)."""
    if isinstance(provider, CallableProvider):
        return False
    if isinstance(provider, _ProviderAdapter):
        return provider.has_logs
    return callable(getattr(provider, "stream_logs", None))
