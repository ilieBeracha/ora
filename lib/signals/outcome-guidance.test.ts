import { describe, expect, it } from "vitest";

import {
  REVIEW_OUTCOME_PENDING_BODY,
  REVIEW_OUTCOME_STORE_CHANGE_BODY,
  buildReviewOutcomeMetrics,
  isGeneratedFollowUpActionPlanPayload,
  outcomeNeedsStoreChange,
  reviewOutcomeStatusForDetection,
  summarizeReviewOutcomeScan,
} from "@/lib/signals/outcome-guidance";

describe("Outcome guidance", () => {
  it("makes the pending state explain both possible scan results", () => {
    expect(REVIEW_OUTCOME_PENDING_BODY).toContain("run an outcome scan");
    expect(REVIEW_OUTCOME_PENDING_BODY).toContain("marks the Outcome resolved");
    expect(REVIEW_OUTCOME_PENDING_BODY).toContain("records no change");
  });

  it("classifies a follow-up scan from deterministic detection", () => {
    expect(reviewOutcomeStatusForDetection(false)).toBe("resolved");
    expect(reviewOutcomeStatusForDetection(true)).toBe("no_change");
    expect(summarizeReviewOutcomeScan(false)).toContain("resolved");
    expect(summarizeReviewOutcomeScan(true)).toContain("kept the Signal actionable");
  });

  it("makes no-change outcomes a store-change state, not another plan", () => {
    expect(outcomeNeedsStoreChange("no_change")).toBe(true);
    expect(outcomeNeedsStoreChange("worsened")).toBe(true);
    expect(outcomeNeedsStoreChange("pending")).toBe(false);
    expect(REVIEW_OUTCOME_STORE_CHANGE_BODY).toContain(
      "did not change Shopify automatically",
    );
    expect(REVIEW_OUTCOME_STORE_CHANGE_BODY).toContain("run the outcome scan");
  });

  it("identifies obsolete generated follow-up plans so they can be hidden", () => {
    expect(
      isGeneratedFollowUpActionPlanPayload({
        followUpOfActionPlanId: "plan_1",
      }),
    ).toBe(true);
    expect(isGeneratedFollowUpActionPlanPayload({ actionType: "review" })).toBe(
      false,
    );
  });

  it("preserves the execution metrics and adds scan evidence", () => {
    expect(
      buildReviewOutcomeMetrics({
        measuredAt: new Date("2026-05-15T10:00:00.000Z"),
        previousMetrics: { affectedCount: 2, reviewBatchStarted: true },
        signalType: "draft_products_ready_for_review",
        stillDetected: true,
      }),
    ).toEqual({
      affectedCount: 2,
      outcomeScanAt: "2026-05-15T10:00:00.000Z",
      reviewBatchStarted: true,
      signalType: "draft_products_ready_for_review",
      stillDetected: true,
    });
  });
});
