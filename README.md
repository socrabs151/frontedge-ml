# frontedge

> The frontend layer for ML engineering: a reusable UI layer you mount into any FastAPI
> application, built to understand ML data — runs, datasets, evals, traces, artifacts.

[![license](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)
[![status](https://img.shields.io/badge/status-phase%201%20spike-informational.svg)](docs/specs/2026-10-20-frontedge-design.md)
[![node](https://img.shields.io/badge/node-22%2B-5FA04E.svg)](package.json)
[![ci](https://github.com/socrabs151/frontedge-ml/actions/workflows/ci.yml/badge.svg)](https://github.com/socrabs151/frontedge-ml/actions/workflows/ci.yml)

**English** · [Русский](README.ru.md)

Sources: **https://github.com/socrabs151/frontedge-ml**

```python
app.include_router(frontedge.mount(runs_provider, evals=eval_provider, datasets=dataset_provider))
```

> **Status:** Phase 3. The design system and four screens — a runs list, a run detail view, an
> eval diff and a dataset explorer — run on synthetic data, mounted into a real FastAPI app.
> The npm and PyPI packages are published in Phase 4.
> Full design document: [`docs/specs/2026-10-20-frontedge-design.md`](docs/specs/2026-10-20-frontedge-design.md)
> (currently written in Russian).

## What it is

Frontedge is not another admin template. The frontend knows what a run, a baseline, a metric
delta, a freshness window and a provenance record are, so it can show them without you
describing them again for every project.

- **Runs** — a table with per-stage timelines, deltas against a pinned baseline, and inline
  metric sparklines.
- **Run detail** — metrics over steps, example-level evaluation, live logs over SSE, artifacts,
  provenance.
- **Eval diff** — two runs compared example by example: examples as rows, columns grouped by
  role, the reference run pinned left, a "differences only" filter and a switchable number format.
- **Dataset** — versions, examples, a datasheet (motivation, composition, collection, intended
  use) and provenance.

## Repository layout

```
frontedge/
├── packages/ui/            @frontedge/ui — tokens, primitives, ML patterns
│   ├── src/styles/         tokens.css · base.css · components.css · patterns.css
│   ├── src/components/     Button · StatusBadge · Search · Sparkline · Tabs · Tooltip
│   ├── src/patterns/       RunRibbon · RunTimeline · RunsTable · MetricChart · LogStream
│   ├── src/generated/      TypeScript types generated from the Python models
│   └── scripts/            check-contrast.mjs — WCAG contrast gate
├── python/frontedge/       the Python package: models, providers, routers, type generator
├── apps/spike/             Phase 1 spike app (Vite + React + TS)
│   ├── src/screens/        RunsScreen · RunDetailScreen
│   ├── src/data/           mock data and the data source (mock or API)
│   └── scripts/            verify.mjs (screenshots + axe) · keyboard-check.mjs
├── examples/demo-ml/       FastAPI app with a fake ML backend, frontedge mounted
└── docs/specs/             design document
```

The npm package ships from `packages/ui`; the Python package from `python/frontedge`.

## Commands

```bash
pnpm install
pnpm dev                # spike on http://localhost:5173
pnpm typecheck          # tsc across every package
pnpm check:contrast     # token contrast per WCAG 2.2, both themes
pnpm build              # production build of the spike app
pnpm build:ui           # build the interface and copy it into the Python package
pnpm gen:types          # regenerate TypeScript types from the Python models
pnpm demo               # demo on FastAPI: http://127.0.0.1:8000/frontedge
uv sync --all-packages  # Python workspace
node apps/spike/scripts/verify.mjs        # screenshots + axe audit (dev server required)
node apps/spike/scripts/keyboard-check.mjs # keyboard pass over the table
```

## Design system

- **Tokens** live in `packages/ui/src/styles/tokens.css`: color, typography, density, radii,
  motion. Light theme by default, dark theme on demand; series colors stay identical in both.
- **Density** — 28 / 32 / 40 px rows, switched by a `data-density` attribute on `<html>`.
- **Type** — Inter for the interface, JetBrains Mono for data, logs and identifiers. Both
  self-hosted, no CDN.
- **Icons** — Lucide, `currentColor`, stroke weight matched to the adjacent text.

Rules that are not negotiable (see §4 of the design document):

- color is never the only carrier of meaning — a status is icon + word + color;
- "better" and "worse" are a sign and a word, not green and red;
- numbers are tabular and right-aligned, a missing value is an en dash, never a blank cell;
- tables, not cards; hairline separators, never zebra striping;
- depth comes from borders and surface shifts, shadows only on overlays;
- `prefers-reduced-motion` is respected, only `transform` and `opacity` animate.

## License

MIT — free use, modification and distribution, including commercial use.
