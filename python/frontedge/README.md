# frontedge

The frontend layer for ML engineering: a ready-made design system and screens that mount into
any FastAPI application.

```python
from fastapi import FastAPI
import frontedge

app = FastAPI()
app.include_router(frontedge.runs(runs_provider=my_provider))
```

The provider returns `frontedge.Run` objects; the library knows nothing about authentication and
hands the `request` to the provider, so access control stays on the application side.

## What's inside

- `frontedge.mount(runs_provider, evals=..., datasets=..., actions=..., config=..., path="/frontedge")`
  — the router: the list of runs, the run details, the log stream (SSE), the metadata and the
  built interface.
- `frontedge.runs(runs_provider, path="/frontedge")` — the same router without the eval and
  dataset screens.
- `frontedge.models` — the domain model: `Run`, `Stage`, `MetricPoint`, `Artifact`, `Example`,
  `LogLine`, `EvalSummary`, `EvalComparison`, `DatasetInfo`, `DatasetDetail`, the statuses and
  the freshness.
- `frontedge gen --out src/generated` — the generator of TypeScript types and a typed client
  from the pydantic models. Pure Python, no Node needed.

One process, one port: the interface and the API are served by the same app.

## Configuration

The configuration is data, not code — a TOML or JSON file that the same interface can edit by
hand, from code and later with a visual editor:

```toml
# frontedge.toml
density = "default"          # compact | default | comfortable
theme = "light"              # light | dark
run_columns = ["name", "status", "ribbon", "dataset", "startedAt", "durationMs", "accuracy", "loss"]
```

```python
app.include_router(frontedge.mount(my_runs_provider, config="frontedge.toml"))
```

`UiConfig` also knows `eval_tabs`, `actions`, `live_refresh_seconds`, `baseline_run` and
`page_size`. The configuration is served to the browser as `GET /frontedge/api/config`.

## Actions

The interface never invents what a button does: a project declares the actions it supports, and
the library calls them.

```toml
[[actions]]
id = "stop"
label = "Stop"
placement = "run"        # run | runs | evals | datasets
danger = true
```

```python
from frontedge import ActionResult

async def stop_run(request, payload) -> ActionResult:
    run_id = payload["runId"]
    await my_repository.stop(run_id)
    return ActionResult(ok=True, message=f"Run {run_id} stopped")

app.include_router(
    frontedge.mount(my_runs_provider, actions={"stop": stop_run}, config="frontedge.toml")
)
```

The handler receives the `request` and the `payload` of the interface and returns an
`ActionResult`; its `message` is shown to the user.

The full description of the product and of the visual language:
[design document](https://github.com/socrabs151/frontedge-ml/blob/main/docs/specs/2026-10-20-frontedge-design.md).
The full contract: [docs/integration.md](https://github.com/socrabs151/frontedge-ml/blob/main/docs/integration.md).

MIT.
