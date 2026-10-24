# Minimal Frontedge dashboard

Two sample runs, one custom metric, one configuration file — the shortest path from zero to the
interface. Nothing here is specific to this repository: copy the three files into your project.

From the repository root:

```bash
uv sync --all-packages
cd examples/minimal
uv run uvicorn app:app --port 8010
```

Open http://127.0.0.1:8010/frontedge.

- `provider.py` — the only file that touches data: replace the sample runs in `list_runs` and
  `get_run` with a query to your database.
- `frontedge.toml` — the columns, the metrics and the actions. `frontedge check` validates it.
- `app.py` — FastAPI plus `frontedge.mount`.

Outside this repository, create the same project with `frontedge init my-dashboard`. The full
contract is in [docs/integration.md](../../docs/integration.md).
