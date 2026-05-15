import { MessageSquareText } from "lucide-react";

export function ChatOpenButton({
  label = "Open in chat",
  hint = "Ask about this",
}: {
  label?: string;
  hint?: string;
}) {
  return (
    <button
      aria-label={label}
      className="chat-open-button"
      data-chat-open="true"
      type="button"
    >
      <MessageSquareText size={14} aria-hidden="true" />
      <span className="chat-open-hint" aria-hidden="true">
        <strong>Ask Ora</strong>
        <small>{hint}</small>
      </span>
    </button>
  );
}
