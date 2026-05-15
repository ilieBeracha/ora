export const REVIEW_OUTCOME_PENDING_TITLE = "Finish review, then scan";

export const REVIEW_OUTCOME_PENDING_BODY =
  "Complete the operator review outside Ora, then run an outcome scan. If the next scan no longer finds this Signal pattern, Ora marks the Outcome resolved. If it still finds it, Ora records no change and keeps the Signal actionable.";

export const REVIEW_OUTCOME_PENDING_SUMMARY =
  "Ora recorded the operator review batch. Complete the review, then run an outcome scan to verify whether this Signal pattern disappeared or still needs action.";

export const REVIEW_OUTCOME_SCAN_STARTED_SUMMARY =
  "Checking the pending Outcome for this Signal. Ora will compare the latest store data with the Signal pattern.";

export const REVIEW_OUTCOME_STORE_CHANGE_TITLE = "Change store, then scan";

export const REVIEW_OUTCOME_STORE_CHANGE_BODY =
  "The approved Ora review already ran and did not change Shopify automatically. Update the store data or catalog decision outside Ora, then run the outcome scan again to verify the Signal is gone.";

export function reviewOutcomeStatusForDetection(
  stillDetected: boolean,
): "no_change" | "resolved" {
  return stillDetected ? "no_change" : "resolved";
}

export function outcomeNeedsStoreChange(status: string | null | undefined) {
  return status === "no_change" || status === "worsened";
}

export function isGeneratedFollowUpActionPlanPayload(value: unknown) {
  return typeof asRecord(value)?.followUpOfActionPlanId === "string";
}

export function summarizeReviewOutcomeScan(stillDetected: boolean) {
  return stillDetected
    ? "Outcome scan still found this Signal pattern. Ora recorded no change and kept the Signal actionable for the next operator decision."
    : "Outcome scan no longer found this Signal pattern. Ora marked the pending review Outcome resolved.";
}

export function buildReviewOutcomeMetrics({
  measuredAt,
  previousMetrics,
  signalType,
  stillDetected,
}: {
  measuredAt: Date;
  previousMetrics: unknown;
  signalType: string;
  stillDetected: boolean;
}) {
  return {
    ...(asRecord(previousMetrics) ?? {}),
    outcomeScanAt: measuredAt.toISOString(),
    signalType,
    stillDetected,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
