"""A Frontedge dashboard in one file.

    uvicorn app:app --reload
    open http://127.0.0.1:8000/frontedge
"""

from pathlib import Path

import frontedge
from fastapi import FastAPI

from provider import Provider

CONFIG = Path(__file__).with_name("frontedge.toml")

app = FastAPI(title="My ML dashboard")
app.include_router(
    frontedge.mount(
        Provider(),
        config=CONFIG,
        path="/frontedge",
        title="My ML dashboard",
    )
)
