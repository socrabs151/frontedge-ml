# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The following are **public contracts** and change only in a major release:

- the `x-frontedge` role vocabulary;
- the canonical status set (`queued · running · succeeded · failed · cancelled · lost`);
- the freshness set (`live · fresh · stale · partial`);
- the interface configuration keys (`density`, `theme`, `run_columns`, `metrics`, `eval_tabs`,
  `actions`, `live_refresh_seconds`, `baseline_run`, `page_size`);
- the HTTP paths under `/frontedge/api`.

## [Unreleased]

### Added

- Server-side filtering and pagination of the runs list: a provider may accept
  `list_runs(request, query)` and answer with a `RunsPage`; the total number of runs is sent in
  the `X-Frontedge-Total` header.
- Artifact content: `GET /api/artifacts/{id}/content` for providers that implement
  `read_artifact`.
- Failure reasons: `Run.error` and `Run.exit_code` reach the client as `error` and `exitCode`.
- The runs table is built from the configured columns.
- The list of runs refreshes on its own (`live_refresh_seconds`), and the baseline run for the
  deltas can be picked in the interface (`baseline_run`).
- The language audit (`pnpm check:lang`): Cyrillic is allowed only in the dictionaries and the
  Russian README, the two dictionaries must agree, a component may not carry a visible literal,
  and the English interface is checked in a browser for stray Cyrillic.
- `frontedge schema` prints the JSON Schema of `frontedge.toml`; `frontedge check` validates a
  file and names every problem — an unknown key, a wrong enum value, a duplicate action id or
  column — with a `--json` mode for tools.
- `/api/meta` reports capabilities: which screens are mounted, which actions are declared, and
  whether the runs provider supports server-side query, log streaming and artifact content.
- Provider output is validated where it enters the library. A mapping is coerced into the model;
  anything else is a 502 whose `detail` names the method and the position instead of a 500 from
  the serializer. A bad log line becomes a visible error line in the stream.
- The OpenAPI schema describes the responses: `RunPayload`, `EvalSummary`, `EvalComparison`,
  `DatasetInfo`, `DatasetDetail`, `Meta`, `UiConfig` and `ActionResult` are referenced from the
  paths instead of bare `object`, so generic tools see the same contract as the generated client.
- `frontedge check --provider module:object` calls a provider the way the server will and
  validates every answer; `--evals` and `--datasets` include the other two sources.
- A documentation test compiles every Python example, loads every TOML example, validates the
  configuration examples against `UiConfig`, and parses every documented CLI command.
- Metrics are project data, not screen code: `[[metrics]]` declares an id, label, digits,
  direction and whether to chart it. The run screen draws a card for every metric and a chart
  from its series; without a list it shows everything the run returns. The runs table uses the
  same labels and digits.
- `eval_tabs` works: the evaluation screen has an **Examples** tab (the comparison table) and a
  **Summary** tab (the two aggregates, the delta, the changed count and the improved/worsened
  breakdown). The key was accepted and documented before, but the screen ignored it.

### Changed

- Tokens carry the `fe-` prefix (`--fe-surface`), so the npm package never overwrites the host
  application's variables.
- Base styles are scoped to `.fe-root` and to the portalled surfaces: importing the package no
  longer restyles the host document.
- `@frontedge/ui/styles.css` is one built file; the `@import`s are inlined at build time.
- Components fall back to English when no `I18nProvider` is mounted, so a single pattern can be
  dropped into an existing application.
- `frontedge.toml` rejects unknown keys instead of ignoring them.
- Utility classes carry the `fe-` prefix: `num` → `fe-num`, `mono` → `fe-mono`, `muted` →
  `fe-muted`, `dim` → `fe-dim`, so they cannot collide with the host application.
- The run screen no longer hardcodes accuracy, loss, F1 and tokens; the same code path serves
  any metric.
- The sparkline in a metric cell is pinned to the cell's right edge: the graphs of a column share
  one baseline even when the deltas differ in width. The cell no longer clips its content, and the
  browser gate checks both.
- A delta below the precision of the value it sits next to reads `±0` (the tooltip keeps the exact
  number), so an exponential like `+4.00e-4` cannot break the column's rhythm. A value still falls
  back to the exponential form when the fixed form would show zero.
- `Run.dataset`, `Run.git_sha` and `Run.owner` are optional and default to an empty string; the
  interface shows an en dash, so an adapter does not have to invent a dataset or a commit.
- `Artifact.kind` and `LogLine.level` are strings: a project keeps its own artifact kinds and log
  levels, and an unknown level renders with its raw name.
- `title` in `mount()` reaches the served HTML: the browser tab says what the installation is.
- The sidebar hides the screens an installation does not mount, using the capabilities of
  `/api/meta`.
- The runs table resizes: `[[columns]]` sets a starting width and a per-column `resizable` lock,
  `column_resize` locks the whole table. The resizer is a keyboard-operable separator (arrows,
  Shift for a larger step, double click to reset one column). Header ticks show the column
  boundary, and a numeric header sits over its numbers. After a resize, the Columns menu offers
  "Reset column widths". The user's widths and hidden columns are kept in the browser and win over
  the configuration.
- The sidebar collapses to icons; the choice is remembered per browser.
- `GET /api/runs/options` returns a compact project-wide list for the baseline and comparison
  pickers (`id`, `name`, `status`), so they no longer see only the current page. The list is
  capped (`limit`, up to 1000) and accepts `search`.
- `GET /api/runs/{id}/examples` and the optional provider method `list_examples`: the Examples tab
  of a run now has data. `/api/meta` reports it as `capabilities.runs.examples`.
- The runs list sends `page_size` as `limit`, so server-side pagination actually pages.
- Capabilities are read from the wrapped provider: an object provider without logs, artifacts or
  examples no longer claims them.
- The mount path lives in a meta tag instead of an inline script: a strict CSP needs no
  `'unsafe-inline'`. `docs/integration.md` has a security section (auth, actions, CSP, artifacts).
- The dead "Export CSV" button is removed from the list header; export stays a declared action.
- The generated client keeps the server's `detail` on `/runs` errors, like on the other paths.
- The release workflow builds the interface before the wheel (the wheel used to ship without it)
  and publishes with `uv publish dist/*` (there is no `--package` flag).
- `frontedge init my-dashboard` writes a runnable project in four files (`provider.py`,
  `frontedge.toml`, `app.py`, `README.md`); it refuses to overwrite without `--force`.
- `examples/minimal`: the same project, committed and runnable against two sample runs.
- CI builds the wheel, installs it into a clean venv, runs `frontedge init` and curls the served
  interface; it also checks that the npm tarball carries `dist/styles.css` and the license.
- The interface is English by default with a Russian toggle. Numbers, durations, relative times
  and byte sizes are formatted for the selected language; domain terms (Run, Dataset, Baseline,
  Eval) stay English in both.

## [0.1.0] — 2026-10-22

### Added

- Python package `frontedge`: domain model (runs, stages, metrics, artifacts, provenance,
  evals, datasets), provider protocol, mounts ready-made screens into any FastAPI app, SSE log
  streaming, SPA serving with runtime mount path.
- Interface configuration in TOML or JSON: column sets, tabs and declared actions.
- Project actions: handlers declared in code, invoked by id, results shown to the user.
- TypeScript type generator: pydantic models to `types.ts` and a typed client, pure Python.
- npm package `@frontedge/ui`: tokens, primitives and ML patterns, published as ESM and CJS
  with type declarations.
- Screens: runs list, run detail, eval diff, dataset explorer.
- Quality gates: token contrast against WCAG 2.2, axe audit, keyboard pass, Python contract
  tests, generated-type drift check.
