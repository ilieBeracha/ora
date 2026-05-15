import type { ChatWidget } from "@/lib/chat/widgets";

import { formatWidgetValue } from "@/components/widgets/format";

export type WidgetChatTriggerProps = {
  chatOpenEnabled?: boolean;
};

type TriggerInput = {
  enabled: boolean;
  title: string;
  description?: string;
  prompt: string;
  widgetType: Exclude<ChatWidget["type"], "followup_chips">;
  dataSummary: string;
};

export function chatTriggerAttributes({
  enabled,
  title,
  description,
  prompt,
  widgetType,
  dataSummary,
}: TriggerInput) {
  if (!enabled) return {};

  return {
    "data-chat-explain": "true",
    "data-chat-source": "chat-widget",
    "data-chat-title": title,
    "data-chat-description": description,
    "data-chat-prompt": prompt,
    "data-chat-widget-type": widgetType,
    "data-chat-data-summary": truncateDataSummary(dataSummary),
  };
}

export function chatWidgetClassName(
  className: string,
  chatOpenEnabled: boolean,
) {
  return chatOpenEnabled
    ? className
    : `${className} chat-widget-static`;
}

export function summarizeKpiCard({
  label,
  value,
  unit,
  delta,
  hint,
}: Extract<ChatWidget, { type: "kpi_card" }>["props"]) {
  return compactSummary([
    `KPI: ${label}`,
    `Value: ${formatWidgetValue(value, "number")}${unit ? ` ${unit}` : ""}`,
    delta
      ? `Delta: ${formatWidgetValue(delta.value, delta.format)}${
          delta.direction ? ` (${delta.direction})` : ""
        }${delta.label ? `, ${delta.label}` : ""}`
      : "",
    hint ? `Context: ${hint}` : "",
  ]);
}

export function summarizeScorecardGrid({
  title,
  cards,
}: Extract<ChatWidget, { type: "scorecard_grid" }>["props"]) {
  return compactSummary([
    title ? `Scorecard: ${title}` : "Scorecard",
    ...cards.map((card) =>
      compactSummary([
        `${card.label}: ${formatWidgetValue(card.value, "number")}${
          card.unit ? ` ${card.unit}` : ""
        }`,
        card.delta
          ? `delta ${formatWidgetValue(card.delta.value, card.delta.format)}${
              card.delta.direction ? ` ${card.delta.direction}` : ""
            }`
          : "",
        card.hint ?? "",
      ]),
    ),
  ]);
}

export function summarizeStatList({
  title,
  items,
}: Extract<ChatWidget, { type: "stat_list" }>["props"]) {
  return compactSummary([
    title ? `Stats: ${title}` : "Stats",
    ...items.map((item) => `${item.label}: ${formatWidgetValue(item.value, "number")}`),
  ]);
}

export function summarizeDataTable({
  title,
  columns,
  rows,
  currency,
}: Extract<ChatWidget, { type: "data_table" }>["props"]) {
  const labelsByKey = new Map(columns.map((column) => [column.key, column]));
  const rowSummary = rows.slice(0, 6).map((row, index) => {
    const values = columns
      .map((column) => {
        const value = row[column.key];
        if (value === null || typeof value === "undefined" || value === "") {
          return "";
        }

        return `${column.label}: ${formatWidgetValue(
          value,
          labelsByKey.get(column.key)?.format ?? "text",
          currency,
        )}`;
      })
      .filter(Boolean)
      .join(", ");

    return `Row ${index + 1}: ${values}`;
  });

  return compactSummary([
    title ? `Table: ${title}` : "Table",
    `${rows.length} rows, ${columns.length} columns`,
    ...rowSummary,
  ]);
}

export function summarizeBarChart({
  title,
  data,
  xKey,
  yKey,
  valueFormat,
  currency,
}: Extract<ChatWidget, { type: "bar_chart" }>["props"]) {
  const rows = data
    .map((row) => ({
      label: String(row[xKey] ?? "Unknown"),
      value: typeof row[yKey] === "number" ? row[yKey] : Number(row[yKey] ?? 0),
    }))
    .slice(0, 8);

  return compactSummary([
    title ? `Chart: ${title}` : "Chart",
    ...rows.map(
      (row) =>
        `${row.label}: ${formatWidgetValue(row.value, valueFormat, currency)}`,
    ),
  ]);
}

export function summarizeProductCard({
  name,
  subtitle,
  sku,
  price,
  stock,
  metrics,
  hint,
}: Extract<ChatWidget, { type: "product_card" }>["props"]) {
  return compactSummary([
    `Product: ${name}`,
    subtitle ? `Subtitle: ${subtitle}` : "",
    sku ? `SKU: ${sku}` : "",
    price
      ? `Price: ${formatWidgetValue(price.amount, "currency", price.currency)}`
      : "",
    typeof stock === "number" ? `Stock: ${formatWidgetValue(stock, "number")}` : "",
    ...(metrics ?? []).map(
      (metric) => `${metric.label}: ${formatWidgetValue(metric.value, "number")}`,
    ),
    hint ? `Context: ${hint}` : "",
  ]);
}

export function summarizeAlertCard({
  tone,
  title,
  body,
}: Extract<ChatWidget, { type: "alert_card" }>["props"]) {
  return compactSummary([
    `Alert: ${title}`,
    `Tone: ${tone}`,
    body ? `Body: ${body}` : "",
  ]);
}

function compactSummary(parts: string[]) {
  return parts
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("; ");
}

function truncateDataSummary(value: string) {
  return value.length <= 2400 ? value : `${value.slice(0, 2397).trim()}...`;
}
