# frontedge

Фронтенд для ML-инжиниринга: переиспользуемый слой интерфейса, который монтируется в любой
FastAPI-проект и знает про природу ML-данных — прогоны, датасеты, оценки, трейсы, артефакты.

```python
app.include_router(frontedge.runs(runs_provider=my_repo))
```

> **Статус:** Phase 1 (дизайн-спайк). Дизайн-система и два экрана — список прогонов и
> детали прогона — на мок-данных. Реальный FastAPI-монтаж — Phase 2.
> Полный дизайн-документ: [`docs/specs/2026-10-20-frontedge-design.md`](docs/specs/2026-10-20-frontedge-design.md).

## Что внутри

```
frontedge/
├── packages/ui/            @frontedge/ui — токены, примитивы, ML-паттерны
│   ├── src/styles/         tokens.css · base.css · components.css · patterns.css
│   ├── src/components/     Button · StatusBadge · Search · Sparkline · Tabs · Tooltip
│   ├── src/patterns/       RunRibbon · RunTimeline · RunsTable · MetricChart · LogStream
│   └── scripts/            check-contrast.mjs — гейт WCAG-контраста
├── apps/spike/             приложение-спайк Phase 1 (Vite + React + TS)
│   ├── src/screens/        RunsScreen · RunDetailScreen
│   ├── src/data/mock.ts    синтетические прогоны, примеры, логи
│   └── scripts/            verify.mjs (скриншоты + axe) · keyboard-check.mjs
└── docs/                   дизайн-документ и спецификация
```

## Команды

```bash
pnpm install
pnpm dev                # спайк на http://localhost:5173
pnpm typecheck          # tsc по всем пакетам
pnpm check:contrast     # контраст токенов по WCAG 2.2, обе темы
node apps/spike/scripts/verify.mjs        # скриншоты + axe-аудит (нужен запущенный dev-сервер)
node apps/spike/scripts/keyboard-check.mjs # клавиатурный прогон таблицы
```

## Дизайн-система

- **Токены** — `packages/ui/src/styles/tokens.css`: цвета, типографика, плотность, радиусы, движение.
  Светлая тема по умолчанию, тёмная — переключателем; цвета серий графиков не меняются между темами.
- **Плотность** — строки 28/32/40 px, переключается атрибутом `data-density` на `<html>`.
- **Иконки** — Lucide, `currentColor`, толщина штриха по весу текста рядом.
- **Шрифты** — Inter (UI) и JetBrains Mono (данные, логи, идентификаторы), self-hosted, без CDN.

Правила, которые нельзя нарушать (см. дизайн-документ, §4):

- цвет никогда не единственный носитель смысла: статус = иконка + слово + цвет;
- «лучше/хуже» — это знак и слово, а не зелёный и красный;
- числа — табличные, выравнивание вправо, пустое значение — тире «–»;
- таблицы, а не карточки; hairline-разделители, без зебры;
- глубина — границы и сдвиги поверхностей, тени только у оверлеев;
- `prefers-reduced-motion` уважается, анимируются только `transform` и `opacity`.

## Лицензия

MIT — свободное использование, изменение и распространение, включая коммерческое.
