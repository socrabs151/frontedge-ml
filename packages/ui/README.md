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
  a baseline delta, log stream, eval comparison table, dataset table, provenance list.

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

## Types

The types are generated from the Python models, so they cannot drift from the API:

```bash
frontedge gen --out src/generated
```

## Notes

- React 18+ is a peer dependency.
- The package is CSS-first: no Tailwind, no CSS-in-JS, no runtime style injection. Tokens are
  CSS custom properties, so any styling approach works on top.
- Contrast of every token pair is checked in CI against WCAG 2.2.

MIT.
