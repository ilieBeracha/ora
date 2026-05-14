import type { ChatWidget } from "@/lib/chat/widgets";

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
    <section className="chat-widget chat-widget-kpi">
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
