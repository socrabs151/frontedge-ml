export { Button, type ButtonProps, type ButtonVariant, type ButtonSize } from "./components/Button";
export { Tooltip, TooltipProvider } from "./components/Tooltip";
export { StatusBadge, statusMeta } from "./components/StatusBadge";
export { Segmented, type SegmentedOption } from "./components/Segmented";
export { Tabs, type TabItem } from "./components/Tabs";
export { Sparkline } from "./components/Sparkline";
export { Search } from "./components/Search";
export { EmptyState } from "./components/EmptyState";
export { LoadingRows } from "./components/LoadingRows";

export { I18nProvider, useI18n, useT, type I18nValue, type Lang } from "./i18n/I18nProvider";
export { en, ru, type Dictionary, type StringKey } from "./i18n/strings";

export { RunRibbon, type RunRibbonProps } from "./patterns/RunRibbon";
export { RunTimeline, type RunTimelineProps } from "./patterns/RunTimeline";
export { MetricCell, MetricCard, describeDelta } from "./patterns/MetricCell";
export { RunsTable, type RunsTableProps } from "./patterns/RunsTable";
export { MetricChart, type MetricChartProps } from "./patterns/MetricChart";
export { LogStream } from "./patterns/LogStream";
export { ExamplesTable, type ExamplesTableProps } from "./patterns/ExamplesTable";
export {
  EvalCompareTable,
  formatScore,
  type DeltaFormat,
  type EvalCompareTableProps,
} from "./patterns/EvalCompareTable";
export { DatasetTable, type DatasetTableProps } from "./patterns/DatasetTable";
export { ColumnsMenu, type ColumnOption } from "./patterns/ColumnsMenu";
export { ProvenanceList } from "./patterns/Provenance";

export * from "./types";
export * from "./format";
export type { VisibilityState } from "@tanstack/react-table";
export { createClient } from "./generated/client";
export type { FrontedgeClientOptions, FrontedgeMeta } from "./generated/client";
