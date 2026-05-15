import { describe, expect, it } from "vitest";

import { buildStoreSignalActionPlan } from "@/lib/signals/action-plans";
import type { ProductHealthCandidate } from "@/lib/signals/product-health";

describe("store Signal action plans", () => {
  it("builds a review-only inventory batch plan from deterministic Signal data", () => {
    const plan = buildStoreSignalActionPlan(
      {
        type: "product_inventory_risk",
        title: "2 active products are unavailable",
        summary: "Active products have no inventory.",
        evidenceText: "2 active products have no available inventory.",
        affectedGroup: "Collection shoppers.",
        recommendationTitle: "Review unavailable active products as one batch",
        recommendationReasoning: "Decide restock, hide, or leave active.",
        expectedImpact: "Keeps demand aligned with availability.",
        riskLevel: "medium",
        severity: "high",
        category: "inventory",
        confidence: 0.82,
        rawPayload: {
          count: 2,
          activeProductCount: 10,
          examples: [
            {
              title: "Unavailable A",
              productId: "gid://shopify/Product/1",
              totalInventory: 0,
              reasons: ["0 units available"],
            },
            {
              title: "Unavailable B",
              productId: "gid://shopify/Product/2",
              totalInventory: 0,
              reasons: ["0 units available"],
            },
          ],
        },
      } satisfies ProductHealthCandidate,
      "shopify-1",
    );

    expect(plan).toMatchObject({
      actionType: "review_inventory_availability_batch",
      provider: "ora",
      previewPayload: {
        workflow: "operator_review_batch",
        affectedCount: 2,
        operatorDecision: "Decide restock, hide, or intentionally leave active.",
        reasonSummary: [{ reason: "0 units available", count: 2 }],
      },
      executionPayload: {
        provider: "ora",
        toolName: "ora_prepare_operator_review_batch",
        args: {
          shopifyConnectionId: "shopify-1",
          actionType: "review_inventory_availability_batch",
        },
      },
    });
  });
});
