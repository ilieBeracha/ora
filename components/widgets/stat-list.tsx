import type { ChatWidget } from "@/lib/chat/widgets";

import { ChatOpenButton } from "@/components/chat-open-button";
import {
  chatTriggerAttributes,
  chatWidgetClassName,
  summarizeStatList,
  type WidgetChatTriggerProps,
} from "@/components/widgets/chat-trigger";
import { formatWidgetValue } from "@/components/widgets/format";

type StatListProps = Extract<ChatWidget, { type: "stat_list" }>["props"];

export function StatListWidget({
  title,
  items,
  chatOpenEnabled = true,
}: StatListProps & WidgetChatTriggerProps) {
  const chatTitle = title ?? "Stat list";

  return (
    <section
      className={chatWidgetClassName(
        "chat-widget chat-widget-stat-list",
        chatOpenEnabled,
      )}
      {...chatTriggerAttributes({
        enabled: chatOpenEnabled,
        title: chatTitle,
        description: `${items.length} stats shown in this list.`,
        prompt: `Explain these stats${
          title ? `: ${title}` : ""
        }. Use the selected values and identify the useful next question.`,
        widgetType: "stat_list",
        dataSummary: summarizeStatList({ title, items }),
      })}
    >
      {chatOpenEnabled ? (
        <ChatOpenButton label={`Open ${title ?? "stats"} in chat`} />
      ) : null}
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
