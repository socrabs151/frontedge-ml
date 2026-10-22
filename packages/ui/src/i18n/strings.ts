/**
 * Интерфейсные строки пакета.
 *
 * Язык по умолчанию — английский; русский вариант живёт здесь же, чтобы словарь
 * не расползался по компонентам. Доменные термины (Run, Dataset, Baseline)
 * одинаковы в обоих языках: это термины, по которым ML-инженеры ищут в W&B,
 * MLflow и документации.
 */

export const en = {
  "status.queued": "Queued",
  "status.running": "Running",
  "status.succeeded": "Completed",
  "status.failed": "Failed",
  "status.cancelled": "Cancelled",
  "status.lost": "Lost",

  "delta.better": "better",
  "delta.worse": "worse",
  "delta.toBaseline": "to {baseline}",

  "column.status": "Status",
  "column.stages": "Stages",
  "column.started": "Started",
  "column.duration": "Duration",
  "column.actions": "Actions",
  "column.input": "Input",
  "column.output": "Output",
  "column.answer": "Answer",
  "column.scores": "Scores",
  "column.reference": "reference",
  "column.run": "run",
  "column.score": "Score",
  "column.deltaToBaseline": "Δ to baseline",
  "column.directionOwned": "The metric owner sets the direction",

  "tag.baseline": "baseline",
  "footer.runs": "runs",
  "footer.deltasToBaseline": "deltas are relative to the baseline",

  "menu.columns": "Columns",
  "menu.hidden": "hidden",

  "log.lines": "lines",
  "log.live": "live",
  "log.streamClosed": "stream closed",
  "log.scrollToBottom": "Scroll to bottom",
  "log.runLogs": "Run logs",

  "aggregate.accuracy": "Accuracy",
  "aggregate.mean": "Mean",
  "aggregate.examplesChanged": "{count} examples, {changed} changed",

  "empty.noDifferences": "No differences — every example scored the same as the reference.",
  "loading.default": "Loading",
  "search.default": "Search",
  "search.clear": "Clear the search",
  "sparkline.default": "Metric over time",
  "metric.dynamics": "{label}: over time",
} as const;

export type StringKey = keyof typeof en;
export type Dictionary = Record<StringKey, string>;

export const ru: Dictionary = {
  "status.queued": "В очереди",
  "status.running": "Идёт",
  "status.succeeded": "Завершён",
  "status.failed": "Упал",
  "status.cancelled": "Отменён",
  "status.lost": "Потерян",

  "delta.better": "лучше",
  "delta.worse": "хуже",
  "delta.toBaseline": "к {baseline}",

  "column.status": "Статус",
  "column.stages": "Ход",
  "column.started": "Начат",
  "column.duration": "Длительность",
  "column.actions": "Действия",
  "column.input": "Вход",
  "column.output": "Выход",
  "column.answer": "Ответ",
  "column.scores": "Оценки",
  "column.reference": "эталон",
  "column.run": "прогон",
  "column.score": "Score",
  "column.deltaToBaseline": "Δ к baseline",
  "column.directionOwned": "Направление метрики задаёт владелец",

  "tag.baseline": "baseline",
  "footer.runs": "прогонов",
  "footer.deltasToBaseline": "дельты считаются к эталону",

  "menu.columns": "Колонки",
  "menu.hidden": "скрыто",

  "log.lines": "строк",
  "log.live": "live",
  "log.streamClosed": "поток закрыт",
  "log.scrollToBottom": "Прокрутить вниз",
  "log.runLogs": "Логи прогона",

  "aggregate.accuracy": "Доля верных",
  "aggregate.mean": "Среднее",
  "aggregate.examplesChanged": "{count} примеров, изменено {changed}",

  "empty.noDifferences": "Различий нет — все примеры оценены так же, как в эталоне.",
  "loading.default": "Загрузка",
  "search.default": "Поиск",
  "search.clear": "Очистить поиск",
  "sparkline.default": "Метрика по шагам",
  "metric.dynamics": "{label}: по шагам",
};
