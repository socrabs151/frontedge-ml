import { en as uiEn, ru as uiRu, useI18n } from "@frontedge/ui";

/**
 * Application strings.
 *
 * English by default; Russian is one click away. Domain terms (Run, Dataset,
 * Baseline, Eval) stay in English in both languages — they are the words ML
 * engineers look up in W&B, MLflow and the documentation.
 */
const en = {
  "nav.experiments": "Experiments",
  "nav.runs": "Runs",
  "nav.evals": "Evals",
  "nav.datasets": "Datasets",
  "nav.language": "Language",

  "runs.title": "Runs",
  "runs.subtitle": "Runs of the project squad-ru-eval, base branch main",
  "runs.exportCsv": "Export CSV",
  "runs.updatedAt": "updated {time}",
  "runs.refresh": "Refresh",
  "runs.searchPlaceholder": "Find a run by name",
  "runs.all": "All",
  "runs.allDatasets": "All datasets",
  "runs.baseline": "Baseline",
  "runs.filterCount": "{count} filters",
  "runs.loadError": "Could not load the runs",
  "runs.loadErrorHint": "The data source did not answer: {error}. Check that the API is running and try again.",
  "runs.retry": "Try again",
  "runs.emptyTitle": "Nothing matches the filter",
  "runs.emptyText": "Clear the filters or change the query.",
  "runs.resetFilters": "Clear filters",
  "runs.showing": "showing {from}-{to} of {total}",
  "runs.prev": "Previous",
  "runs.next": "Next",
  "runs.source": "Data source: {kind}.",

  "detail.back": "Runs",
  "detail.metrics": "Metrics",
  "detail.examples": "Examples",
  "detail.logs": "Logs",
  "detail.artifacts": "Artifacts",
  "detail.provenance": "Provenance",
  "detail.compare": "Compare",
  "detail.export": "Export",
  "detail.restart": "Restart",
  "detail.stop": "Stop",
  "detail.reason": "Reason",
  "detail.exitCode": "exit code {code}",
  "detail.download": "Download",
  "detail.examplesMissing":
    "The examples endpoint is not wired yet: add GET /api/runs/{id}/examples to the provider.",
  "detail.seedsNote":
    "One seed is shown. Other seeds appear once the provider returns them in series: an average over two seeds hides the outliers.",
  "detail.actionDone": "Done",
  "detail.actionFailed": "Not completed",

  "evals.title": "Eval diff",
  "evals.subtitle":
    "Examples as rows, the reference run on the left. The delta is computed against the reference.",
  "evals.evaluation": "Evaluation",
  "evals.reference": "Reference",
  "evals.run": "Run",
  "evals.onlyDiff": "Differences only",
  "evals.compareError": "Could not compare the runs",
  "evals.compareErrorHint": "The data source did not answer: {error}. Try another pair of runs.",
  "evals.aggregateNote": "The aggregate is {aggregate}. The direction is set by the owner of the metric.",
  "evals.directionMax": "higher is better",
  "evals.directionMin": "lower is better",

  "datasets.examplesSearch": "Find an example by text",
  "datasets.noExamples": "No examples match {query}.",
  "datasets.datasheet": "Datasheet",
  "datasets.provenance": "Provenance",
  "datasets.loadError": "Could not load the datasets",
  "datasets.loadErrorHint": "The data source did not answer: {error}. Reload the page and try again.",
  "datasets.version": "Version",
  "datasets.examples": "examples",
  "datasets.tags": "Tags",
} as const;

export type AppStringKey = keyof typeof en;

const ru: Record<AppStringKey, string> = {  "nav.experiments": "Эксперименты",
  "nav.runs": "Runs",
  "nav.evals": "Evals",
  "nav.datasets": "Datasets",
  "nav.language": "Язык",

  "runs.title": "Runs",
  "runs.subtitle": "Прогоны проекта squad-ru-eval, базовая ветка main",
  "runs.exportCsv": "Экспорт CSV",
  "runs.updatedAt": "обновлено {time}",
  "runs.refresh": "Обновить",
  "runs.searchPlaceholder": "Найти прогон по имени",
  "runs.all": "Все",
  "runs.allDatasets": "Все датасеты",
  "runs.baseline": "Эталон",
  "runs.filterCount": "{count} фильтра",
  "runs.loadError": "Не удалось загрузить прогоны",
  "runs.loadErrorHint":
    "Источник данных не ответил: {error}. Проверьте, что API запущен, и повторите попытку.",
  "runs.retry": "Повторить",
  "runs.emptyTitle": "Под фильтр ничего не попало",
  "runs.emptyText": "Снимите фильтры или измените запрос.",
  "runs.resetFilters": "Сбросить фильтры",
  "runs.showing": "показано {from}-{to} из {total}",
  "runs.prev": "Назад",
  "runs.next": "Вперёд",
  "runs.source": "Источник данных: {kind}.",

  "detail.back": "Runs",
  "detail.metrics": "Метрики",
  "detail.examples": "Примеры",
  "detail.logs": "Логи",
  "detail.artifacts": "Артефакты",
  "detail.provenance": "Провенанс",
  "detail.compare": "Сравнить",
  "detail.export": "Экспорт",
  "detail.restart": "Перезапустить",
  "detail.stop": "Остановить",
  "detail.reason": "Причина",
  "detail.exitCode": "код выхода {code}",
  "detail.download": "Скачать",
  "detail.examplesMissing":
    "Эндпоинт примеров ещё не подключён: добавьте в провайдера GET /api/runs/{id}/examples.",
  "detail.seedsNote":
    "Показан один сид. Другие сиды появятся, когда провайдер отдаст их в series: среднее по двум сидам скрывает выбросы.",
  "detail.actionDone": "Готово",
  "detail.actionFailed": "Не выполнено",

  "evals.title": "Eval diff",
  "evals.subtitle":
    "Примеры-строки, эталонный прогон слева. Дельта считается к эталону.",
  "evals.evaluation": "Оценка",
  "evals.reference": "Эталон",
  "evals.run": "Прогон",
  "evals.onlyDiff": "Только различия",
  "evals.compareError": "Не удалось сравнить прогоны",
  "evals.compareErrorHint":
    "Источник данных не ответил: {error}. Попробуйте другую пару прогонов.",
  "evals.aggregateNote": "Агрегат — {aggregate}. Направление задаёт владелец метрики.",
  "evals.directionMax": "больше — лучше",
  "evals.directionMin": "меньше — лучше",

  "datasets.examplesSearch": "Найти пример по тексту",
  "datasets.noExamples": "По запросу «{query}» примеров нет.",
  "datasets.datasheet": "Datasheet",
  "datasets.provenance": "Провенанс",
  "datasets.loadError": "Не удалось загрузить датасеты",
  "datasets.loadErrorHint":
    "Источник данных не ответил: {error}. Обновите страницу и попробуйте снова.",
  "datasets.version": "Версия",
  "datasets.examples": "примеров",
  "datasets.tags": "Теги",
};

const dictionaries = {
  en: { ...uiEn, ...en },
  ru: { ...uiRu, ...ru },
} as const;

export type UiStringKey = keyof typeof uiEn;

export function useAppT() {
  const { lang } = useI18n();
  const dictionary = dictionaries[lang] as Record<AppStringKey | UiStringKey, string>;
  return (key: AppStringKey | UiStringKey, params?: Record<string, string | number>) => {
    const template = dictionary[key];
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    );
  };
}
