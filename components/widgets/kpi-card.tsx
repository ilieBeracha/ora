import type { ChatWidget } from "@/lib/chat/widgets";

import { ChatOpenButton } from "@/components/chat-open-button";
import { formatDelta, formatWidgetValue } from "@/components/widgets/format";

type KpiCardProps = Extract<ChatWidget, { type: "kpi_card" }>["props"];

export function KpiCardWidget({
  label,
  value,
  unit,
  delta,
  hint,
}: KpiCardProps) {
  return (
    <section
      className="chat-widget chat-widget-kpi"
      data-chat-explain="true"
      data-chat-source="chat-widget"
      data-chat-title={label}
      data-chat-description={hint}
      data-chat-prompt={`Explain this KPI: ${label}.`}
    >
      <ChatOpenButton label={`Open ${label} KPI in chat`} />
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
