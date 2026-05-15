import type {
  ProductHealthCandidate,
  StoreCatalogCandidate,
} from "@/lib/signals/product-health";

type StoreSignalCandidate = ProductHealthCandidate | StoreCatalogCandidate;

type StoreSignalActionType =
  | "review_inventory_availability_batch"
  | "complete_catalog_classification_batch"
  | "improve_product_page_basics_batch"
  | "review_draft_activation_batch"
  | "clean_up_draft_launch_blockers_batch";

export type StoreSignalActionPlanPayload = {
  actionType: StoreSignalActionType;
  provider: "ora";
  previewPayload: Record<string, unknown>;
  executionPayload: Record<string, unknown>;
};

export function buildStoreSignalActionPlan(
  candidate: StoreSignalCandidate,
  shopifyConnectionId: string,
): StoreSignalActionPlanPayload {
  const actionType = actionTypeForStoreSignal(candidate.type);
  const rawPayload = candidate.rawPayload;
  const examples = Array.isArray(rawPayload.examples)
    ? rawPayload.examples.slice(0, 10)
    : [];
  const affectedCount = numericValue(rawPayload.count) ?? examples.length;
  const requiredReview = requiredReviewForStoreSignal(candidate.type);
  const operatorDecision = operatorDecisionForStoreSignal(candidate.type);
  const previewPayload = {
    provider: "ora",
    workflow: "operator_review_batch",
    signalType: candidate.type,
    actionType,
    category: candidate.category,
    severity: candidate.severity,
    confidence: candidate.confidence,
    shopifyConnectionId,
    affectedCount,
    objective: candidate.recommendationTitle,
    operatorDecision,
    requiredReview,
    reasonSummary: summarizeExampleReasons(examples),
    examples,
  };

  return {
    actionType,
    provider: "ora",
    previewPayload,
    executionPayload: {
      provider: "ora",
      toolName: "ora_prepare_operator_review_batch",
      args: {
        shopifyConnectionId,
        signalType: candidate.type,
        actionType,
        affectedCount,
        operatorDecision,
        requiredReview,
        examples,
      },
    },
  };
}

function actionTypeForStoreSignal(type: StoreSignalCandidate["type"]) {
  if (type === "product_inventory_risk") {
    return "review_inventory_availability_batch";
  }

  if (type === "product_missing_important_metafields") {
    return "complete_catalog_classification_batch";
  }

  if (type === "product_weak_health") {
    return "improve_product_page_basics_batch";
  }

  if (type === "draft_products_ready_for_review") {
    return "review_draft_activation_batch";
  }

  return "clean_up_draft_launch_blockers_batch";
}

function requiredReviewForStoreSignal(type: StoreSignalCandidate["type"]) {
  if (type === "product_inventory_risk") {
    return [
      "Confirm which active products should stay visible.",
      "Choose restock, hide, or leave active for each product.",
      "Avoid sending new demand toward products with no available inventory.",
    ];
  }

  if (type === "product_missing_important_metafields") {
    return [
      "Fill missing product type and tags.",
      "Keep classification consistent across the batch.",
      "Review collection and filter readiness after cleanup.",
    ];
  }

  if (type === "product_weak_health") {
    return [
      "Add missing image or stronger product copy.",
      "Keep only products with selling basics in promotion paths.",
      "Review the cleaned product pages before sending demand.",
    ];
  }

  if (type === "draft_products_ready_for_review") {
    return [
      "Review the ready draft batch.",
      "Choose which drafts should move toward activation.",
      "Check merchandising placement before launch.",
    ];
  }

  return [
    "Fix missing launch basics.",
    "Recheck image, inventory, product type, tags, and copy.",
    "Only move cleaned drafts toward activation.",
  ];
}

function operatorDecisionForStoreSignal(type: StoreSignalCandidate["type"]) {
  if (type === "product_inventory_risk") {
    return "Decide restock, hide, or intentionally leave active.";
  }

  if (type === "product_missing_important_metafields") {
    return "Complete catalog classification before merchandising or promotion.";
  }

  if (type === "product_weak_health") {
    return "Improve product-page basics before sending more demand.";
  }

  if (type === "draft_products_ready_for_review") {
    return "Choose the draft products that should enter launch review.";
  }

  return "Clean launch blockers before activation.";
}

function summarizeExampleReasons(examples: unknown[]) {
  const counts = new Map<string, number>();

  for (const example of examples) {
    if (!example || typeof example !== "object" || !("reasons" in example)) {
      continue;
    }

    const reasons = (example as { reasons?: unknown }).reasons;
    if (!Array.isArray(reasons)) continue;

    for (const reason of reasons) {
      if (typeof reason !== "string" || !reason.trim()) continue;

      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reason, count]) => ({ reason, count }));
}

function numericValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
