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

The package is not on PyPI yet — releases are cut by tagging the repository (Phase 4). Install
from a checkout; the interface has to be built into the package once:

```bash
pnpm install && pnpm build:ui
pip install ./python/frontedge        # or: uv pip install -e ./python/frontedge
```

A plain `git+` install has no built interface and answers 503: the built assets are generated, not
stored. `pnpm build:ui` needs Node 22 and pnpm.

### 2.1 Start a project

```bash
frontedge init my-dashboard
cd my-dashboard
uvicorn app:app --reload        # http://127.0.0.1:8000/frontedge
```

Four files, and the dashboard already runs on two sample runs:

| File | What it is |
|---|---|
| `provider.py` | the only file that touches your data — replace the sample `list_runs` / `get_run` |
| `frontedge.toml` | columns, metrics, actions; `frontedge check` validates it |
| `app.py` | FastAPI plus `frontedge.mount` |
| `README.md` | the three steps above |

`frontedge init` refuses to overwrite existing files unless you pass `--force`.

`examples/minimal` in the repository is the same project, committed and runnable.

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
| `list_examples(request, run_id)` | no | the Examples tab of a run stays empty |
| `list_runs(request, query)` | no | the library filters and paginates the list itself |

A failed run carries its reason in `error` and the exit code of the process in `exit_code`; both
reach the client as `error` and `exitCode`.

`dataset`, `git_sha`, `owner`, `started_at` and `duration_ms` may be omitted: they default to an
empty value and the interface shows an en dash — a queued run has no time yet.

`Stage.name` is a plain string: `prepare`, `train`, `eval` and `publish` are the canonical names,
but a project keeps `tokenize`, `embed` or `deploy`. Only the status set is closed. `kind` of an artifact and `level` of a log line are plain strings, so a project
keeps its own kinds (`model`, `config`) and levels (`debug`, `trace`); an unknown log level is
shown with its raw name.

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
            tag=query.tag,
            sort=query.sort,
            order=query.order,
            offset=query.offset,
            limit=query.limit,
        )
        return RunsPage(items=rows, total=total)

    async def get_run(self, request: Request, run_id: str): ...

    async def stream_logs(self, request: Request, run_id: str):    # async generator of LogLine
        ...

app.include_router(frontedge.mount(MyProvider()))
```

`stream_logs` is optional: without it the log stream stays empty. `read_artifact` is optional too.

The query parameter is recognised by the name `query` (or `selection`), by the `RunsQuery`
annotation, or as a positional second argument — a keyword-only switch such as
`list_runs(request, *, include_archived=False)` is not mistaken for the selection. `sort` must
be a built-in column or a metric declared in `[[metrics]]`; `limit` is capped at 1000, and an
unknown status, sort key or order is a 422 instead of an empty list or a 500.

The total is returned in the `X-Frontedge-Total` header of `GET /api/runs`, and the same header
carries the count for the paged examples endpoints.

The list carries a **24-point sparkline** per series (the table draws a 24-pixel graph); the detail
endpoint carries the full series for the charts. The provider still returns full series: the
server downsamples them on the way out, so a page of 50 runs does not ship 50 × 60 points.

### Check the provider before the server starts

```bash
frontedge check --provider myapp.providers:provider
frontedge check --provider myapp.providers:provider --evals myapp.providers:evals --json
```

The command imports `module:object`, calls `list_runs`, `get_run`, the query path (when the
signature supports it), `list_evals` and `list_datasets`, and validates every answer the same way
the server does. It prints what the provider can do and exits with 1 on a contract mistake:

```
providers: OK
  list_runs: 200 run(s)
  get_run: exp-001
  query: yes
  logs: yes
  artifacts: no
```

The request is a stub: headers, query and path are empty. A provider that reads application state
from `request.app` cannot be checked this way — start the server and call `/api/runs` instead.

## 4. What gets mounted

`frontedge.mount()` takes the provider and, optionally, `evals=`, `datasets=`, `actions=`,
`config=`, `path=` (the prefix the interface is mounted under, `/frontedge` by default) and
`title=`. `frontedge.runs()` is the same router without the eval and dataset screens.

`title` is the browser tab: it is substituted into the served HTML (escaped) and used as the
router title in the OpenAPI document.

| Method and path | What it returns |
|---|---|
| `GET /frontedge/api/runs` | a list of runs; accepts `limit`, `offset`, `search`, `status`, `dataset`, `tag` and answers with the `X-Frontedge-Total` header |
| `GET /frontedge/api/runs/options` | a compact list for the pickers (`id`, `name`, `status`), `limit` up to 1000, `search` |
| `GET /frontedge/api/runs/{id}` | one run |
| `GET /frontedge/api/runs/{id}/examples` | a page of the run examples (`offset`, `limit`, `changed`); the total is in `X-Frontedge-Total` |
| `GET /frontedge/api/runs/{id}/logs/stream` | a log stream (SSE, `event: log`) |
| `GET /frontedge/api/artifacts/{id}/content` | the bytes of an artifact (needs `read_artifact`) |
| `GET /frontedge/api/evals` | a list of evaluations (if `evals=` is connected) |
| `GET /frontedge/api/evals/{id}/compare?reference=&comparison=` | a comparison of two runs |
| `GET /frontedge/api/datasets` | a list of datasets (if `datasets=` is connected) |
| `GET /frontedge/api/datasets/{id}` | a dataset with its examples |
| `GET /frontedge/api/datasets/{id}/examples` | a page of the dataset examples (`offset`, `limit`, `search`); the total is in `X-Frontedge-Total` |
| `GET /frontedge/api/config` | the interface configuration (see §5) |
| `GET /frontedge/api/meta` | the status, freshness and metric-direction vocabularies, plus the capabilities (see below) |
| `POST /frontedge/api/actions/{id}` | runs a project action (see §6) |

The built interface is served under the mount path, with an SPA fallback for the paths outside
`/api`.

An unknown path under `/frontedge/api/` answers 404 in JSON, not HTML.

### 4.1 Capabilities

`/api/meta` says what the mounted installation can do, so a tool (or your own code) does not
have to guess from the configuration:

```json
{
  "name": "frontedge",
  "version": "0.1.0",
  "statuses": ["queued", "running", "succeeded", "failed", "cancelled", "lost"],
  "freshness": ["live", "fresh", "stale", "partial"],
  "metricDirections": ["maximize", "minimize", "none"],
  "capabilities": {
    "screens": ["runs", "run", "evals", "datasets"],
    "actions": ["stop", "export"],
    "runs": { "query": true, "logs": true, "artifacts": false, "examples": true },
    "evals": true,
    "datasets": true
  }
}
```

`runs.query` tells whether the provider filters and paginates itself (`list_runs(request, query)`),
`logs` — whether `stream_logs` exists, `artifacts` — whether `read_artifact` exists, `examples` —
whether `list_examples` exists. `screens` and `actions` come from what you passed to `mount`. The
interface reads this: a screen the installation does not mount is not shown in the sidebar, and the
Download link is left out when artifact content is not served.

### 4.2 A broken provider

A provider that returns the wrong type is not a server bug, so the library answers **502** with a
`detail` that names the method and the position:

```json
{ "detail": "list_runs item 3 returned dict, expected Run" }
```

Mapping values are validated into the model first, so a provider that returns plain dicts keeps
working; only an impossible value fails. A bad log line arrives in the stream as an error line
(`level: "error"`) instead of killing the connection. The generated client shows `detail` as-is,
so the message reaches the person who wired the provider.

### 4.3 Security

- **Authorisation is yours.** The router has no auth: the `request` reaches every provider method,
  so a dependency on your router or a check inside the provider works as usual. Protect the API
  and the static paths the same way you protect the rest of the app.
- **Actions are POST handlers.** Anyone who can reach `POST /api/actions/{id}` can run one; guard
  it with the same auth dependency, and treat `danger: true` as a UI hint, not as protection.
- **No inline script.** The mount path lives in `<meta name="frontedge-mount">`, so a strict CSP
  works without `'unsafe-inline'`. The built interface loads one module script and its CSS from the
  mount path; allow `script-src 'self'` and `style-src 'self'`.
- **Artifact names** come from the provider and are used in `Content-Disposition`; the URL segment
  is what the provider gets, so return only ids you are willing to see in a header.

### 4.4 Deployment

- Serve the mount path as is; do not rewrite `/frontedge/api/...` into the SPA fallback.
- Hashed files under `/frontedge/assets/` are sent with
  `Cache-Control: public, max-age=31536000, immutable`; `index.html` is `no-cache`. A reverse proxy
  may keep these headers as they are.
- The log stream is server-sent events: disable proxy buffering for
  `/frontedge/api/runs/*/logs/stream` (nginx: `proxy_buffering off`).
- Python 3.11+ is required; the wheel ships the built interface, so the host needs no Node at
  runtime.

## 5. Configuration: what to show

The configuration is data (TOML or JSON). It can be edited by hand, from code and later by a
visual editor: the format is the same.

```toml
# frontedge.toml in the project root
project = "squad-ru-eval"    # the name in the top bar and in the runs subtitle
density = "default"          # compact | default | comfortable
theme = "light"              # light | dark

run_columns = ["name", "status", "ribbon", "dataset", "startedAt", "durationMs", "accuracy", "loss", "bleu"]

# The tabs of the evaluation screen: "examples" (the comparison table) and "summary"
# (aggregates, changed and improved/worsened counts). An empty list shows both.
eval_tabs = ["examples", "summary"]

# Starting widths; resizable = false locks a column. column_resize = false locks the whole table.
# The user's own widths are kept in the browser and win over these.
# Keys above the first [[table]] belong to the file; keys below it belong to that table.
[[columns]]
id = "name"
width = 150

[[columns]]
id = "status"
resizable = false

# The metrics of the project. The run screen draws a card for each one and a chart when the run
# has a series for it. An empty list shows every metric a run returns.
[[metrics]]
id = "bleu"
label = "BLEU"
direction = "maximize"
digits = 2
```

```python
app.include_router(frontedge.mount(my_runs_provider, config="frontedge.toml"))
# or with a dictionary:
app.include_router(frontedge.mount(my_runs_provider, config={"density": "compact"}))
```

Validate the file before starting the server — an unknown key is a typo, not a silent default:

```bash
frontedge check                       # ./frontedge.toml or ./frontedge.json
frontedge check path/to/frontedge.toml --json
frontedge schema --out frontedge.schema.json
```

`check` exits with 1 and names the field for every problem (an unknown key, a wrong enum value,
a duplicate action id or column). `schema` prints the JSON Schema of the file, which an editor or
an agent can use to validate it before any Python code runs. `check --provider` validates the
provider as well (see §3).

All of the keys of `UiConfig`:

| Key | Meaning |
|---|---|
| `project` | the installation's name: the top-bar chip and the runs subtitle; hidden when empty |
| `density` | `compact`, `default` or `comfortable` — the row height (28/32/40 px) |
| `theme` | `light` or `dark` |
| `run_columns` | which columns to show in the list of runs; an empty list shows all of them |
| `columns` | starting width and a resize lock per column id (`width`, `resizable`) |
| `column_resize` | whether the user may resize columns at all; `true` by default |
| `metrics` | the project's metrics: label, digits, direction and whether to chart (see below) |
| `eval_tabs` | which tabs to show on the evaluation screen: `examples`, `summary`; empty — both, in this order |
| `actions` | the declared actions (see §6) |
| `live_refresh_seconds` | how often the list of runs refreshes, in seconds; `0` disables it |
| `baseline_run` | the run pinned as the baseline for the deltas |
| `page_size` | how many runs to request at a time (server-side pagination) |

The available run columns are `name`, `status`, `ribbon`, `dataset`, `tags`, `gitSha`, `startedAt`,
`durationMs`, `accuracy` and `loss` — plus any metric name of your own data, which is built from
the `metrics` dictionary.

`Run.tags` is a free list of project labels (`production`, `nightly`): the `tags` column shows
them as chips, the toolbar filters the list by one tag, and the value travels to the provider as
`query.tag` when `list_runs` takes a query.

Sorting is server-side too: a column header sends `query.sort` and `query.order` (`asc`/`desc`),
and the library sorts in memory with missing values last when the provider does not take a query.
The filters, the sorting, the page and the baseline are kept in the URL hash, so a shared link
opens the same view.

### 5.1 Your own metrics

A metric is just a key in `Run.metrics`; the series, the baseline and the direction come with the
data. `[[metrics]]` adds the presentation the library cannot guess:

```toml
[[metrics]]
id = "bleu"            # the key in Run.metrics
label = "BLEU"         # what the table, the card and the chart say
digits = 2             # 3 by default
direction = "maximize" # fallback when the run has no metric_direction for it
chart = true           # false — a card without a chart (counts, sizes)
```

Rules:

- a card is drawn for every listed metric, even without a series;
- a chart is drawn when `chart` is not `false` **and** `Run.series[id]` has more than one point;
- the order of the list is the order of the cards and the charts;
- an empty `metrics` list means "every metric the run returns", sorted by id;
- the direction from `Run.metric_direction` wins over the config; the config only fills the gap;
- the same list drives `run_columns`: a metric id in that list gets the configured label and
  digits in the table too.

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

An action that is declared but has no handler is not shown at all: the server sends only the
actions it can run, and a direct call answers 404. A handler that raises is a 502 whose detail
names the action, so the button reports a failure instead of a blank 500.

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
            <td className="fe-table__td fe-mono">{run.name}</td>
            <td className="fe-table__td">
              <StatusBadge status={run.status} />
            </td>
            <td className="fe-table__td fe-num">{run.metrics.accuracy?.toFixed(3)}</td>
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

### Calling the API from another origin

The built interface is same-origin, but a separate app (a Vite dev server, another domain)
must be allowed by the host. The total count travels in `X-Frontedge-Total`, so it has to be
exposed explicitly:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Frontedge-Total"],
)
```

`createClient` forwards the host's cookies and headers to every call, including the log stream:

```ts
const api = createClient({
  basePath: "http://127.0.0.1:8000/frontedge/api",
  credentials: "include",
  headers: { "x-csrf-token": csrfToken },
});
```

A project action is a `POST`, so the preflight must allow it. With a cookie session add CSRF
protection on the host side — the library does not invent one.

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
