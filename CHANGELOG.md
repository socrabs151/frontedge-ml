# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The following are **public contracts** and change only in a major release:

- the `x-frontedge` role vocabulary;
- the canonical status set (`queued · running · succeeded · failed · cancelled · lost`);
- the freshness set (`live · fresh · stale · partial`);
- the HTTP paths under `/frontedge/api`.

## [Unreleased]

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
