import { describe, expect, it } from "vitest";

import {
  cancelChatRun,
  createChatRun,
  emitChatRunEvent,
  getChatRun,
  getChatRunEvents,
} from "@/lib/chat/runs";

describe("chat runs", () => {
  it("scopes runs to the current company and user", () => {
    const run = createChatRun({ companyId: "company_a", userId: "user_a" });

    expect(getChatRun(run.id, { companyId: "company_a", userId: "user_a" }))
      .toBe(run);
    expect(getChatRun(run.id, { companyId: "company_b", userId: "user_a" }))
      .toBeNull();
    expect(getChatRun(run.id, { companyId: "company_a", userId: "user_b" }))
      .toBeNull();
  });

  it("records events and aborts active runs", () => {
    const scope = { companyId: "company_events", userId: "user_events" };
    const run = createChatRun(scope);

    emitChatRunEvent(run.id, "status", { message: "Reading tools" });

    expect(getChatRunEvents(run.id, scope)).toMatchObject([
      {
        runId: run.id,
        type: "status",
        data: { message: "Reading tools" },
      },
    ]);
    expect(cancelChatRun(run.id, scope)).toBe(true);
    expect(run.controller.signal.aborted).toBe(true);
  });
});
