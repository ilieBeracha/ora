import { CornerDownRight } from "lucide-react";

import type { ChatWidget } from "@/lib/chat/widgets";

type FollowupChipsProps = Extract<
  ChatWidget,
  { type: "followup_chips" }
>["props"] & {
  onPrompt?: (prompt: string) => void;
};

export function FollowupChipsWidget({
  title,
  prompts,
  onPrompt,
}: FollowupChipsProps) {
  return (
    <section className="chat-widget chat-widget-followups">
      <div className="chat-widget-followups-title">
        <CornerDownRight size={15} aria-hidden="true" />
        {title ?? "Suggested follow-ups"}
      </div>
      <div className="chat-widget-followups-list">
        {prompts.map((prompt) => (
          <button
            key={prompt.label}
            onClick={() => onPrompt?.(prompt.prompt)}
            type="button"
          >
            {prompt.label}
          </button>
        ))}
      </div>
    </section>
  );
}
