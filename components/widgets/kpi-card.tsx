import type { ChatWidget } from "@/lib/chat/widgets";

import { ChatOpenButton } from "@/components/chat-open-button";
import {
  chatTriggerAttributes,
  chatWidgetClassName,
  summarizeKpiCard,
  type WidgetChatTriggerProps,
} from "@/components/widgets/chat-trigger";
import { formatDelta, formatWidgetValue } from "@/components/widgets/format";

type KpiCardProps = Extract<ChatWidget, { type: "kpi_card" }>["props"];

export function KpiCardWidget({
  label,
  value,
  unit,
  delta,
  hint,
  chatOpenEnabled = true,
}: KpiCardProps & WidgetChatTriggerProps) {
  return (
    <section
      className={chatWidgetClassName(
        "chat-widget chat-widget-kpi",
        chatOpenEnabled,
      )}
      {...chatTriggerAttributes({
        enabled: chatOpenEnabled,
        title: label,
        description: hint,
        prompt: `Explain this KPI: ${label}. Use the selected KPI value first, then say what connected data should confirm it.`,
        widgetType: "kpi_card",
        dataSummary: summarizeKpiCard({ label, value, unit, delta, hint }),
      })}
    >
      {chatOpenEnabled ? (
        <ChatOpenButton label={`Open ${label} KPI in chat`} />
      ) : null}
      <div className="chat-widget-kpi-label">{label}</div>
      <div className="chat-widget-kpi-value">
        {formatWidgetValue(value, "number")}
        {unit ? <span>{unit}</span> : null}
      </div>
      {delta ? (
        <div className={`chat-widget-delta chat-widget-delta-${delta.direction ?? "flat"}`}>
          {formatDelta(delta)}
        </div>
      ) : null}
      {hint ? <p>{hint}</p> : null}
    </section>
  );
}
