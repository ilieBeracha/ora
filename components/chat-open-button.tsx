import { MessageSquareText } from "lucide-react";

export function ChatOpenButton({
  label = "Open in chat",
}: {
  label?: string;
}) {
  return (
    <button
      aria-label={label}
      className="chat-open-button"
      data-chat-open="true"
      type="button"
    >
      <MessageSquareText size={14} aria-hidden="true" />
    </button>
  );
}
