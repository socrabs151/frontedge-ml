import type { ExampleResult } from "../types";

export interface DatasetTableProps {
  examples: ExampleResult[];
  scoreLabel?: string;
}

/** Примеры датасета: вход, ответ и оценка. Сравнение соседних строк — как в любой таблице. */
export function DatasetTable({ examples, scoreLabel = "Score" }: DatasetTableProps) {
  return (
    <div className="fe-table fe-table--dataset">
      <div
        className="fe-table__scroll"
        role="region"
        aria-label="Примеры датасета"
        tabIndex={0}
      >
        <table className="fe-table__table">
          <thead>
            <tr>
              <th scope="col" className="fe-table__th fe-table__th--sticky">
                Example
              </th>
              <th scope="col" className="fe-table__th">
                Вход
              </th>
              <th scope="col" className="fe-table__th">
                Ответ
              </th>
              <th scope="col" className="fe-table__th fe-table__th--num">
                {scoreLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {examples.map((example) => (
              <tr key={example.id} className="fe-table__row">
                <td className="fe-table__td fe-table__td--sticky mono">{example.id}</td>
                <td className="fe-table__td fe-table__td--clip" title={example.input}>
                  {example.input}
                </td>
                <td className="fe-table__td fe-table__td--clip" title={example.output}>
                  {example.output}
                </td>
                <td className="fe-table__td fe-table__td--num num">
                  {example.referenceScore === null || example.referenceScore === undefined
                    ? "–"
                    : example.referenceScore.toFixed(3)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
