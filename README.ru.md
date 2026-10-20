# frontedge

> Фронтенд-слой для ML-инжиниринга: переиспользуемый слой интерфейса, который монтируется в
> любое FastAPI-приложение и понимает природу ML-данных — прогоны, датасеты, оценки, трейсы, артефакты.

[![license](https://img.shields.io/badge/license-MIT-yellow.svg)](LICENSE)
[![status](https://img.shields.io/badge/status-phase%201%20spike-informational.svg)](docs/specs/2026-10-20-frontedge-design.md)
[![node](https://img.shields.io/badge/node-22%2B-5FA04E.svg)](package.json)
[![ci](https://github.com/socrabs151/frontedge-ml/actions/workflows/ci.yml/badge.svg)](https://github.com/socrabs151/frontedge-ml/actions/workflows/ci.yml)

[English](README.md) · **Русский**

Исходники: **https://github.com/socrabs151/frontedge-ml**

```python
app.include_router(frontedge.mount(runs_provider, evals=eval_provider, datasets=dataset_provider))
```

> **Статус:** Phase 3. Дизайн-система и четыре экрана — список прогонов, детали прогона,
> сравнение оценок и исследователь датасета — на синтетических данных, смонтированы в
> настоящий FastAPI. Публикация npm и PyPI-пакетов — Phase 4.
> Полный дизайн-документ: [`docs/specs/2026-10-20-frontedge-design.md`](docs/specs/2026-10-20-frontedge-design.md).

## Что это

Frontedge — не ещё один админ-шаблон. Фронтенд знает, что такое прогон, эталон, дельта метрики,
окно свежести и запись провенанса, поэтому показывает их без описания заново в каждом проекте.

- **Runs** — таблица с таймлайнами стадий, дельтами к закреплённому эталону и спарклайнами
  метрик прямо в строке.
- **Детали прогона** — метрики по шагам, оценка на примерах, живые логи по SSE, артефакты,
  провенанс.
- **Eval diff** — сравнение двух прогонов по примерам: примеры-строки, колонки по ролям,
  эталон закреплён слева, фильтр «только различия» и переключатель формата числа.
- **Dataset** — версии, примеры, datasheet (мотивация, состав, сбор, применения) и провенанс.

## Структура репозитория

```
frontedge/
├── packages/ui/            @frontedge/ui — токены, примитивы, ML-паттерны
│   ├── src/styles/         tokens.css · base.css · components.css · patterns.css
│   ├── src/components/     Button · StatusBadge · Search · Sparkline · Tabs · Tooltip
│   ├── src/patterns/       RunRibbon · RunTimeline · RunsTable · MetricChart · LogStream
│   ├── src/generated/      TypeScript-типы, сгенерированные из Python-моделей
│   └── scripts/            check-contrast.mjs — гейт WCAG-контраста
├── python/frontedge/       Python-пакет: модели, провайдеры, роутеры, генератор типов
├── apps/spike/             приложение-спайк Phase 1 (Vite + React + TS)
│   ├── src/screens/        RunsScreen · RunDetailScreen
│   ├── src/data/           мок-данные и слой источника данных (мок или API)
│   └── scripts/            verify.mjs (скриншоты + axe) · keyboard-check.mjs
├── examples/demo-ml/       FastAPI-приложение с фейковым ML-бэкендом и смонтированным frontedge
└── docs/specs/             дизайн-документ
```

npm-пакет собирается из `packages/ui`, Python-пакет — из `python/frontedge`.

## Команды

```bash
pnpm install
pnpm dev                # спайк на http://localhost:5173
pnpm typecheck          # tsc по всем пакетам
pnpm check:contrast     # контраст токенов по WCAG 2.2, обе темы
pnpm build              # продакшн-сборка спайка
pnpm build:ui           # сборка интерфейса + копирование в Python-пакет
pnpm gen:types          # перегенерировать TS-типы из Python-моделей
pnpm demo               # демо на FastAPI: http://127.0.0.1:8000/frontedge
uv sync --all-packages  # окружение Python
node apps/spike/scripts/verify.mjs        # скриншоты + axe-аудит (нужен запущенный dev-сервер)
node apps/spike/scripts/keyboard-check.mjs # клавиатурный прогон таблицы
```

## Дизайн-система

- **Токены** — `packages/ui/src/styles/tokens.css`: цвет, типографика, плотность, радиусы,
  движение. Светлая тема по умолчанию, тёмная по запросу; цвета серий графиков в обеих темах
  одинаковые.
- **Плотность** — строки 28 / 32 / 40 px, переключается атрибутом `data-density` на `<html>`.
- **Тип** — Inter для интерфейса, JetBrains Mono для данных, логов и идентификаторов. Оба
  self-hosted, без CDN.
- **Иконки** — Lucide, `currentColor`, толщина штриха по весу текста рядом.

Правила, которые не обсуждаются (см. §4 дизайн-документа):

- цвет никогда не единственный носитель смысла: статус = иконка + слово + цвет;
- «лучше» и «хуже» — это знак и слово, а не зелёный и красный;
- числа табличные и выравнены вправо, отсутствующее значение — тире, а не пустая ячейка;
- таблицы, а не карточки; hairline-разделители, никогда зебра;
- глубина — границы и сдвиги поверхностей, тени только у оверлеев;
- `prefers-reduced-motion` уважается, анимируются только `transform` и `opacity`.

## Лицензия

MIT — свободное использование, изменение и распространение, включая коммерческое.
