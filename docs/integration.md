# Frontedge integration

A document for a human developer. If you are an agent, [AGENTS.md](../AGENTS.md) in the
repository root carries the same contract in a shorter form and a "add an action in 10 minutes"
recipe.

---

## 1. What this is

Frontedge is a ready-made interface for ML projects: a list of runs, run details, an evaluation
comparison, a dataset viewer. You mount it into your own FastAPI app and feed it your own data
through a provider — the library knows nothing about your data model beyond the fact that it is
described by `frontedge.Run`, `frontedge.EvalSummary` and `frontedge.DatasetInfo` objects.

```python
from fastapi import FastAPI
import frontedge

app = FastAPI()
app.include_router(frontedge.mount(my_runs_provider))
# → http://127.0.0.1:8000/frontedge
```

The interface and the API are served by the same process: one process, one port, no Node in
production.

## 2. Installation

```bash
uv add frontedge           # or: pip install frontedge
```

The package is not on PyPI yet — releases are cut by tagging the repository (Phase 4). Until
then, install from the sources:

```bash
uv add "frontedge @ git+https://github.com/socrabs151/frontedge-ml.git#subdirectory=python/frontedge"
```

For your own frontend on the components:

```bash
npm i @frontedge/ui react react-dom
```

## 3. Provider: 20 lines

A provider is a function or an object that returns runs. The library knows nothing about
authentication: it hands you the `request`, you decide.

```python
from datetime import UTC, datetime
from fastapi import Request
import frontedge

async def my_runs_provider(request: Request) -> list[frontedge.Run]:
    # Your authorisation lives here: request.user and so on.
    rows = await my_repository.fetch_runs(request.user)
    return [
        frontedge.Run(
            id=str(row.id),
            name=row.name,
            status=frontedge.RunStatus(row.status),
            dataset=row.dataset,
            git_sha=row.git_sha,
            started_at=row.started_at,
            duration_ms=row.duration_ms,
            owner=row.owner,
            metrics={"accuracy": row.accuracy, "loss": row.loss},
            series={"accuracy": row.accuracy_curve},
            metric_direction={"accuracy": "maximize", "loss": "minimize"},
            stages=row.stages,
        )
        for row in rows
    ]

app.include_router(frontedge.mount(my_runs_provider))
```

**What is required, what is optional:**

| Method | Required | Without it |
|---|---|---|
| `list_runs(request)` | yes | — |
| `get_run(request, run_id)` | yes | — |
| `stream_logs(request, run_id)` | no | the "Logs" tab stays empty |
| `read_artifact(request, artifact_id)` | no | `GET /api/artifacts/{id}/content` answers 404 |
| `list_runs(request, query)` | no | the library filters and paginates the list itself |

A failed run carries its reason in `error` and the exit code of the process in `exit_code`; both
reach the client as `error` and `exitCode`.

You can pass an object instead of a function — then all of the methods are available:

```python
class MyProvider:
    async def list_runs(self, request): ...
    async def get_run(self, request, run_id): ...
    async def stream_logs(self, request, run_id):    # async generator of LogLine
        ...

app.include_router(frontedge.mount(MyProvider()))
```

### Filtering on the server side

If `list_runs` takes a second argument, the library hands the selection over to you instead of
filtering the list in memory. Return a `RunsPage` to report the total number of runs:

```python
from frontedge.models import RunsPage, RunsQuery

class MyProvider:
    async def list_runs(self, request: Request, query: RunsQuery) -> RunsPage:
        total, rows = await my_repository.fetch_runs(
            search=query.search,
            status=query.status,
            dataset=query.dataset,
            offset=query.offset,
            limit=query.limit,
        )
        return RunsPage(items=rows, total=total)

    async def get_run(self, request: Request, run_id: str): ...

    async def stream_logs(self, request: Request, run_id: str):    # async generator of LogLine
        ...

app.include_router(frontedge.mount(MyProvider()))
```

The provider has to implement `stream_logs`: a provider without it is wrapped for the log
stream, and the wrapper does not pass the query on.

The total is returned in the `X-Frontedge-Total` header of `GET /api/runs`.

## 4. What gets mounted

`frontedge.mount()` takes the provider and, optionally, `evals=`, `datasets=`, `actions=`,
`config=`, `path=` (the prefix the interface is mounted under, `/frontedge` by default) and
`title=`. `frontedge.runs()` is the same router without the eval and dataset screens.

| Method and path | What it returns |
|---|---|
| `GET /frontedge/api/runs` | a list of runs; accepts `limit`, `offset`, `search`, `status`, `dataset` and answers with the `X-Frontedge-Total` header |
| `GET /frontedge/api/runs/{id}` | one run |
| `GET /frontedge/api/runs/{id}/logs/stream` | a log stream (SSE, `event: log`) |
| `GET /frontedge/api/artifacts/{id}/content` | the bytes of an artifact (needs `read_artifact`) |
| `GET /frontedge/api/evals` | a list of evaluations (if `evals=` is connected) |
| `GET /frontedge/api/evals/{id}/compare?reference=&comparison=` | a comparison of two runs |
| `GET /frontedge/api/datasets` | a list of datasets (if `datasets=` is connected) |
| `GET /frontedge/api/datasets/{id}` | a dataset with its examples |
| `GET /frontedge/api/config` | the interface configuration (see §5) |
| `GET /frontedge/api/meta` | the status, freshness and metric-direction vocabularies |
| `POST /frontedge/api/actions/{id}` | runs a project action (see §6) |

The built interface is served under the mount path, with an SPA fallback for the paths outside
`/api`.

An unknown path under `/frontedge/api/` answers 404 in JSON, not HTML.

## 5. Configuration: what to show

The configuration is data (TOML or JSON). It can be edited by hand, from code and later by a
visual editor: the format is the same.

```toml
# frontedge.toml in the project root
density = "default"          # compact | default | comfortable
theme = "light"              # light | dark

run_columns = ["name", "status", "ribbon", "dataset", "startedAt", "durationMs", "accuracy", "loss"]
```

```python
app.include_router(frontedge.mount(my_runs_provider, config="frontedge.toml"))
# or with a dictionary:
app.include_router(frontedge.mount(my_runs_provider, config={"density": "compact"}))
```

All of the keys of `UiConfig`:

| Key | Meaning |
|---|---|
| `density` | `compact`, `default` or `comfortable` — the row height (28/32/40 px) |
| `theme` | `light` or `dark` |
| `run_columns` | which columns to show in the list of runs; an empty list shows all of them |
| `eval_tabs` | which tabs to show on the evaluation screen |
| `actions` | the declared actions (see §6) |
| `live_refresh_seconds` | how often the list of runs refreshes, in seconds; `0` disables it |
| `baseline_run` | the run pinned as the baseline for the deltas |
| `page_size` | how many runs to request at a time (server-side pagination) |

The available run columns are `name`, `status`, `ribbon`, `dataset`, `gitSha`, `startedAt`,
`durationMs`, `accuracy` and `loss` — plus any metric name of your own data, which is built from
the `metrics` dictionary.

## 6. How to add an action (a button)

An action is something **your project can do** with its run: stop, restart, export, queue. The
library knows nothing about these things and does not invent them: a button appears in the
interface only if the action is declared.

Three steps.

**Step 1 — the handler in the code:**

```python
from frontedge import ActionResult
from fastapi import Request

async def stop_run(request: Request, payload: dict) -> ActionResult:
    run_id = payload["runId"]
    await my_repository.stop(run_id)
    return ActionResult(ok=True, message=f"Run {run_id} stopped")
```

**Step 2 — declare the action in the configuration:**

```toml
[[actions]]
id = "stop"
label = "Stop"
placement = "run"        # run | runs | evals | datasets
danger = true            # a red button
description = "Stops the run and frees the GPU"
```

**Step 3 — register the handler:**

```python
app.include_router(
    frontedge.mount(
        my_runs_provider,
        actions={"stop": stop_run},
        config="frontedge.toml",
    )
)
```

That is all: the "Stop" button appears in the header of the run, the click calls the handler, and
its `message` is shown under the header.

- `placement = "run"` — a button in the header of the run screen;
- `placement = "runs"` — a button in every row of the list;
- `payload` — what the interface puts into the request: for `run` it is `{"runId": "..."}`, for
  `runs` it is the `runId` of the selected row.

An action that has no handler answers 404 when it is called, and a button that is not in the
configuration is not shown at all.

## 7. Your own screens on our components

If the standard screens are not enough — build your own on the primitives. The tokens and the
components come from `@frontedge/ui`:

```tsx
import "@frontedge/ui/styles.css";
import { RunsTable, StatusBadge, type Run } from "@frontedge/ui";

export function MyRuns({ runs }: { runs: Run[] }) {
  return (
    <table className="fe-table__table">
      <tbody>
        {runs.map((run) => (
          <tr key={run.id} className="fe-table__row">
            <td className="fe-table__td mono">{run.name}</td>
            <td className="fe-table__td">
              <StatusBadge status={run.status} />
            </td>
            <td className="fe-table__td num">{run.metrics.accuracy?.toFixed(3)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Do not forget the density and the theme on the root of the application:

```html
<html data-theme="light" data-density="default">
```

and the fonts: the package does not load them itself, add `@fontsource-variable/inter` and
`@fontsource/jetbrains-mono` (or your own).

The types come from the Python models: `frontedge gen --out src/generated` creates `types.ts` and
`client.ts`, which you can import instead of hand-written types. Pass `--base-path` if the
interface is mounted under another prefix.

## 8. Troubleshooting

| Symptom | Cause | What to do |
|---|---|---|
| 503 "The interface is not built" | the package has no built UI | run `pnpm build:ui` in the frontedge repository, then rebuild the package |
| `/frontedge/api/...` returns HTML | the SPA fallback answers the unknown paths outside `/api` | that is how it works; check that you did not mix up `/api` and the root |
| The button does not appear | the action is not in the configuration or has no `placement` | check `frontedge.toml` and `GET /frontedge/api/config` |
| The logs do not flow | the provider has no `stream_logs` | add the method (an async generator of `LogLine`) |
| The interface keeps asking for `/frontedge` | the mount path is not the one you passed | the mount path is substituted into the built interface at runtime; check the `path=` argument |

## 9. What is not supported yet

- A layer over arbitrary user data models: the model is fixed (`frontedge.Run`,
  `frontedge.EvalSummary`, `frontedge.DatasetInfo`). Your own fields go through `metrics`,
  `series` and `provenance`.
- Authentication inside the library — it hands `request` to the provider, you decide there.
- A visual editor of the configuration.
