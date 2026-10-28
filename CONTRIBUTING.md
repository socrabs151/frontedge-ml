# Contributing

Thanks for considering a contribution. The project is small enough that a short note about
what you want to change is enough before you start.

## Getting set up

```bash
pnpm install
uv sync --all-packages
```

## Before you open a pull request

```bash
pnpm typecheck
pnpm check:contrast
pnpm build:ui
pnpm check:lang -- --no-browser
uv run --package frontedge pytest python/frontedge/tests -q
```

Browser gates need a running demo and a Chromium-family browser:

```bash
pnpm demo                                   # in one terminal
FE_BASE_URL=http://127.0.0.1:8000/frontedge node apps/spike/scripts/verify.mjs
FE_BASE_URL=http://127.0.0.1:8000/frontedge node apps/spike/scripts/keyboard-check.mjs
FE_BASE_URL=http://127.0.0.1:8000/frontedge pnpm check:lang
```

CI runs all of these on every pull request, including the axe audit, the keyboard pass and the
language audit. It also regenerates the TypeScript types and fails when they differ from what is
committed.

## House rules

- **English** for commits, pull request descriptions, documentation and code comments.
- **Conventional Commits**: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`, `perf:`,
  `build:`, `ci:`. The subject is imperative, up to 72 characters, no trailing dot.
- **Tokens, not literals.** Colour, spacing, radii and type sizes come from
  `packages/ui/src/styles/tokens.css`. A new colour means a token *and* a line in
  `packages/ui/scripts/check-contrast.mjs`.
- **Components live in one place.** Primitives in `packages/ui/src/components`, ML patterns in
  `packages/ui/src/patterns`. Look for an existing one before adding a new one.
- **Types are generated.** Change the pydantic model in
  `python/frontedge/src/frontedge/models.py`, then run `pnpm gen:types`. Never edit
  `packages/ui/src/generated/` by hand.
- **The interface does not invent behaviour.** Buttons come from declared actions, not from
  hardcoded handlers in components. See [docs/integration.md](docs/integration.md).
- **The configuration is data.** What the interface shows is described by `UiConfig` in
  `python/frontedge/src/frontedge/config.py` and lives in `frontedge.toml` (TOML or JSON). A new
  key is a change of the public contract: add the field to `UiConfig` and describe it in
  [docs/integration.md](docs/integration.md).
- **Public vocabularies.** The `x-frontedge` roles, the status set, the freshness set and the
  configuration keys are public contracts. Extend them freely; rename them only in a major
  release.
- **Design changes follow the design document**
  ([docs/specs/2026-10-20-frontedge-design.md](docs/specs/2026-10-20-frontedge-design.md)):
  status is icon + word + colour, "better" and "worse" are a sign and a word, tables instead
  of cards, hairline separators instead of zebra striping.

## Design decisions

Anything that changes how the product looks or behaves goes through the design document first.
Record the decision, the reason and what it replaces — a short entry is enough.

## Stands and prototypes

Exploration material — comparison stands, prototypes, logo drafts — does not belong in the
repository. Keep it outside; only what the product needs goes in.
