import { describe, expect, it } from "vitest";

import {
  getActionQueueItem,
  getSignalFlow,
  summarizeActionQueue,
} from "@/lib/signals/flow";

describe("Signal flow", () => {
  it("shows approval as the next step after an ActionPlan is prepared", () => {
    const flow = getSignalFlow({
      status: "open",
      evidence: [{}],
      recommendations: [{}],
      actionPlans: [
        {
          status: "approval_required",
          provider: "ora",
          actionType: "review_inventory_availability_batch",
          executionPayload: {
            provider: "ora",
            toolName: "ora_prepare_operator_review_batch",
          },
          approval: null,
          executions: [],
          outcomes: [],
        },
      ],
    });

    expect(flow.currentStep).toMatchObject({
      key: "approval",
      state: "current",
    });
    expect(flow.nextTitle).toBe("Approve the exact plan");
    expect(flow.ctaLabel).toBe("Review and approve");
  });

  it("marks approved executable plans as ready to run", () => {
    const actionPlan = {
      status: "approved",
      provider: "ora",
      actionType: "review_inventory_availability_batch",
      executionPayload: {
        provider: "ora",
        toolName: "ora_prepare_operator_review_batch",
      },
      approval: { id: "approval-1" },
      executions: [],
      outcomes: [],
    };

    const flow = getSignalFlow({
      evidence: [{}],
      recommendations: [{}],
      actionPlans: [actionPlan],
    });

    expect(flow.currentStep).toMatchObject({
      key: "execution",
      state: "current",
      detail: "Ready",
    });
    expect(getActionQueueItem(actionPlan)).toMatchObject({
      lane: "ready_to_run",
      label: "Ready to run",
      ctaLabel: "Run approved plan",
    });
  });

  it("explains exactly how a pending Outcome gets closed", () => {
    const actionPlan = {
      status: "executed",
      provider: "ora",
      actionType: "review_inventory_availability_batch",
      executionPayload: {
        provider: "ora",
        toolName: "ora_prepare_operator_review_batch",
      },
      approval: { id: "approval-1" },
      executions: [{ status: "success" }],
      outcomes: [{ status: "pending" }],
    };

    const flow = getSignalFlow({
      evidence: [{}],
      recommendations: [{}],
      actionPlans: [actionPlan],
    });
    const queueItem = getActionQueueItem(actionPlan);

    expect(flow.currentStep).toMatchObject({
      key: "outcome",
      state: "current",
    });
    expect(queueItem).toMatchObject({
      lane: "outcome_pending",
      title: "Finish review, then scan",
      ctaLabel: "Run outcome scan",
    });
    expect(queueItem.body).toContain("keeps the Signal actionable");
  });

  it("turns no-change outcomes into a store-change scan state", () => {
    const actionPlan = {
      status: "executed",
      provider: "ora",
      actionType: "review_inventory_availability_batch",
      executionPayload: {
        provider: "ora",
        toolName: "ora_prepare_operator_review_batch",
      },
      approval: { id: "approval-1" },
      executions: [{ status: "success" }],
      outcomes: [{ status: "no_change" }],
    };

    expect(getActionQueueItem(actionPlan)).toMatchObject({
      lane: "watching",
      label: "Store change",
      title: "Change store, then scan",
      ctaLabel: "Run outcome scan",
    });
  });

  it("summarizes the action queue into operator lanes", () => {
    expect(
      summarizeActionQueue([
        {
          lane: "needs_approval",
          label: "Needs approval",
          title: "Approve",
          body: "Approve",
          ctaLabel: "Review and approve",
          priority: 1,
        },
        {
          lane: "ready_to_run",
          label: "Ready to run",
          title: "Run",
          body: "Run",
          ctaLabel: "Run approved plan",
          priority: 2,
        },
        {
          lane: "blocked",
          label: "Blocked",
          title: "Blocked",
          body: "Blocked",
          ctaLabel: "Review blocker",
          priority: 3,
        },
      ]),
    ).toMatchObject({
      needsApproval: 1,
      readyToRun: 1,
      blocked: 1,
      outcomePending: 0,
    });
  });
});
