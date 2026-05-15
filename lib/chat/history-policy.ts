import type { ConversationTurn } from "@/lib/chat/agent";

export type ChatContextMode = "focused" | "clean" | "thread";
export type ChatRequestScope = "general" | "direct";

export function getPersistedHistoryLimit(mode: ChatContextMode) {
  if (mode === "clean") return 0;
  if (mode === "thread") return 12;

  return 4;
}

export function resolveChatTurnHistory({
  scope,
  contextMode,
  persistedHistory,
  clientHistory,
}: {
  scope: ChatRequestScope;
  contextMode: ChatContextMode;
  persistedHistory: ConversationTurn[];
  clientHistory: ConversationTurn[];
}) {
  if (scope === "direct") {
    return trimHistory(clientHistory, 8);
  }

  if (contextMode === "clean") {
    return [];
  }

  const limit = getPersistedHistoryLimit(contextMode);
  const source =
    persistedHistory.length > 0 ? persistedHistory : clientHistory;

  return trimHistory(source, limit);
}

function trimHistory(history: ConversationTurn[], limit: number) {
  return history
    .filter(
      (turn) =>
        (turn.role === "assistant" || turn.role === "user") &&
        turn.content.trim().length > 0,
    )
    .slice(-limit);
}
