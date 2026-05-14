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
    <div className="empty-state panel panel-pad">
      <div className="empty-index">{note}</div>
      <div>
        <h2 className="section-title">{title}</h2>
        <p className="muted mt-2 max-w-2xl text-sm leading-6">{body}</p>
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </div>
  );
}
