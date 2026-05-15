import { ChatOpenButton } from "@/components/chat-open-button";

export function EmptyState({
  title,
  body,
  action,
  note = "00",
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
  note?: string;
}) {
  return (
    <div
      className="empty-state panel panel-pad"
      data-chat-explain="true"
      data-chat-source="empty-state"
      data-chat-title={title}
      data-chat-description={body}
      data-chat-prompt={`Nothing is here yet for "${title}". What should I connect or do first to fill this view? Context: ${body}`}
    >
      <ChatOpenButton label={`Ask how to fill ${title}`} hint="Where to start" />
      <div className="empty-index">{note}</div>
      <div>
        <h2 className="section-title">{title}</h2>
        <p className="muted mt-2 max-w-2xl text-sm leading-6">{body}</p>
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}
