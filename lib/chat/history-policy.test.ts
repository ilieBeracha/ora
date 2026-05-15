import { describe, expect, it } from "vitest";

import {
  getPersistedHistoryLimit,
  resolveChatTurnHistory,
} from "@/lib/chat/history-policy";
import type { ConversationTurn } from "@/lib/chat/agent";

const persisted: ConversationTurn[] = [
  { role: "user", content: "persisted user" },
  { role: "assistant", content: "persisted assistant" },
];

const client: ConversationTurn[] = [
  { role: "user", content: "client user" },
  { role: "assistant", content: "client assistant" },
];

describe("chat history policy", () => {
  it("keeps direct focused follow-up history without pulling saved general chat", () => {
    expect(
      resolveChatTurnHistory({
        scope: "direct",
        contextMode: "clean",
        persistedHistory: persisted,
        clientHistory: client,
      }),
    ).toEqual(client);
  });

  it("keeps general clean mode clean", () => {
    expect(
      resolveChatTurnHistory({
        scope: "general",
        contextMode: "clean",
        persistedHistory: persisted,
        clientHistory: client,
      }),
    ).toEqual([]);
  });

  it("prefers saved general history when focused mode has a session", () => {
    expect(getPersistedHistoryLimit("focused")).toBe(4);
    expect(
      resolveChatTurnHistory({
        scope: "general",
        contextMode: "focused",
        persistedHistory: persisted,
        clientHistory: client,
      }),
    ).toEqual(persisted);
  });
});
