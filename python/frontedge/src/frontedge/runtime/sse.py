"""Поток событий Server-Sent Events."""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any

__all__ = ["event_stream", "sse_response"]

KEEPALIVE_SECONDS = 15


def _format(event_type: str, payload: Any) -> str:
    body = json.dumps(payload, ensure_ascii=False, default=str)
    return f"event: {event_type}\ndata: {body}\n\n"


async def event_stream(
    events: AsyncIterator[tuple[str, Any]],
    *,
    keepalive: int = KEEPALIVE_SECONDS,
) -> AsyncIterator[str]:
    """Превращает пары (тип, данные) в поток SSE с keepalive-комментариями.

    Источник читается отдельной задачей: таймаут ожидания не должен отменять
    ``__anext__`` генератора — иначе провайдер, который молчит дольше keepalive
    (обычная пауза между строками лога), потерял бы поток навсегда.
    """
    queue: asyncio.Queue[Any] = asyncio.Queue()
    done = object()

    async def pump() -> None:
        try:
            async for item in events:
                await queue.put(item)
        finally:
            await queue.put(done)

    task = asyncio.create_task(pump())
    try:
        while True:
            try:
                item = await asyncio.wait_for(queue.get(), timeout=keepalive)
            except TimeoutError:
                yield ": keepalive\n\n"
                continue
            if item is done:
                break
            event_type, payload = item
            yield _format(event_type, payload)
    finally:
        task.cancel()


def sse_response(
    events: AsyncIterator[tuple[str, Any]],
    *,
    keepalive: int = KEEPALIVE_SECONDS,
) -> Any:
    """Ответ FastAPI с потоком SSE."""
    from fastapi.responses import StreamingResponse

    return StreamingResponse(
        event_stream(events, keepalive=keepalive),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
