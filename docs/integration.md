# Интеграция Frontedge

Документ для человека-разработчика. Если ты агент — у тебя есть [AGENTS.md](../AGENTS.md)
в корне репозитория: там тот же контракт в сокращённом виде и рецепт «добавить действие
за 10 минут».

---

## 1. Что это

Frontedge — готовый интерфейс для ML-проектов: список прогонов, детали прогона, сравнение
оценок, просмотр датасета. Ты подключаешь его к своему FastAPI-приложению и отдаёшь свои
данные через провайдера — библиотека ничего не знает про твою модель данных, кроме того, что
она описана объектами `frontedge.Run`, `frontedge.Eval` и `frontedge.Dataset`.

```python
from fastapi import FastAPI
import frontedge

app = FastAPI()
app.include_router(frontedge.mount(my_runs_provider))
# → http://127.0.0.1:8000/frontedge
```

Интерфейс и API отдаются тем же сервером: один процесс, один порт, никакого Node в проде.

## 2. Установка

```bash
uv add frontedge           # или: pip install frontedge
```

Пакет пока не опубликован (Phase 4). До публикации — из исходников:

```bash
uv add "frontedge @ git+https://github.com/socrabs151/frontedge-ml.git#subdirectory=python/frontedge"
```

Для своего фронта на компонентах:

```bash
npm i @frontedge/ui react react-dom
```

## 3. Провайдер: 20 строк

Провайдер — это функция или объект, который отдаёт прогоны. Библиотека не знает про
аутентификацию: она передаёт тебе `request`, решай сам.

```python
from datetime import UTC, datetime
from fastapi import Request
import frontedge

async def my_runs_provider(request: Request) -> list[frontedge.Run]:
    # Здесь твоя авторизация: request.user и т.д.
    rows = await my_repository.fetch_runs(request.user)
    return [
        frontedge.Run(
            id=str(row.id),
            name=row.name,
            status=frontedge.RunStatus(row.status),
            dataset=row.dataset,
            git_sha=row.git_sha,
            started_at=row.started_at,
            duration_ms=row.duration_ms,
            owner=row.owner,
            metrics={"accuracy": row.accuracy, "loss": row.loss},
            series={"accuracy": row.accuracy_curve},
            metric_direction={"accuracy": "maximize", "loss": "minimize"},
            stages=row.stages,
        )
        for row in rows
    ]

app.include_router(frontedge.mount(my_runs_provider))
```

**Что обязательно, что нет:**

| Метод | Обязателен | Без него |
|---|---|---|
| `list_runs(request)` | да | — |
| `get_run(request, run_id)` | да | — |
| `stream_logs(request, run_id)` | нет | вкладка «Логи» останется пустой |

Можно передать объект вместо функции — тогда доступны все три метода:

```python
class MyProvider:
    async def list_runs(self, request): ...
    async def get_run(self, request, run_id): ...
    async def stream_logs(self, request, run_id):    # async-генератор LogLine
        ...

app.include_router(frontedge.mount(MyProvider()))
```

## 4. Что монтируется

| Метод и путь | Что отдаёт |
|---|---|
| `GET /frontedge/api/runs` | список прогонов |
| `GET /frontedge/api/runs/{id}` | один прогон |
| `GET /frontedge/api/runs/{id}/logs/stream` | поток логов (SSE, `event: log`) |
| `GET /frontedge/api/evals` | список оценок (если подключён `evals=`) |
| `GET /frontedge/api/evals/{id}/compare?reference=&comparison=` | сравнение двух прогонов |
| `GET /frontedge/api/datasets` | список датасетов (если подключён `datasets=`) |
| `GET /frontedge/api/datasets/{id}` | датасет с примерами |
| `GET /frontedge/api/config` | конфигурация интерфейса (см. §5) |
| `GET /frontedge/api/meta` | словари статусов, свежести, направлений метрик |
| `POST /frontedge/api/actions/{id}` | выполнение действия проекта (см. §6) |

Несуществующий путь под `/frontedge/api/` даёт 404 в JSON, а не HTML.

## 5. Конфигурация: что показывать

Конфигурация — данные (TOML или JSON). Её можно править руками, из кода и позже
визуальным редактором: формат один и тот же.

```toml
# frontedge.toml в корне проекта
density = "default"          # compact | default | comfortable
theme = "light"              # light | dark

run_columns = ["name", "status", "ribbon", "dataset", "startedAt", "durationMs", "accuracy", "loss"]
```

```python
app.include_router(frontedge.mount(my_runs_provider, config="frontedge.toml"))
# или словарём:
app.include_router(frontedge.mount(my_runs_provider, config={"density": "compact"}))
```

`run_columns` — какие колонки показывать в списке прогонов. Доступные: `name`, `status`,
`ribbon`, `dataset`, `gitSha`, `startedAt`, `durationMs`, `accuracy`, `loss`. Пустой список —
показывать все.

## 6. Как добавить действие (кнопку)

Действие — это то, что **твой проект умеет** со своим прогоном: остановить, перезапустить,
выгрузить, отправить в очередь. Библиотека не знает про эти вещи и не придумывает их: кнопка
появляется в интерфейсе только если действие объявлено.

Два шага.

**Шаг 1 — обработчик в коде:**

```python
from fastedge import ActionResult
from fastapi import Request

async def stop_run(request: Request, payload: dict) -> ActionResult:
    run_id = payload["runId"]
    await my_repository.stop(run_id)
    return ActionResult(ok=True, message=f"Прогон {run_id} остановлен")
```

**Шаг 2 — объявить действие в конфигурации:**

```toml
[[actions]]
id = "stop"
label = "Остановить"
placement = "run"        # run | runs | evals | datasets
danger = true            # красная кнопка
description = "Останавливает прогон и освобождает GPU"
```

**Шаг 3 — зарегистрировать обработчик:**

```python
app.include_router(
    frontedge.mount(
        my_runs_provider,
        actions={"stop": stop_run},
        config="frontedge.toml",
    )
)
```

Готово: кнопка «Остановить» появится в шапке прогона, по клику выполнится обработчик, а его
`message` покажется под шапкой.

- `placement = "run"` — кнопка в шапке экрана прогона;
- `placement = "runs"` — кнопка в каждой строке списка;
- `payload` — то, что интерфейс кладёт в запрос: для `run` — `{"runId": "..."}`, для `runs` —
  тоже `runId` выбранной строки.

Действие, для которого нет обработчика, даёт 404 при вызове и не показывается в интерфейсе,
если его нет в конфигурации.

## 7. Свои экраны на наших компонентах

Если стандартных экранов не хватает — собери свой на примитивах. Токены и компоненты
приезжают из `@frontedge/ui`:

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
            <td className="fe-table__td num">{run.metrics.accuracy?.toFixed(3)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Не забудь про плотность и тему на корне приложения:

```html
<html data-theme="light" data-density="default">
```

и про шрифты: пакет не тянет их сам, добавь `@fontsource-variable/inter` и
`@fontsource/jetbrains-mono` (или свои).

Типы приходят из Python-моделей: `frontedge gen --out src/generated` создаёт `types.ts` и
`client.ts`, которые можно импортировать вместо ручных типов.

## 8. Разбор проблем

| Симптом | Причина | Что делать |
|---|---|---|
| 503 «Интерфейс не собран» | в пакете нет собранного UI | `pnpm build:ui` в репозитории frontedge, затем пересобери пакет |
| `/frontedge/api/...` отдаёт HTML | так ведёт себя SPA-fallback на неизвестных путях вне `/api` | так и должно быть; проверь, что не перепутал `/api` и корень |
| Кнопка не появляется | действия нет в конфигурации или у него нет `placement` | проверь `frontedge.toml` и `GET /frontedge/api/config` |
| Логи не идут | у провайдера нет `stream_logs` | добавь метод (async-генератор `LogLine`) |
| Путь монтирования не `/frontedge` | собранный интерфейс жёстко привязан к `/frontedge` | пока поддерживается только `/frontedge` |

## 9. Что пока не поддерживается

- Путь монтирования отличается от `/frontedge` (собранный UI привязан к префиксу).
- Своя аутентификация в библиотеке — она передаёт `request` провайдеру, решай там.
- Свои типы данных: модель фиксирована (`frontedge.Run`, `frontedge.Eval`, `frontedge.Dataset`). Свои поля — через
  `metrics`, `series` и `provenance`.
