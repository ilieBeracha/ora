import { describe, expect, it } from "vitest";

import {
  computeDecisionGuidance,
  computeDecisionLabel,
  computeStages,
  executionButtonLabel,
  isApprovableActionPlan,
  isExecutableActionPlan,
  summarizeActionPlanPayload,
  summarizeActionPlanPlain,
  type DecisionInput,
} from "@/lib/signals/decision";

function baseInput(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    evidenceCount: 0,
    hasActionPlan: false,
    hasApproval: false,
    hasExecution: false,
    executionStatus: null,
    hasOutcome: false,
    outcomeStatus: null,
    canExecutePlan: false,
    ...overrides,
  };
}

describe("computeStages", () => {
  it("marks Detected as complete and other stages as waiting when nothing exists", () => {
    const stages = computeStages(baseInput({ evidenceCount: 0 }));

    expect(stages.map((s) => s.key)).toEqual([
      "detected",
      "approval",
      "execution",
      "outcome",
    ]);
    expect(stages[0].state).toBe("complete");
    expect(stages[0].detail).toBe("Awaiting evidence");
    expect(stages[1].state).toBe("waiting");
    expect(stages[2].state).toBe("waiting");
    expect(stages[3].state).toBe("waiting");
  });

  it("counts evidence records with proper pluralization", () => {
    expect(
      computeStages(baseInput({ evidenceCount: 1 }))[0].detail,
    ).toBe("1 evidence record");
    expect(
      computeStages(baseInput({ evidenceCount: 4 }))[0].detail,
    ).toBe("4 evidence records");
  });

  it("makes Approval current when there is a plan but no approval", () => {
    const stages = computeStages(
      baseInput({ evidenceCount: 2, hasActionPlan: true }),
    );

    expect(stages[1].state).toBe("current");
    expect(stages[1].detail).toBe("Required");
    expect(stages[2].state).toBe("waiting");
  });

  it("makes Execution current when approved and executable", () => {
    const stages = computeStages(
      baseInput({
        evidenceCount: 2,
        hasActionPlan: true,
        hasApproval: true,
        canExecutePlan: true,
      }),
    );

    expect(stages[1].state).toBe("complete");
    expect(stages[1].detail).toBe("Approved");
    expect(stages[2].state).toBe("current");
    expect(stages[2].detail).toBe("Ready");
  });

  it("keeps Execution waiting when approved but provider is not executable", () => {
    const stages = computeStages(
      baseInput({
        evidenceCount: 2,
        hasActionPlan: true,
        hasApproval: true,
        canExecutePlan: false,
      }),
    );

    expect(stages[2].state).toBe("waiting");
    expect(stages[2].detail).toBe("Manual");
  });

  it("makes Outcome current after execution lands, complete after measurement", () => {
    const after = computeStages(
      baseInput({
        evidenceCount: 2,
        hasActionPlan: true,
        hasApproval: true,
        hasExecution: true,
        executionStatus: "succeeded",
        canExecutePlan: true,
      }),
    );
    expect(after[3].state).toBe("current");
    expect(after[3].detail).toBe("Pending");

    const measured = computeStages(
      baseInput({
        evidenceCount: 2,
        hasActionPlan: true,
        hasApproval: true,
        hasExecution: true,
        executionStatus: "succeeded",
        hasOutcome: true,
        outcomeStatus: "improved",
        canExecutePlan: true,
      }),
    );
    expect(measured[3].state).toBe("complete");
    expect(measured[3].detail).toBe("Improved");
  });
});

describe("computeDecisionLabel", () => {
  it("returns tone and label for each pipeline state", () => {
    expect(computeDecisionLabel(baseInput())).toEqual({
      tone: "neutral",
      label: "Evidence only",
    });

    expect(
      computeDecisionLabel(baseInput({ hasActionPlan: true })),
    ).toEqual({ tone: "warn", label: "Awaiting approval" });

    expect(
      computeDecisionLabel(
        baseInput({ hasActionPlan: true, hasApproval: true, canExecutePlan: true }),
      ),
    ).toEqual({ tone: "info", label: "Ready to execute" });

    expect(
      computeDecisionLabel(
        baseInput({
          hasActionPlan: true,
          hasApproval: true,
          canExecutePlan: false,
        }),
      ),
    ).toEqual({ tone: "neutral", label: "Approved · manual" });

    expect(
      computeDecisionLabel(
        baseInput({
          hasActionPlan: true,
          hasApproval: true,
          hasExecution: true,
          canExecutePlan: true,
        }),
      ),
    ).toEqual({ tone: "info", label: "Verifying outcome" });

    expect(
      computeDecisionLabel(
        baseInput({
          hasActionPlan: true,
          hasApproval: true,
          hasExecution: true,
          hasOutcome: true,
          canExecutePlan: true,
        }),
      ),
    ).toEqual({ tone: "success", label: "Verified" });
  });
});

describe("computeDecisionGuidance", () => {
  it("returns the right guidance per pipeline state", () => {
    expect(computeDecisionGuidance(baseInput()).title).toBe(
      "Review evidence",
    );
    expect(
      computeDecisionGuidance(baseInput({ hasActionPlan: true })).title,
    ).toBe("Approve exact action");
    expect(
      computeDecisionGuidance(
        baseInput({ hasActionPlan: true, hasApproval: true, canExecutePlan: false }),
      ).title,
    ).toBe("Approved — manual execution");
    expect(
      computeDecisionGuidance(
        baseInput({ hasActionPlan: true, hasApproval: true, canExecutePlan: true }),
      ).title,
    ).toBe("Execute approved action");
    expect(
      computeDecisionGuidance(
        baseInput({
          hasActionPlan: true,
          hasApproval: true,
          hasExecution: true,
          canExecutePlan: true,
        }),
      ).title,
    ).toBe("Track outcome");
    expect(
      computeDecisionGuidance(
        baseInput({
          hasActionPlan: true,
          hasApproval: true,
          hasExecution: true,
          hasOutcome: true,
          canExecutePlan: true,
        }),
      ).title,
    ).toBe("Verified");
  });
});

describe("summarizeActionPlanPayload", () => {
  it("describes the shopify_setProductReferenceMetafield tool with product count and metafield", () => {
    const summary = summarizeActionPlanPayload(
      "set_product_reference_metafield",
      {
        toolName: "shopify_setProductReferenceMetafield",
        input: {
          productIds: ["gid://shopify/Product/1", "gid://shopify/Product/2"],
          namespace: "custom",
          key: "swatch",
          referenceType: "color",
        },
      },
      "shopify",
    );

    expect(summary).toBe("Set custom.swatch (color) on 2 products.");
  });

  it("handles a single product correctly", () => {
    const summary = summarizeActionPlanPayload(
      null,
      {
        toolName: "shopify_setProductReferenceMetafield",
        input: {
          productIds: ["gid://shopify/Product/1"],
          namespace: "custom",
          key: "swatch",
          referenceType: "color",
        },
      },
      "shopify",
    );

    expect(summary).toBe("Set custom.swatch (color) on 1 product.");
  });

  it("falls back to a Shopify generic description for other shopify_ tools", () => {
    expect(
      summarizeActionPlanPayload(
        "publish_products",
        { toolName: "shopify_publishProducts", input: {} },
        "shopify",
      ),
    ).toBe("Shopify · Publish Products.");
  });

  it("falls back to Klaviyo generic for klaviyo_ tools", () => {
    expect(
      summarizeActionPlanPayload(
        "send_campaign",
        { toolName: "klaviyo_send_campaign", input: {} },
        "klaviyo",
      ),
    ).toBe("Klaviyo · Send Campaign.");
  });

  it("falls back to provider + action when payload has no toolName", () => {
    expect(
      summarizeActionPlanPayload("rebalance_inventory", null, "shopify"),
    ).toBe("Rebalance Inventory via Shopify.");
  });

  it("returns the empty message when nothing is prepared", () => {
    expect(summarizeActionPlanPayload(null, null, null)).toBe(
      "No exact action prepared.",
    );
  });
});

describe("isApprovableActionPlan", () => {
  it("returns true for draft and approval_required statuses without approval", () => {
    expect(
      isApprovableActionPlan({
        status: "draft",
        provider: "shopify",
        executionPayload: {},
      }),
    ).toBe(true);
    expect(
      isApprovableActionPlan({
        status: "approval_required",
        provider: "ora",
        executionPayload: {},
      }),
    ).toBe(true);
  });

  it("returns false when the plan is approved or in another status", () => {
    expect(
      isApprovableActionPlan({
        status: "approval_required",
        provider: "ora",
        executionPayload: {},
        approval: { id: "approval-1" },
      }),
    ).toBe(false);
    expect(
      isApprovableActionPlan({
        status: "executed",
        provider: "ora",
        executionPayload: {},
      }),
    ).toBe(false);
    expect(isApprovableActionPlan(null)).toBe(false);
  });
});

describe("isExecutableActionPlan", () => {
  it("accepts the Shopify metafield action", () => {
    expect(
      isExecutableActionPlan({
        status: "approval_required",
        provider: "shopify",
        executionPayload: {
          toolName: "shopify_setProductReferenceMetafield",
        },
      }),
    ).toBe(true);
  });

  it("accepts the Ora operator review batch action", () => {
    expect(
      isExecutableActionPlan({
        status: "approval_required",
        provider: "ora",
        executionPayload: {
          toolName: "ora_prepare_operator_review_batch",
        },
      }),
    ).toBe(true);
  });

  it("rejects unknown tools", () => {
    expect(
      isExecutableActionPlan({
        status: "approval_required",
        provider: "shopify",
        executionPayload: { toolName: "shopify_publishProducts" },
      }),
    ).toBe(false);
    expect(isExecutableActionPlan(null)).toBe(false);
  });
});

describe("executionButtonLabel", () => {
  it("uses a review-batch label for Ora operator reviews", () => {
    expect(
      executionButtonLabel({
        status: "approval_required",
        provider: "ora",
        executionPayload: {
          toolName: "ora_prepare_operator_review_batch",
        },
      }),
    ).toBe("Start review batch");
  });

  it("falls back to the generic execute label for other tools", () => {
    expect(
      executionButtonLabel({
        status: "approval_required",
        provider: "shopify",
        executionPayload: {
          toolName: "shopify_setProductReferenceMetafield",
        },
      }),
    ).toBe("Execute approved action");
  });
});

describe("summarizeActionPlanPlain", () => {
  it("returns operator-review headline and checklist for Ora plans", () => {
    const summary = summarizeActionPlanPlain({
      status: "approval_required",
      provider: "ora",
      executionPayload: {
        toolName: "ora_prepare_operator_review_batch",
      },
      previewPayload: {
        affectedCount: 4,
        operatorDecision: "Decide restock, hide, or leave active.",
        requiredReview: [
          "Confirm which active products should stay visible.",
          "Choose restock, hide, or leave active for each product.",
          "Avoid sending new demand toward products with no inventory.",
        ],
      },
    });

    expect(summary).not.toBeNull();
    expect(summary?.isOraReview).toBe(true);
    expect(summary?.headline).toContain("operator review batch");
    expect(summary?.affectedCount).toBe(4);
    expect(summary?.operatorDecision).toContain("restock");
    expect(summary?.requiredReview).toHaveLength(3);
  });

  it("returns connector headline for Shopify plans", () => {
    const summary = summarizeActionPlanPlain({
      status: "approval_required",
      provider: "shopify",
      executionPayload: {
        toolName: "shopify_setProductReferenceMetafield",
      },
      previewPayload: {},
    });

    expect(summary?.isOraReview).toBe(false);
    expect(summary?.headline).toContain("connector");
    expect(summary?.requiredReview).toEqual([]);
  });

  it("returns null when no action plan exists", () => {
    expect(summarizeActionPlanPlain(null)).toBeNull();
  });
});
