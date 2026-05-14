import type { ChatWidget } from "@/lib/chat/widgets";

import { formatWidgetValue } from "@/components/widgets/format";

type StatListProps = Extract<ChatWidget, { type: "stat_list" }>["props"];

export function StatListWidget({ title, items }: StatListProps) {
  return (
    <section className="chat-widget chat-widget-stat-list">
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
