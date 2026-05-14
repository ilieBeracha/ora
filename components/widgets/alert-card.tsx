import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";

import type { ChatWidget } from "@/lib/chat/widgets";

type AlertCardProps = Extract<ChatWidget, { type: "alert_card" }>["props"];

const iconByTone = {
  info: Info,
  success: CheckCircle2,
  warn: AlertTriangle,
  danger: ShieldAlert,
};

export function AlertCardWidget({ tone, title, body }: AlertCardProps) {
  const Icon = iconByTone[tone];

  return (
    <section
      className={`chat-widget chat-widget-alert chat-widget-alert-${tone}`}
      data-chat-explain="true"
      data-chat-source="chat-widget"
      data-chat-title={title}
      data-chat-description={body}
      data-chat-prompt={`Explain this alert: ${title}.`}
    >
      <Icon size={18} aria-hidden="true" />
      <div>
        <div className="chat-widget-alert-title">{title}</div>
        {body ? <p>{body}</p> : null}
      </div>
    </section>
  );
}
