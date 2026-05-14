import { describe, expect, it } from "vitest";

import {
  buildSignalContextBlock,
  buildSignalStatusWidgets,
  resolveSignalIdFromContext,
  type SignalChatRecord,
} from "@/lib/chat/signal-context";

describe("signal chat context", () => {
  it("resolves the current Signal id from explicit context or the page path", () => {
    expect(resolveSignalIdFromContext({ signalId: "sig_123" })).toBe("sig_123");
    expect(resolveSignalIdFromContext({ href: "/signals/sig_456" })).toBe(
      "sig_456",
    );
    expect(resolveSignalIdFromContext({ href: "/today" })).toBeNull();
  });

  it("summarizes action plan, approval, execution, and outcome state", () => {
    const signal = {
      id: "signal-1",
      title: "Inventory risk",
      type: "product_inventory_risk",
      status: "open",
      severity: "high",
      category: "inventory",
      affectedObjectType: "product",
      affectedObjectId: "gid://shopify/Product/1",
      summary: "A product is active but unavailable.",
      confidence: 0.82,
      detectedAt: new Date("2026-05-14T06:00:00.000Z"),
      updatedAt: new Date("2026-05-14T07:00:00.000Z"),
      evidence: [],
      recommendations: [],
      customerGroups: [],
      outcomes: [
        {
          status: "pending",
          measuredAt: new Date("2026-05-14T08:00:00.000Z"),
          summary: "Outcome tracking has started.",
        },
      ],
      actionPlans: [
        {
          id: "plan-1",
          actionType: "review_inventory",
          provider: "ora",
          status: "approval_required",
          createdAt: new Date("2026-05-14T06:30:00.000Z"),
          updatedAt: new Date("2026-05-14T06:45:00.000Z"),
          approval: null,
          executions: [],
          outcomes: [],
        },
      ],
    } as unknown as SignalChatRecord;

    expect(buildSignalContextBlock(signal)).toContain(
      "Action plan: Review Inventory",
    );
    expect(buildSignalContextBlock(signal)).toContain(
      "Outcome: Pending",
    );
    expect(buildSignalStatusWidgets(signal)[0]).toMatchObject({
      type: "scorecard_grid",
      props: {
        title: "Current Signal status",
      },
    });
  });
});
