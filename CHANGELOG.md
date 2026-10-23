# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The following are **public contracts** and change only in a major release:

- the `x-frontedge` role vocabulary;
- the canonical status set (`queued · running · succeeded · failed · cancelled · lost`);
- the freshness set (`live · fresh · stale · partial`);
- the interface configuration keys (`density`, `theme`, `run_columns`, `eval_tabs`, `actions`,
  `live_refresh_seconds`, `baseline_run`, `page_size`);
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

### Changed

- Tokens carry the `fe-` prefix (`--fe-surface`), so the npm package never overwrites the host
  application's variables.
- Base styles are scoped to `.fe-root` and to the portalled surfaces: importing the package no
  longer restyles the host document.
- `@frontedge/ui/styles.css` is one built file; the `@import`s are inlined at build time.
- Components fall back to English when no `I18nProvider` is mounted, so a single pattern can be
  dropped into an existing application.
- `frontedge.toml` rejects unknown keys instead of ignoring them.
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
