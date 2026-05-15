import type { ChatWidget } from "@/lib/chat/widgets";

import { ChatOpenButton } from "@/components/chat-open-button";
import {
  chatTriggerAttributes,
  chatWidgetClassName,
  summarizeScorecardGrid,
  type WidgetChatTriggerProps,
} from "@/components/widgets/chat-trigger";
import { formatDelta, formatWidgetValue } from "@/components/widgets/format";

type ScorecardGridProps = Extract<
  ChatWidget,
  { type: "scorecard_grid" }
>["props"];

export function ScorecardGridWidget({
  title,
  cards,
  chatOpenEnabled = true,
}: ScorecardGridProps & WidgetChatTriggerProps) {
  const chatTitle = title ?? "Scorecard";

  return (
    <section
      className={chatWidgetClassName(
        "chat-widget chat-widget-scorecard",
        chatOpenEnabled,
      )}
      {...chatTriggerAttributes({
        enabled: chatOpenEnabled,
        title: chatTitle,
        description: `${cards.length} metrics shown in this scorecard.`,
        prompt: `Explain this scorecard${
          title ? `: ${title}` : ""
        }. Compare the selected metrics and tell me what matters most.`,
        widgetType: "scorecard_grid",
        dataSummary: summarizeScorecardGrid({ title, cards }),
      })}
    >
      {chatOpenEnabled ? (
        <ChatOpenButton label={`Open ${title ?? "scorecard"} in chat`} />
      ) : null}
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
