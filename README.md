# frontedge

**The frontend layer for ML engineering.** A ready-made interface — runs, metrics, evals,
datasets, logs, artifacts, provenance — that you mount into your own FastAPI app and feed with
your own data.

```python
from fastapi import FastAPI
import frontedge

app = FastAPI()
app.include_router(frontedge.mount(my_runs_provider))
```

[![license](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)
[![pypi](https://img.shields.io/pypi/v/frontedge.svg)](https://pypi.org/project/frontedge/)
[![npm](https://img.shields.io/npm/v/@frontedge-ml/ui.svg)](https://www.npmjs.com/package/@frontedge-ml/ui)
[![python](https://img.shields.io/pypi/pyversions/frontedge.svg)](https://pypi.org/project/frontedge/)
[![node](https://img.shields.io/badge/node-22%2B-5FA04E.svg)](package.json)
[![ci](https://github.com/socrabs151/frontedge-ml/actions/workflows/ci.yml/badge.svg)](https://github.com/socrabs151/frontedge-ml/actions/workflows/ci.yml)

**English** · [Русский](README.ru.md)

---

## The problem

Every ML project rebuilds the same interface: a table of runs, a detail view with metric
curves, a comparison of two evaluations, a dataset browser. The screens are never the hard
part — the plumbing is. Fetching runs, keeping a baseline pinned, streaming logs, aligning
examples between two runs, showing a metric delta *with its direction*, and doing all of that
without a designer in the loop.

Frontedge is that layer, packaged.

![Runs list](docs/images/runs.png)

## What you get

| | |
|---|---|
| **Runs** | a dense table with per-stage timelines, deltas against a pinned baseline and inline metric sparklines. Columns, filters, pagination and the live refresh are yours to configure |
| **Run detail** | metrics over steps, the run configuration and its diff against the baseline, example-level evaluation, live logs over SSE, artifacts, provenance, and the reason a run failed |
| **Compare** | 2–4 runs on one shared axis, a config matrix that marks the parameters that differ, and a linkable `#/compare?runs=…` view |
| **Eval diff** | two runs compared example by example: examples as rows, columns grouped by role, reference run pinned left |
| **Dataset** | versions, a paged example table with a drill-down into input/answer/expected/score, a datasheet (motivation, composition, collection, intended use) and provenance |
| **A design system** | tokens, primitives and ML patterns — density, dark theme, keyboard navigation, WCAG-checked contrast, English with a Russian toggle |

![Run detail](docs/images/run-detail.png)

## Quick start

The package is on PyPI and ships the built interface:

```bash
pip install "frontedge[serve]"
```

Then scaffold a dashboard — it runs with the sample data before you write a line:

```bash
frontedge init my-dashboard
cd my-dashboard && uvicorn app:app --reload
```

Or write the provider yourself; it is one function:

```python
from datetime import UTC, datetime
from fastapi import FastAPI, Request
import frontedge

app = FastAPI()


async def my_runs_provider(request: Request) -> list[frontedge.Run]:
    # Your authorisation lives here: the library passes the request through.
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
        for row in await my_repository.fetch_runs(request.user)
    ]


app.include_router(frontedge.mount(my_runs_provider))
```

One process, one port: the interface and the API are served by the same app.

## Extending it

The interface never invents what a button does. A project declares what it can do, and the
library calls it:

```toml
# frontedge.toml
[[actions]]
id = "stop"
label = "Stop"
placement = "run"
danger = true
```

```python
async def stop_run(request, payload) -> frontedge.ActionResult:
    await my_repository.stop(payload["runId"])
    return frontedge.ActionResult(ok=True, message=f"Run {payload['runId']} stopped")

app.include_router(frontedge.mount(provider, actions={"stop": stop_run}, config="frontedge.toml"))
```

Buttons appear only for declared actions, so there are no dead controls. Column sets, tabs and
actions live in configuration — data, not code — so the same file can be edited by hand or by a
tool later.

The same file decides what the list shows and how it behaves:

```toml
# frontedge.toml
density = "default"
run_columns = ["name", "status", "ribbon", "dataset", "accuracy", "bleu"]
baseline_run = "exp-039"
live_refresh_seconds = 5
page_size = 50

[[metrics]]
id = "bleu"
label = "BLEU"
direction = "maximize"
digits = 2
```

Any metric the project reports becomes a first-class object: add `bleu` to `run_columns` for the
table, declare it in `[[metrics]]` for the run screen — a card with the delta and a chart from
its series. Filtering, search and pagination run on the server when the provider takes a
`list_runs(request, query)` signature.

For your own screens, install the design system (`npm i @frontedge-ml/ui react react-dom`) and use
the components directly:

```tsx
import "@frontedge-ml/ui/styles.css";
import { RunsTable, StatusBadge } from "@frontedge-ml/ui";
```

Full contract: **[docs/integration.md](docs/integration.md)**. If you are an agent working in a
user's repository, **[AGENTS.md](AGENTS.md)** has the same contract in short form.

## Two packages

| | |
|---|---|
| [`frontedge`](python/frontedge) (PyPI) | the Python package: models, providers, routers, the type generator |
| [`@frontedge-ml/ui`](packages/ui) (npm) | the design system: tokens, primitives, ML patterns, generated types |

TypeScript types are generated from the Python models; CI runs `frontedge gen --check`, so drift fails the build:

```bash
pnpm gen:types     # pydantic -> types.ts + client.ts
```

## Design principles

- **Data over decoration.** Status is icon + word + colour, never colour alone. "Better" and
  "worse" are a sign and a word, because only the metric's owner knows the direction.
- **Tables, not cards.** Adjacent values have to be comparable without moving your eyes.
- **Dense but calm.** 4px spacing grid, hairline separators, one accent, no shadows on
  surfaces.
- **Accessible by construction.** Every token pair is checked against WCAG 2.2 in CI; the
  browser gates run axe and a keyboard pass on every pull request.
- **One language at a time.** The interface is English by default with a Russian toggle.
  Domain terms (Run, Dataset, Baseline) stay English in both, because they are the words
  people look up in W&B and MLflow.

## Development

```bash
pnpm install
pnpm dev                # the spike app on mock data: http://localhost:5173
pnpm demo               # the demo on FastAPI: http://127.0.0.1:8000/frontedge
PORT=8010 pnpm demo     # another port when 8000 is taken
pnpm typecheck
pnpm check:contrast     # WCAG contrast of every token pair, both themes
pnpm check:lang         # English repository and interface, Russian only through the toggle
pnpm check:lang -- --no-browser  # skip the browser pass when no demo is running
pnpm build:ui           # build the interface into the Python package
uv sync --all-packages
uv run --package frontedge pytest python/frontedge/tests -q
uv run --package frontedge frontedge check examples/demo-ml/frontedge.toml
```

Design document: [docs/specs/2026-10-20-frontedge-design.md](docs/specs/2026-10-20-frontedge-design.md).

## Status

The packages are published on PyPI (`frontedge`) and npm (`@frontedge-ml/ui`). The screens, the
design system, the Python package and the type generator are covered by gates. The current stage
is public-beta hardening: provider boundaries, accessibility and the remaining onboarding work.

[Contributing](CONTRIBUTING.md) · [Issues](https://github.com/socrabs151/frontedge-ml/issues)

## License

MIT.
