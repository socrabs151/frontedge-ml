"""Источники данных для экранов Frontedge.

Пользователь отдаёт provider — объект с методами ``list_runs`` / ``get_run`` /
``stream_logs`` либо простую async-функцию, возвращающую список прогонов.
Библиотека не знает про аутентификацию: ``request`` передаётся в provider,
решение остаётся за приложением пользователя.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable, Sequence
from typing import Any, Protocol, runtime_checkable

from fastapi import Request

from .models import DatasetDetail, DatasetInfo, EvalComparison, EvalSummary, LogLine, Run

__all__ = [
    "CallableProvider",
    "DatasetProvider",
    "EvalProvider",
    "FrontedgeProvider",
    "ProviderInput",
    "adapt_provider",
]


@runtime_checkable
class EvalProvider(Protocol):
    """Источник данных для экрана сравнения оценок."""

    async def list_evals(self, request: Request) -> Sequence[EvalSummary]:
        """Все оценки проекта: датасет × скорер × метрика."""
        ...

    async def compare_evals(
        self,
        request: Request,
        eval_id: str,
        reference_run: str,
        comparison_run: str,
    ) -> EvalComparison | None:
        """Сравнение двух прогонов по одной оценке."""
        ...


@runtime_checkable
class DatasetProvider(Protocol):
    """Источник данных для экрана датасетов."""

    async def list_datasets(self, request: Request) -> Sequence[DatasetInfo]:
        ...

    async def get_dataset(self, request: Request, dataset_id: str) -> DatasetDetail | None:
        ...


@runtime_checkable
class FrontedgeProvider(Protocol):
    """Полный контракт источника данных."""

    async def list_runs(self, request: Request) -> Sequence[Run]:
        """Все прогоны проекта."""
        ...

    async def get_run(self, request: Request, run_id: str) -> Run | None:
        """Один прогон по идентификатору."""
        ...

    def stream_logs(self, request: Request, run_id: str) -> AsyncIterator[LogLine]:
        """Поток логов прогона."""
        ...

class CallableProvider:
    """Адаптер: async-функция ``(request) -> Sequence[Run]``.

    Детали и логи берутся из того же списка: этого достаточно, чтобы собрать
    интерфейс, когда у прогона нет отдельного потока логов.
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
    """Обёртка над провайдером, у которого может не быть ``stream_logs``."""

    def __init__(self, provider: Any) -> None:
        self._provider = provider

    async def list_runs(self, request: Request) -> Sequence[Run]:
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


def provider_accepts_query(provider: Any) -> bool:
    """Умеет ли провайдер фильтровать выборку сам: ``list_runs(request, query)``."""
    import inspect

    target = getattr(provider, "list_runs", None)
    if target is None:
        return False
    try:
        parameters = inspect.signature(target).parameters
    except (TypeError, ValueError):  # pragma: no cover
        return False
    return len(parameters) >= 2


def provider_reads_artifacts(provider: Any) -> bool:
    """Умеет ли провайдер отдавать содержимое артефакта."""
    return callable(getattr(provider, "read_artifact", None))


def adapt_provider(provider: ProviderInput) -> FrontedgeProvider:
    """Привести вход к протоколу.

    Принимает объект с ``list_runs`` и ``get_run`` (метод ``stream_logs`` необязателен —
    без него поток логов будет пустым) либо async-функцию ``(request) -> Sequence[Run]``.
    """
    if isinstance(provider, FrontedgeProvider):
        return provider
    if callable(provider) and not hasattr(provider, "list_runs"):
        return CallableProvider(provider)
    if hasattr(provider, "list_runs") and hasattr(provider, "get_run"):
        return _ProviderAdapter(provider)
    raise TypeError(
        "provider должен быть объектом с методами list_runs/get_run "
        "или async-функцией (request) -> Sequence[Run]"
    )


def provider_has_logs(provider: Any) -> bool:
    """Есть ли у провайдера поток логов (у адаптера callable — нет)."""
    if isinstance(provider, CallableProvider):
        return False
    return callable(getattr(provider, "stream_logs", None))
