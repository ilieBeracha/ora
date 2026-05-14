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
      data-chat-prompt={`Explain this empty state: ${title}. ${body}`}
    >
      <div className="empty-index">{note}</div>
      <div>
        <h2 className="section-title">{title}</h2>
        <p className="muted mt-2 max-w-2xl text-sm leading-6">{body}</p>
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}
