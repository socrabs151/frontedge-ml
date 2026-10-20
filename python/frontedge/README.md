# frontedge

Фронтенд-слой для ML-инжиниринга: готовая дизайн-система и экраны, которые монтируются
в любое FastAPI-приложение.

```python
from fastapi import FastAPI
import frontedge

app = FastAPI()
app.include_router(frontedge.runs(runs_provider=my_provider))
```

Провайдер отдаёт объекты `frontedge.Run`; библиотека не знает про аутентификацию и
передаёт `request` провайдеру, поэтому доступ к данным остаётся на стороне приложения.

## Что внутри

- `frontedge.runs(provider, mount="/frontedge")` — роутер: список прогонов, детали,
  поток логов (SSE), метаданные и раздача собранного интерфейса.
- `frontedge.models` — доменная модель: `Run`, `Stage`, `MetricPoint`, `Artifact`,
  `Example`, `LogLine`, статусы и свежесть.
- `frontedge gen --out src/generated` — генератор TypeScript-типов и клиента из
  pydantic-моделей. Чистый Python, Node не нужен.

Полное описание продукта и визуального языка:
[design document](https://github.com/socrabs151/frontedge-ml/blob/main/docs/specs/2026-10-20-frontedge-design.md).

MIT.
