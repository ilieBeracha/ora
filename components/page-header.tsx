import { ChatOpenButton } from "@/components/chat-open-button";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  marker,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  marker?: string;
}) {
  return (
    <div
      className="page-header mb-7"
      data-chat-explain="true"
      data-chat-source="page-header"
      data-chat-title={title}
      data-chat-description={description}
      data-chat-prompt={`Explain this Ora page: ${title}${
        description ? `. ${description}` : ""
      }`}
    >
      <ChatOpenButton label={`Ask about ${title}`} hint={`${title} page`} />
      <div className="page-marker">{marker ?? "Ora"}</div>
      <div className="layout-row">
        <div>
          {eyebrow ? <p className="kicker">{eyebrow}</p> : null}
          <h1 className="page-title">{title}</h1>
          {description ? (
            <p className="muted mt-3 max-w-3xl text-sm leading-6">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="page-actions">{actions}</div> : null}
      </div>
    </div>
  );
}
