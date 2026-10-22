# @frontedge/ui

Design system and ML interface patterns for [frontedge](https://github.com/socrabs151/frontedge-ml)
— the frontend layer for ML engineering.

```bash
npm i @frontedge/ui react react-dom
```

## What is inside

- **Tokens** — colour, typography, density (28/32/40 px rows), radii, motion. Light theme by
  default, dark theme by attribute. Series colours are identical in both themes.
- **Primitives** — button, status badge, search, tabs, tooltip, segmented control, sparkline,
  empty and loading states.
- **ML patterns** — run ribbon, stage timeline, runs table with virtualisation, metric cell with
  a baseline delta, metric chart, log stream, eval comparison table, dataset table, examples
  table, column menu, provenance list.

## Usage

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
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Set the theme and density on the root element:

```html
<html data-theme="light" data-density="default">
```

The package does not load fonts itself — add the ones you use:

```bash
npm i @fontsource-variable/inter @fontsource/jetbrains-mono
```

## Configuration and actions

The columns of the runs table and the buttons in it are never hardcoded: they come from the
configuration of the project (`frontedge.toml`), which the server hands to the browser as
`UiConfig`.

```toml
run_columns = ["name", "status", "ribbon", "dataset", "startedAt", "durationMs", "accuracy", "loss"]

[[actions]]
id = "stop"
label = "Stop"
placement = "run"        # run | runs | evals | datasets
danger = true
```

The pattern takes the ids of the columns and the actions and builds the table itself:

```tsx
<RunsTable
  runs={runs}
  baselineId={baselineId}
  now={Date.now()}
  rowHeight={32}
  columnVisibility={visibility}
  onColumnVisibilityChange={setVisibility}
  onOpenRun={openRun}
  columnIds={config.runColumns}
  rowActions={[{ id: "stop", label: "Stop", danger: true, onClick: stop }]}
/>
```

An unknown column id is built from the `metrics` dictionary of the run, so a project can show
its own metrics without touching the package.

## Types

The types are generated from the Python models, so they cannot drift from the API:

```bash
frontedge gen --out src/generated
```

The package re-exports the generated types and a typed client (`createClient`, with
`basePath` defaulting to `/frontedge/api`).

## Notes

- React 18+ is a peer dependency.
- The package is CSS-first: no Tailwind, no CSS-in-JS, no runtime style injection. Tokens are
  CSS custom properties, so any styling approach works on top.
- Contrast of every token pair is checked in CI against WCAG 2.2, in both themes.

MIT.
