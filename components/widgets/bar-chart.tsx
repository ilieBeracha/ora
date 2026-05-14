import type { ChatWidget } from "@/lib/chat/widgets";

import { formatWidgetValue } from "@/components/widgets/format";

type BarChartProps = Extract<ChatWidget, { type: "bar_chart" }>["props"];

export function BarChartWidget({
  title,
  data,
  xKey,
  yKey,
  valueFormat,
  currency,
}: BarChartProps) {
  const rows = data.map((row) => ({
    label: String(row[xKey] ?? "Unknown"),
    value: typeof row[yKey] === "number" ? row[yKey] : Number(row[yKey] ?? 0),
  }));
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <section
      className="chat-widget chat-widget-bar-chart"
      data-chat-explain="true"
      data-chat-source="chat-widget"
      data-chat-title={title ?? "Bar chart"}
      data-chat-description={`${rows.length} bars shown in this chart.`}
      data-chat-prompt={`Explain this chart${
        title ? `: ${title}` : ""
      } and call out the main pattern.`}
    >
      {title ? <div className="chat-widget-title">{title}</div> : null}
      <div className="chat-widget-bars">
        {rows.map((row) => (
          <div className="chat-widget-bar-row" key={row.label}>
            <div className="chat-widget-bar-label">{row.label}</div>
            <div className="chat-widget-bar-track" aria-hidden="true">
              <div
                className="chat-widget-bar-fill"
                style={{ width: `${Math.max((row.value / max) * 100, 4)}%` }}
              />
            </div>
            <div className="chat-widget-bar-value">
              {formatWidgetValue(row.value, valueFormat, currency)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
