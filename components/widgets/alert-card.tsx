import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";

import type { ChatWidget } from "@/lib/chat/widgets";

import { ChatOpenButton } from "@/components/chat-open-button";
import {
  chatTriggerAttributes,
  chatWidgetClassName,
  summarizeAlertCard,
  type WidgetChatTriggerProps,
} from "@/components/widgets/chat-trigger";

type AlertCardProps = Extract<ChatWidget, { type: "alert_card" }>["props"];

const iconByTone = {
  info: Info,
  success: CheckCircle2,
  warn: AlertTriangle,
  danger: ShieldAlert,
};

export function AlertCardWidget({
  tone,
  title,
  body,
  chatOpenEnabled = true,
}: AlertCardProps & WidgetChatTriggerProps) {
  const Icon = iconByTone[tone];

  return (
    <section
      className={chatWidgetClassName(
        `chat-widget chat-widget-alert chat-widget-alert-${tone}`,
        chatOpenEnabled,
      )}
      {...chatTriggerAttributes({
        enabled: chatOpenEnabled,
        title,
        description: body,
        prompt: `Explain this alert: ${title}. Use the selected alert text and tell me the safest next step.`,
        widgetType: "alert_card",
        dataSummary: summarizeAlertCard({ tone, title, body }),
      })}
    >
      {chatOpenEnabled ? (
        <ChatOpenButton label={`Open ${title} alert in chat`} />
      ) : null}
      <Icon size={18} aria-hidden="true" />
      <div>
        <div className="chat-widget-alert-title">{title}</div>
        {body ? <p>{body}</p> : null}
      </div>
    </section>
  );
}
