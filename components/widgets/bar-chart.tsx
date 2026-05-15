import type { ChatWidget } from "@/lib/chat/widgets";

import { ChatOpenButton } from "@/components/chat-open-button";
import {
  chatTriggerAttributes,
  chatWidgetClassName,
  summarizeBarChart,
  type WidgetChatTriggerProps,
} from "@/components/widgets/chat-trigger";
import { formatWidgetValue } from "@/components/widgets/format";

type BarChartProps = Extract<ChatWidget, { type: "bar_chart" }>["props"];

export function BarChartWidget({
  title,
  data,
  xKey,
  yKey,
  valueFormat,
  currency,
  chatOpenEnabled = true,
}: BarChartProps & WidgetChatTriggerProps) {
  const rows = data.map((row) => ({
    label: String(row[xKey] ?? "Unknown"),
    value: typeof row[yKey] === "number" ? row[yKey] : Number(row[yKey] ?? 0),
  }));
  const max = Math.max(...rows.map((row) => row.value), 1);
  const chatTitle = title ?? "Bar chart";

  return (
    <section
      className={chatWidgetClassName(
        "chat-widget chat-widget-bar-chart",
        chatOpenEnabled,
      )}
      {...chatTriggerAttributes({
        enabled: chatOpenEnabled,
        title: chatTitle,
        description: `${rows.length} bars shown in this chart.`,
        prompt: `Explain this chart${
          title ? `: ${title}` : ""
        }. Use the selected chart values and call out the main pattern.`,
        widgetType: "bar_chart",
        dataSummary: summarizeBarChart({
          title,
          data,
          xKey,
          yKey,
          valueFormat,
          currency,
        }),
      })}
    >
      {chatOpenEnabled ? (
        <ChatOpenButton label={`Open ${title ?? "chart"} in chat`} />
      ) : null}
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
