import type { ChatWidget } from "@/lib/chat/widgets";

import { formatDelta, formatWidgetValue } from "@/components/widgets/format";

type ScorecardGridProps = Extract<
  ChatWidget,
  { type: "scorecard_grid" }
>["props"];

export function ScorecardGridWidget({ title, cards }: ScorecardGridProps) {
  return (
    <section className="chat-widget chat-widget-scorecard">
      {title ? <div className="chat-widget-title">{title}</div> : null}
      <div className="chat-widget-scorecard-grid">
        {cards.map((card) => (
          <article className="chat-widget-scorecard-item" key={card.label}>
            <div className="chat-widget-kpi-label">{card.label}</div>
            <div className="chat-widget-kpi-value">
              {formatWidgetValue(card.value, "number")}
              {card.unit ? <span>{card.unit}</span> : null}
            </div>
            {card.delta ? (
              <div
                className={`chat-widget-delta chat-widget-delta-${
                  card.delta.direction ?? "flat"
                }`}
              >
                {formatDelta(card.delta)}
              </div>
            ) : null}
            {card.hint ? <p>{card.hint}</p> : null}
          </article>
        ))}
      </div>
    </section>
  );
}
