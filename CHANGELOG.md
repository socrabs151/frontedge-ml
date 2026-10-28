# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The following are **public contracts** and change only in a major release:

- the `x-frontedge` role vocabulary;
- the canonical status set (`queued · running · succeeded · failed · cancelled · lost`);
- the freshness set (`live · fresh · stale · partial`);
- the interface configuration keys (`project`, `density`, `theme`, `run_columns`, `columns`,
  `column_resize`, `metrics`, `eval_tabs`, `actions`, `live_refresh_seconds`, `baseline_run`,
  `page_size`);
- the HTTP paths under `/frontedge/api`.

## [0.5.0] — 2026-10-28

### Added

- `mount(..., provider_timeout=30)` bounds a provider call and log-stream event; a hung provider
  answers 504 and a silent stream gets an `error` line instead of an endless keepalive. `None`
  disables the limit.
- `frontedge check --provider` now exercises examples and logs, validates the first log line and
  reports a broken optional method instead of calling it healthy from the attribute alone.
- `I18nProvider` accepts any BCP 47 language with partial strings (missing keys fall back to
  English), and `plural()` selects the locale form for a count.
- `styles.css` is still the whole design system, and `tokens.css`, `base.css`, `components.css`
  and `patterns.css` are available as ordered subpath imports for a host that wants to trim it.
- A log reconnect may send `Last-Event-ID`; the server resumes after that id.
- `Run.created_at` and `Run.finished_at` are optional timestamps; the run detail shows them when
  the provider sends them.

### Changed

- A real delta below the shown precision reads `<0.001`, not `±0`; exact zero keeps `±0`.
- `pnpm demo` honours `PORT`; the development docs separate the mock spike from the FastAPI demo,
  show `check:lang -- --no-browser`, and no longer claim generated types cannot drift.
- Typography tokens are `rem`, so the host root font size scales the interface.
- Dataset, duration, freshness and ribbon columns have wider defaults; the column resizer sits
  inside its header. Russian headers wrap and a clipped status has a title, so no table cell
  overflows its width.

### Fixed

- A sync provider method or any unexpected check error is reported as a message, not a traceback.

## [0.4.0] — 2026-10-28

### Added

- Timestamps are timezone-aware end to end: a naive `datetime` is rejected with a 502 instead of
  being shifted silently by the browser, and unknown model fields are rejected too.
- `FrontedgeRoot` sets `.fe-root`, theme and density in one place; `useNow()` keeps relative times
  ticking. `RunsTable` now needs only `runs`; `now`, `rowHeight` and column visibility have
  sensible defaults, and the row height follows `--fe-row-h`.
- Actions take `statuses`: Stop is not offered for a failed run and Restart is not offered for a
  running one. Compare can add and remove runs on the screen and clamps a pasted URL to 2–4.
- The metric chart is keyboard-inspectable, Segmented is a real arrow-key radio group, the stage
  ribbon has a spoken summary, and the eval input is a disclosure instead of a clipped cell.
- A missing run says so and offers no misleading “Clear filters”; a log-stream failure stays in
  the log panel and can be reconnected without replacing the run.
- `--fe-accent` now drives hover, wash, selected rows, the running status and the focus ring, and
  the contrast gate checks muted text on a selected row. Component prop types are exported.
- Run ids with a slash are addressable and `logStreamUrl` is URL-encoded; the generated client
  has `RunPayload`, `logStreamUrl` and `FrontedgeRequestError.status`. `frontedge gen --check`
  catches stale generated files.

### Changed

- An API request without `limit` returns a 200-row page, not the whole corpus.
- `Stream logs` failures are an `error` event; the client exposes the HTTP status on a failure.

### Fixed

- Narrow windows collapse the sidebar, tables show a scrollbar, and a bounded table keeps a
  usable minimum height. Russian labels no longer mix adjective and domain-term order.

## [0.3.0] — 2026-10-28

### Added

- `frontedge[serve]` installs uvicorn, so the quick start (`pip install "frontedge[serve]"`,
  `frontedge init`, `uvicorn app:app`) works without a second install.
- `frontedge.mount(..., dependencies=[Depends(...)])` guards every mounted route, including the
  static interface; the library still owns no authentication policy.
- A `Run` needs only `id`, `name` and `status`; `metrics`, `series` and `stages` default to empty,
  and a negative `duration_ms` is rejected at the boundary.
- The implicit baseline is pinned after the first load: sorting or paging no longer changes what
  the deltas mean, and the footer keeps naming the same run.
- `Tooltip` carries its own provider, so a host that renders one without a surrounding
  `TooltipProvider` no longer crashes.
- Tables expose accessible names (`Runs table`, `Dataset examples`), and the compare legend shows
  the run's reported metric value, the same number as the table.
- A bounded table keeps at least 200 px of rows at a short viewport instead of collapsing to a
  sliver.

- `RunsTable` takes `cellRenderers` and `headerRenderers`: a host can add a link, a model name or
  an action column by id without forking the table. The column keeps its width, resize lock and
  visibility; a custom id that is not a metric is not sortable. The consumer smoke renders a
  custom column with a product dictionary override.
- Dataset examples open a drill-down from a click or Enter: full input, answer, expected and
  score, with the selected row marked and a close action. The browser gate audits the panel.
- The eval comparison table takes `height` and bounds its scroll, so a long comparison keeps the
  aggregate row visible instead of growing the page. `apps/spike/scripts/eval-scale.mjs` renders a
  synthetic 1 000-row comparison through the real screen (locally ~1.2 s) and is a CI check.
- The demo gives failed, lost and cancelled runs a real error and exit code, so failure triage is
  visible instead of an empty reason.
- Freshness is visible: the run header shows a dot + word for `live`, `fresh`, `stale` and
  `partial`, and the runs table offers a `freshness` column with the same badge. The live pulse
  respects `prefers-reduced-motion`.
- The eval comparison (eval, reference, comparison, filter, number format and tab) and the dataset
  screen (dataset, tab, open example, search and page) live in the URL hash: a link restores the
  view after a reload, and the back button updates the screen.

### Fixed

- Keyboard navigation waits for the virtual row to render before focusing it. WebKit commits a
  row later than Chromium, and Home/PageUp/PageDown used to drop focus after End.
- Any provider exception is a 502 whose `detail` names the method and the message, not an opaque
  500; a provider that fails mid-stream emits an `error` event instead of closing silently.
- A second `list_runs` argument is treated as the selection only by its name or annotation: a
  positional flag such as `include_archived=False` no longer stops filtering.
- `frontedge gen` writes LF on Windows, so the generated files do not drift in CI.
- The static 503 names `pnpm build:ui`, and the document-cache test skips on a source tree like the
  other interface tests.

## [0.2.0] — 2026-10-27

### Added

- Provider-side paging for run examples and dataset examples: `list_examples(request, run_id,
  query)` and `list_dataset_examples(request, dataset_id, query)` take `ExamplesQuery` and return
  `ExamplesPage` / `DatasetExamplesPage` with the total, so a page no longer materialises the
  corpus. A provider without the query keeps the in-memory fallback.
- Multi-run comparison: a **Compare** mode in the runs list selects 2–4 runs (Space or Enter
  toggles a row), `#/compare?runs=…` is linkable, the metrics are overlaid on a shared axis with
  the run names in the legend, and the config matrix marks every parameter that differs.
- `RunsTable` takes `height`, `loading` and `empty`: a host that is not a flex column can bound the
  scroll area and own the loading/empty copy without reproducing the internal layout.
- `I18nProvider` takes product `strings`, a controlled `lang` with `onLangChange`, `persist` and
  `syncDocument`; the dictionary can be overridden per language, and a host can keep
  `localStorage` and `<html lang>` to itself.
- The columns menu is a single `menuitemcheckbox` with a presentational check (no nested checkbox),
  the density radios have spoken names, table sparklines are decorative and the metric direction
  has a screen-reader word; the unused Radix checkbox dependency is gone.
- Eval evidence: the comparison rows carry `expected`, `reference_output` and `comparison_output`
  (with `output` as the compatibility fallback), so the table shows the gold answer and both run
  answers instead of only scores. The examples filter is All / Changed / Improved / Worsened
  (improved/worsened follow the metric direction and are hidden when it is `none`), and the delta
  column sorts by the number with nulls last. A null value is an en dash, an empty string is a word,
  and long evidence is a native disclosure.
- `Run.params`: a JSON object with the run configuration. The run detail has a **Config** tab;
  with a baseline it becomes a diff where every row says `changed`, `added` or `removed`, and
  nested objects render as JSON.
- Artifact streaming: `stream_artifact(request, artifact_id, start, end)` and
  `artifact_meta(request, artifact_id)` let the content endpoint send a 206 `Range`, a `HEAD`,
  `ETag` / `If-None-Match` and `Last-Modified` / `If-Modified-Since` without buffering the file.
  The bytes fallback still works and gets ranges and an ETag in memory.

### Changed

- `GET /api/datasets/{id}` is metadata only: the examples live on `/api/datasets/{id}/examples`.
  The detail response no longer carries the full example list, and `DatasetDetail.examples`
  defaults to empty.

## [0.1.1] — 2026-10-25

### Changed

- The install instructions point at PyPI and npm now that the packages are published; a source
  checkout stays the development path.
- Releases publish through Trusted Publishing (OIDC): npm adds provenance automatically and
  neither registry needs a long-lived token in the repository.

## [0.1.0] — 2026-10-25

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
- `project` names the installation: the top bar shows its chip and the runs subtitle says whose
  runs these are. Without the key the chip is hidden and the subtitle reads "All runs".
- The runs list sorts on the server: `sort` and `order` go to the provider, or the library sorts
  in memory with missing values last. A column header sets both and resets paging to the first page.
- The whole runs view is linkable: search, status, dataset, tag, sort, order, page and baseline
  live in the hash, so a reload or a shared link restores the filters, not just the screen.
- Python package `frontedge`: domain model (runs, stages, metrics, artifacts, provenance,
  evals, datasets), provider protocol, mounts ready-made screens into any FastAPI app, SSE log
  streaming, SPA serving with runtime mount path.
- Interface configuration in TOML or JSON: column sets, tabs and declared actions.
- Project actions: handlers declared in code, invoked by id, results shown to the user.
- TypeScript type generator: pydantic models to `types.ts` and a typed client, pure Python.
- npm package `@frontedge-ml/ui`: tokens, primitives and ML patterns, published as ESM and CJS
  with type declarations.
- Screens: runs list, run detail, eval diff, dataset explorer.
- Quality gates: token contrast against WCAG 2.2, axe audit, keyboard pass, Python contract
  tests, generated-type drift check.
- The release workflow builds the wheel, checks that the tag matches both package versions and
  runs the language audit before publishing.

### Changed

- Tokens carry the `fe-` prefix (`--fe-surface`), so the npm package never overwrites the host
  application's variables.
- Base styles are scoped to `.fe-root` and to the portalled surfaces: importing the package no
  longer restyles the host document.
- `@frontedge-ml/ui/styles.css` is one built file; the `@import`s are inlined at build time.
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
- The baseline row in the list carries a reference edge and the footer names the baseline
  ("deltas are relative to exp-002-warm"); the name column keeps its width for the run name.
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
- Python 3.11 is supported (was 3.12 only), the package ships `py.typed`, and the classifiers and
  the license file are in the wheel. `ruff` and `mypy` run in CI, and a separate job tests 3.11.
- The npm consumer smoke installs the packed tarball into a fresh Vite app on **React 18**,
  type-checks it, builds it and renders the table in a browser.
- Hashed assets are served with a one-year immutable cache; `index.html` stays `no-cache`. The
  deployment notes cover a reverse proxy and the SSE stream.
- The artifact Download link is hidden when the provider does not serve content, instead of
  leading to a 404.
- Runs, evals and datasets live in the URL hash (`#/runs/run-003`): a run is linkable, survives a
  reload, and the browser's back button works.
- `Stage.name` is free-form: the four canonical names remain, but `tokenize`, `embed` or `deploy`
  are allowed. Only the status set stays closed.
- `Run.started_at` and `Run.duration_ms` are optional; a queued run shows en dashes.
- The browser gate audits the loading, empty and error states with axe, and runs on Firefox and
  WebKit in CI next to Chromium (`FE_BROWSER`).
- `Run.tags`: a free list of project labels. The toolbar filters by one tag (server-side through
  `query.tag`), the `tags` column shows chips, and the run header lists them.
- Run examples are paged (`offset`, `limit`, `changed` for "differences only") with the total in
  `X-Frontedge-Total`; dataset examples have their own paged, searchable endpoint. Both screens
  show a Prev/Next pager instead of loading every example.
- The runs list downsamples each series to 24 points for the sparkline; the detail keeps the full
  series. The test suite lists a 10 000-run project with `limit` and picks from it.
- The baseline and comparison pickers search the compact endpoint (`search`), so a run outside the
  current page is selectable; the chosen baseline is fetched by id, so the deltas do not disappear.
- The npm package is `@frontedge-ml/ui`: the scope `frontedge` was already taken on npm, so the
  imports, the badges and the release filter use the repository's name. PyPI stays `frontedge`.
- The interface is English by default with a Russian toggle. Numbers, durations, relative times
  and byte sizes are formatted for the selected language; domain terms (Run, Dataset, Baseline,
  Eval) stay English in both.
- Relative times follow the real clock; the demo generates its data from the server start, so
  "2 h ago" means two hours ago instead of a fixed date.
- The dataset filter lists the datasets the runs actually have, not the demo fixtures.

### Fixed

- A declared action runs only when its id is in the configuration there and then; the provider
  callable is not a way around the allowlist. A re-read or an action removed from the file stops
  being callable.
- An artifact's `Content-Disposition` filename is sanitised, so a model name cannot inject a
  header or a path.
- `CallableProvider.get_run` coerces a mapping into a `Run` like the list does, instead of handing
  a dict to the screen.
- The SSE queue is bounded: a slow client can no longer grow the server's memory without limit.
- `frontedge init` loads the generated provider from the project's directory and instantiates a
  class provider (`provider = Provider()`), so the scaffold starts with `uvicorn app:app`.
- The generated client encodes the run id in `get_run` and `stream_logs`.
- A provider's second parameter is no longer assumed to be the selection: a keyword-only switch
  (`list_runs(request, *, include_archived=False)`) keeps the list on the fallback path instead
  of receiving a `RunsQuery` it never expected.
- The runs query is validated: an unknown status or sort key and a `limit` outside 1–1000 are
  422 instead of an empty list, a silent fallback or a 500 from comparing dicts.
- `/frontedge/index.html` goes through the same mount/title substitution as `/`, so a proxy that
  rewrites the root to the file does not serve raw placeholders.
- An action handler that raises is a 502 that names the action, and an action declared without
  a handler is no longer served to the browser as a button that cannot work.
- `frontedge check` names duplicate ids even when another key fails validation, and warns about
  a column id that is neither built-in nor declared as a metric.
- The generated client takes `credentials` and `headers`, so a cookie session, a CSRF token or
  an API key reaches every call including the log stream; `docs/integration.md` shows the CORS
  setup a separate origin needs.
- `changed=true` with no baseline no longer counts every example as changed.
- The Russian interface formats numbers with a comma decimal separator, and the three column
  headers that were hardcoded English now go through the dictionary; the language audit also
  catches a literal `header: "..."`.
