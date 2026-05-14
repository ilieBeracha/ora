import type { ChatWidget } from "@/lib/chat/widgets";

import { formatWidgetValue } from "@/components/widgets/format";

type StatListProps = Extract<ChatWidget, { type: "stat_list" }>["props"];

export function StatListWidget({ title, items }: StatListProps) {
  return (
    <section
      className="chat-widget chat-widget-stat-list"
      data-chat-explain="true"
      data-chat-source="chat-widget"
      data-chat-title={title ?? "Stat list"}
      data-chat-description={`${items.length} stats shown in this list.`}
      data-chat-prompt={`Explain these stats${
        title ? `: ${title}` : ""
      } and identify the useful next question.`}
    >
      {title ? <div className="chat-widget-title">{title}</div> : null}
      <dl>
        {items.map((item) => (
          <div className="chat-widget-stat-row" key={item.label}>
            <dt>{item.label}</dt>
            <dd>{formatWidgetValue(item.value, "number")}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
