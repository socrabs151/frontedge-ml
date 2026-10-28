export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from "./components/Button";
export {
  FrontedgeRoot,
  type FrontedgeDensity,
  type FrontedgeRootProps,
  type FrontedgeTheme,
} from "./components/FrontedgeRoot";
export { useNow } from "./hooks/useNow";
export { Tooltip, TooltipProvider } from "./components/Tooltip";
export type { TooltipProps } from "./components/Tooltip";
export { StatusBadge, statusMeta, type StatusBadgeProps } from "./components/StatusBadge";
export {
  FreshnessBadge,
  type FreshnessBadgeProps,
} from "./components/FreshnessBadge";
export { Segmented, type SegmentedOption, type SegmentedProps } from "./components/Segmented";
export { Tabs, type TabItem, type TabsProps } from "./components/Tabs";
export { Sparkline, type SparklineProps } from "./components/Sparkline";
export { Search, type SearchProps } from "./components/Search";
export { EmptyState, type EmptyStateProps } from "./components/EmptyState";
export { LoadingRows, type LoadingRowsProps } from "./components/LoadingRows";

export {
  I18nProvider,
  useI18n,
  useT,
  type I18nProviderProps,
  type I18nValue,
  type Lang,
} from "./i18n/I18nProvider";
export { en, ru, type Dictionary, type StringKey } from "./i18n/strings";

export { RunRibbon, type RunRibbonProps } from "./patterns/RunRibbon";
export { RunTimeline, type RunTimelineProps } from "./patterns/RunTimeline";
export {
  MetricCell,
  MetricCard,
  describeDelta,
  type MetricCardProps,
  type MetricCellProps,
} from "./patterns/MetricCell";
export { RunsTable, type RunsTableProps } from "./patterns/RunsTable";
export { MetricChart, type MetricChartProps } from "./patterns/MetricChart";
export { LogStream, type LogStreamProps } from "./patterns/LogStream";
export { ExamplesTable, type ExamplesTableProps } from "./patterns/ExamplesTable";
export {
  EvalCompareTable,
  formatScore,
  type DeltaFormat,
  type EvalCompareTableProps,
  type EvalFilter,
} from "./patterns/EvalCompareTable";
export { DatasetTable, type DatasetTableProps } from "./patterns/DatasetTable";
export {
  ColumnsMenu,
  type ColumnOption,
  type ColumnsMenuProps,
} from "./patterns/ColumnsMenu";
export { ConfigTable, formatParam, type ConfigTableProps } from "./patterns/ConfigTable";
export {
  ConfigMatrix,
  type ConfigMatrixProps,
  type ConfigMatrixRun,
} from "./patterns/ConfigMatrix";
export {
  MetricCompareChart,
  type CompareSeries,
  type MetricCompareChartProps,
} from "./patterns/MetricCompareChart";
export { ProvenanceList, type ProvenanceListProps } from "./patterns/Provenance";

export * from "./types";
export * from "./format";
export type { SortingState, VisibilityState } from "@tanstack/react-table";
export { createClient, FrontedgeRequestError } from "./generated/client";
export type { FrontedgeClientOptions, FrontedgeMeta } from "./generated/client";
