import { describe, expect, it } from "vitest";

import {
  buildActionOwnerSummary,
  buildSignalOwnerSummary,
  summarizeSignalOwnerQueue,
} from "@/lib/signals/owner-summary";

describe("Signal owner summaries", () => {
  it("translates a research-only Signal into change, recorded, and left cells", () => {
    const summary = buildSignalOwnerSummary({
      title: "Inventory risk",
      summary: "Active products have no available inventory.",
      affectedObjectType: "store",
      affectedObjectId: "connection_1",
      evidence: [
        {
          displayText:
            "2 active products have zero available inventory and still appear in the active catalog.",
        },
      ],
      recommendations: [
        {
          title: "Review availability",
          reasoning: "Decide which products should be restocked or hidden.",
        },
      ],
      actionPlans: [],
      outcomes: [],
    });

    expect(summary.changeNeeded).toMatchObject({
      title: "Review availability",
    });
    expect(summary.recordedChange).toMatchObject({
      title: "Nothing changed yet",
    });
    expect(summary.remainingWork.title).toBe("Prepare one exact plan");
    expect(summary.actionLogLine).toBe("Research only");
  });

  it("shows an Ora review batch as recorded without implying Shopify changed", () => {
    const summary = buildActionOwnerSummary({
      id: "plan_1",
      status: "executed",
      provider: "ora",
      actionType: "review_inventory_availability_batch",
      previewPayload: {
        affectedCount: 2,
        objective: "Review products with no available inventory.",
        operatorDecision: "Decide restock, hide, or intentionally leave active.",
      },
      executionPayload: {
        provider: "ora",
        toolName: "ora_prepare_operator_review_batch",
        args: { affectedCount: 2 },
      },
      approval: {
        approvedAt: "2026-05-01T00:00:00.000Z",
        approvedBy: { email: "owner@example.com" },
      },
      executions: [
        {
          status: "success",
          toolName: "ora_prepare_operator_review_batch",
          outputPayload: { affectedCount: 2 },
          executedAt: "2026-05-02T00:00:00.000Z",
        },
      ],
      outcomes: [
        {
          status: "pending",
          summary: "Outcome is pending until review is completed.",
          measuredAt: "2026-05-03T00:00:00.000Z",
        },
      ],
      signal: {
        title: "Inventory risk",
        affectedObjectType: "product",
      },
    });

    expect(summary.affected).toMatchObject({
      label: "2 products",
      count: 2,
    });
    expect(summary.recordedChange).toMatchObject({
      title: "Review batch recorded",
    });
    expect(summary.recordedChange.body).toContain(
      "No connected store data changed automatically",
    );
    expect(summary.remainingWork).toMatchObject({
      title: "Finish review, then scan",
    });
    expect(summary.remainingWork.body).toContain("run an outcome scan");
    expect(summary.logEntries.map((entry) => entry.label)).toEqual([
      "Plan",
      "Approval",
      "Execution",
      "Outcome",
    ]);
  });

  it("does not make a no-change Outcome create another approval loop", () => {
    const summary = buildSignalOwnerSummary({
      title: "Drafts ready for review",
      summary: "Draft products still need an operator decision.",
      affectedObjectType: "store",
      affectedObjectId: "connection_1",
      evidence: [{ displayText: "1 draft product is still ready for review." }],
      recommendations: [
        {
          title: "Review draft activation",
          reasoning: "Choose which drafts should enter launch review.",
        },
      ],
      actionPlans: [
        {
          status: "executed",
          provider: "ora",
          actionType: "review_draft_activation_batch",
          previewPayload: {
            affectedCount: 1,
            operatorDecision: "Choose the drafts that should launch.",
          },
          executionPayload: {
            provider: "ora",
            toolName: "ora_prepare_operator_review_batch",
          },
          approval: { approvedBy: { email: "owner@example.com" } },
          executions: [
            {
              status: "success",
              toolName: "ora_prepare_operator_review_batch",
            },
          ],
          outcomes: [
            {
              status: "no_change",
              summary: "Outcome scan still found this Signal pattern.",
            },
          ],
        },
      ],
      outcomes: [
        {
          status: "no_change",
          summary: "Outcome scan still found this Signal pattern.",
        },
      ],
    });

    expect(summary.recordedChange.title).toBe("Outcome recorded: No Change");
    expect(summary.remainingWork).toMatchObject({
      title: "Change store, then scan",
    });
    expect(summary.remainingWork.body).toContain(
      "did not change Shopify automatically",
    );
  });

  it("summarizes mixed Signal lanes for the page work queue", () => {
    expect(
      summarizeSignalOwnerQueue([
        signalSummary("research"),
        signalSummary("needs_approval"),
        signalSummary("ready_to_run"),
        signalSummary("blocked"),
        signalSummary("outcome_pending"),
        signalSummary("done"),
      ]),
    ).toMatchObject({
      research: 1,
      needsApproval: 1,
      readyToRun: 1,
      blocked: 1,
      outcomePending: 1,
      done: 1,
    });
  });
});

function signalSummary(
  lane: ReturnType<typeof buildSignalOwnerSummary>["lane"],
): ReturnType<typeof buildSignalOwnerSummary> {
  return {
    lane,
    tone: "research",
    affected: {
      label: "Store",
      detail: "Affected scope is Store.",
      count: null,
    },
    changeNeeded: {
      title: "Need",
      body: "Need",
    },
    recordedChange: {
      title: "Recorded",
      body: "Recorded",
    },
    remainingWork: {
      title: "Left",
      body: "Left",
    },
    proof: {
      title: "Proof",
      body: "Proof",
    },
    actionLogLine: "Research only",
  };
}
