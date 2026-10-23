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

from .models import DatasetDetail, DatasetInfo, EvalComparison, EvalSummary, LogLine, Run

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
            fields = ", ".join(".".join(str(part) for part in item["loc"]) for item in error.errors())
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
        for run in await self.list_runs(request):
            if run.id == run_id:
                return run
        return None

    async def stream_logs(self, request: Request, run_id: str) -> AsyncIterator[LogLine]:  # pragma: no cover
        if False:
            yield LogLine(at=None)  # type: ignore[arg-type]


ProviderInput = FrontedgeProvider | Callable[[Request], Awaitable[Sequence[Run]]]


class _ProviderAdapter:
    """Wrapper for a provider that may lack ``stream_logs``."""

    def __init__(self, provider: Any) -> None:
        self._provider = provider
        self.supports_query = _accepts_query(getattr(provider, "list_runs", None))

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


def _accepts_query(target: Any) -> bool:
    """Whether the function accepts a second argument — the selection."""
    import inspect

    if target is None:
        return False
    try:
        parameters = inspect.signature(target).parameters
    except (TypeError, ValueError):  # pragma: no cover
        return False
    return len(parameters) >= 2


def provider_accepts_query(provider: Any) -> bool:
    """Whether the provider filters the selection itself: ``list_runs(request, query)``."""
    if isinstance(provider, _ProviderAdapter):
        return provider.supports_query
    return _accepts_query(getattr(provider, "list_runs", None))


def provider_reads_artifacts(provider: Any) -> bool:
    """Whether the provider can serve artifact content."""
    return callable(getattr(provider, "read_artifact", None))


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
    return callable(getattr(provider, "stream_logs", None))
