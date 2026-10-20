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
    """Превращает пары (тип, данные) в поток SSE с keepalive-комментариями."""
    iterator = events.__aiter__()
    while True:
        try:
            event_type, payload = await asyncio.wait_for(iterator.__anext__(), timeout=keepalive)
        except TimeoutError:
            yield ": keepalive\n\n"
            continue
        except StopAsyncIteration:
            break
        yield _format(event_type, payload)


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
