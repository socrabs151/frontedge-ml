# AGENTS.md

Instructions for an agent working in this repository.

## What this is

`frontedge` is a frontend layer for ML engineering: a Python package that mounts ready-made
screens into any FastAPI app, and an npm package `@frontedge/ui` with the design system.
The current stage is **Phase 3**: the design system, four screens, the Python package and the
type generator work and are covered by gates. Publication to PyPI and npm is Phase 4.

Read `docs/specs/2026-10-20-frontedge-design.md` first. It is the source of truth for the
product, the visual language and the contracts. Do not invent design — follow §4.

## Commands

```bash
pnpm install
pnpm dev                          # the spike app on http://localhost:5173
pnpm typecheck                    # required before a commit
pnpm check:contrast               # WCAG contrast of every token pair, both themes
pnpm build:ui                     # build the interface and copy it into the Python package
pnpm gen:types                    # regenerate the TypeScript types from the Python models
pnpm demo                         # the demo on FastAPI: http://127.0.0.1:8000/frontedge
uv sync --all-packages            # the Python workspace
uv run --package frontedge pytest python/frontedge/tests -q
node apps/spike/scripts/verify.mjs         # screenshots + axe (a running dev server is required)
node apps/spike/scripts/keyboard-check.mjs # keyboard pass over the table
pnpm check:lang                            # language audit: English repo and interface, switched by the toggle
```

Against the running demo: `FE_BASE_URL=http://127.0.0.1:8000/frontedge node apps/spike/scripts/verify.mjs`.

## Commits

- **English.** Messages, pull request descriptions and code comments.
- **Conventional Commits.** `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`, `perf:`,
  `build:`, `ci:`. Scopes when useful: `feat(ui):`, `fix(python):`, `docs:`.
- The subject is imperative, up to 72 characters, no trailing dot. The body says why and what
  changed, with a negative list ("not changed: …") when that matters for review.
- Never mention tools or process in a commit message: a commit describes the change in the code,
  not the way it was produced.

## Contracts

**Tokens** come from `packages/ui/src/styles/tokens.css` only. Do not write hex values, pixel
radii or font sizes in components: a new colour is a line in `tokens.css` plus a line in
`packages/ui/scripts/check-contrast.mjs`.

**Class names** carry the `fe-` prefix. A component in `packages/ui/src/components` is a
primitive; one in `packages/ui/src/patterns` is an ML pattern (it knows about run, dataset, eval,
trace).

**Dependencies** stay minimal. Today: React, Radix, TanStack Table/Virtual, clsx, Lucide. A new
dependency needs a justification in the pull request: what exactly cannot be done in 50 lines.

**Interface language** is English by default with a Russian toggle. Strings live in a
dictionary (`packages/ui/src/i18n/strings.ts` for the package, `apps/spike/src/i18n.ts` for the
app); components never carry a literal. Domain terms stay English in both languages.

**Public vocabularies** are frozen contracts: the `x-frontedge` roles, the status set
(`queued · running · succeeded · failed · cancelled · lost`), the freshness set
(`live · fresh · stale · partial`) and the paths under `/frontedge/api`. Extend them, never
rename them in a minor release.

**Providers** (Python package) are three independent sources: runs (`list_runs` / `get_run` /
`stream_logs`), evaluations (`list_evals` / `compare_evals`) and datasets (`list_datasets` /
`get_dataset`). Mount them with
`frontedge.mount(runs, evals=..., datasets=..., path="/frontedge")`. The library has no
authentication: the `request` is passed to the provider, so access control stays in the app.

**Types** are generated from the Python models: `packages/ui/src/generated/types.ts`
(`pnpm gen:types`). Never edit them by hand — change the pydantic model in
`python/frontedge/src/frontedge/models.py` and regenerate. CI fails when the generated file
drifted from the models.

## Anti-patterns

- A table of runs built from cards. A table, yes; cards, no (comparing neighbouring values).
- Zebra striping in a table. Hairline separators only.
- `green = better`, `red = worse`. Colour does not carry "better": the owner of the metric sets
  the direction.
- A status shown with colour alone. It needs an icon and a word.
- `transition: all`, animating `width/height`, `scale(0)`, motion without
  `prefers-reduced-motion`.
- A shadow on a card or a button. Depth comes from borders and surface shifts.
- An empty cell instead of an en dash.
- A new component next to an existing primitive: look for what is already there first.
- A login, an icon or a status in colour without text.

## Before handing over

1. `pnpm typecheck` — no errors.
2. `pnpm check:contrast` — every pair passes.
3. `node apps/spike/scripts/verify.mjs` — axe: 0 critical/serious; look at the screenshots.
4. `node apps/spike/scripts/keyboard-check.mjs` — the keyboard still works.
5. `pnpm check:lang` — no Cyrillic outside the dictionaries; no untranslated literal.
6. Check against §4 of the design document: no defaults crept in that are not in there.
