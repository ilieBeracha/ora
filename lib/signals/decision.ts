export type StageState = "complete" | "current" | "waiting";

export type SignalStage = {
  key: "detected" | "approval" | "execution" | "outcome";
  label: string;
  detail: string;
  state: StageState;
};

export type DecisionTone = "info" | "warn" | "success" | "neutral";

export type DecisionLabel = {
  tone: DecisionTone;
  label: string;
};

export type DecisionGuidance = {
  title: string;
  body: string;
};

export type DecisionInput = {
  evidenceCount: number;
  hasActionPlan: boolean;
  hasApproval: boolean;
  hasExecution: boolean;
  executionStatus: string | null;
  hasOutcome: boolean;
  outcomeStatus: string | null;
  canExecutePlan: boolean;
};

export function computeStages(input: DecisionInput): SignalStage[] {
  const detected: SignalStage = {
    key: "detected",
    label: "Detected",
    detail: input.evidenceCount
      ? `${input.evidenceCount} evidence record${input.evidenceCount === 1 ? "" : "s"}`
      : "Awaiting evidence",
    state: "complete",
  };

  const approval: SignalStage = {
    key: "approval",
    label: "Approval",
    detail: !input.hasActionPlan
      ? "Awaiting action plan"
      : input.hasApproval
        ? "Approved"
        : "Required",
    state: !input.hasActionPlan
      ? "waiting"
      : input.hasApproval
        ? "complete"
        : "current",
  };

  const execution: SignalStage = {
    key: "execution",
    label: "Execution",
    detail: input.hasExecution
      ? labelize(input.executionStatus ?? "Executed")
      : !input.hasApproval
        ? "Waiting on approval"
        : !input.canExecutePlan
          ? "Manual"
          : "Ready",
    state: input.hasExecution
      ? "complete"
      : input.hasApproval && input.canExecutePlan
        ? "current"
        : "waiting",
  };

  const outcome: SignalStage = {
    key: "outcome",
    label: "Outcome",
    detail: input.hasOutcome
      ? labelize(input.outcomeStatus ?? "Measured")
      : input.hasExecution
        ? "Pending"
        : "Not measured",
    state: input.hasOutcome
      ? "complete"
      : input.hasExecution
        ? "current"
        : "waiting",
  };

  return [detected, approval, execution, outcome];
}

export function computeDecisionLabel(input: DecisionInput): DecisionLabel {
  if (!input.hasActionPlan) {
    return { tone: "neutral", label: "Evidence only" };
  }
  if (!input.hasApproval) {
    return { tone: "warn", label: "Awaiting approval" };
  }
  if (!input.hasExecution && input.canExecutePlan) {
    return { tone: "info", label: "Ready to execute" };
  }
  if (!input.hasExecution && !input.canExecutePlan) {
    return { tone: "neutral", label: "Approved · manual" };
  }
  if (!input.hasOutcome) {
    return { tone: "info", label: "Verifying outcome" };
  }
  return { tone: "success", label: "Verified" };
}

export function computeDecisionGuidance(
  input: DecisionInput,
): DecisionGuidance {
  if (!input.hasActionPlan) {
    return {
      title: "Review evidence",
      body: "Ora has no exact action prepared. Review the evidence below to decide if this Signal warrants follow-up.",
    };
  }
  if (!input.hasApproval) {
    return {
      title: "Approve exact action",
      body: "Approve only if the previewed payload below is exactly the change you want Ora to make.",
    };
  }
  if (!input.hasExecution && !input.canExecutePlan) {
    return {
      title: "Approved — manual execution",
      body: "This grouped action is approval-ready, but live execution for this provider is not enabled yet.",
    };
  }
  if (!input.hasExecution) {
    return {
      title: "Execute approved action",
      body: "Ora will validate the approved payload hash before any mutation runs.",
    };
  }
  if (!input.hasOutcome) {
    return {
      title: "Track outcome",
      body: "The action ran. Watch the outcome below to confirm the Signal improved or resolved.",
    };
  }
  return {
    title: "Verified",
    body: "Outcome recorded. Use the history below to inspect what changed.",
  };
}

export type ActionPlanLike = {
  status: string;
  provider: string;
  executionPayload: unknown;
  previewPayload?: unknown;
  approval?: unknown | null;
};

export function isApprovableActionPlan(
  actionPlan: ActionPlanLike | null | undefined,
): boolean {
  return Boolean(
    actionPlan &&
      !actionPlan.approval &&
      (actionPlan.status === "draft" ||
        actionPlan.status === "approval_required"),
  );
}

export function isExecutableActionPlan(
  actionPlan: ActionPlanLike | null | undefined,
): boolean {
  if (!actionPlan) return false;
  const payload = asRecord(actionPlan.executionPayload);

  if (
    actionPlan.provider === "ora" &&
    payload?.toolName === "ora_prepare_operator_review_batch"
  ) {
    return true;
  }

  return (
    actionPlan.provider === "shopify" &&
    payload?.toolName === "shopify_setProductReferenceMetafield"
  );
}

export function executionButtonLabel(actionPlan: ActionPlanLike): string {
  const payload = asRecord(actionPlan.executionPayload);

  if (
    actionPlan.provider === "ora" &&
    payload?.toolName === "ora_prepare_operator_review_batch"
  ) {
    return "Start review batch";
  }

  return "Execute approved action";
}

export type ActionPlanPlainSummary = {
  headline: string;
  body: string;
  isOraReview: boolean;
  affectedCount: number | null;
  operatorDecision: string | null;
  requiredReview: string[];
};

export function summarizeActionPlanPlain(
  actionPlan: ActionPlanLike | null | undefined,
): ActionPlanPlainSummary | null {
  if (!actionPlan) return null;
  const preview = asRecord(actionPlan.previewPayload);
  const isOraReview = actionPlan.provider === "ora";

  return {
    headline: isOraReview
      ? "Starts a focused operator review batch"
      : "Runs one approved connector action",
    body: isOraReview
      ? "This execution records a review batch in Ora. It does not change the store automatically."
      : "Execution runs only after approval locks the exact payload.",
    isOraReview,
    affectedCount: numberFromRecord(preview, "affectedCount"),
    operatorDecision: stringFromRecord(preview, "operatorDecision"),
    requiredReview: stringArrayFromRecord(preview, "requiredReview").slice(0, 4),
  };
}

export function summarizeActionPlanPayload(
  actionType: string | null | undefined,
  payload: unknown,
  provider?: string | null,
): string {
  const record = asRecord(payload);
  if (!record && !actionType) {
    return "No exact action prepared.";
  }
  if (!record) {
    return `${labelize(actionType ?? "")} via ${labelize(provider ?? "connector")}.`;
  }

  const toolName = stringValue(record.toolName);
  const input = asRecord(record.input);

  if (
    toolName === "shopify_setProductReferenceMetafield" &&
    input
  ) {
    const productIds = asArray(input.productIds);
    const namespace = stringValue(input.namespace);
    const key = stringValue(input.key);
    const refType = stringValue(input.referenceType);
    const productPart = productIds.length
      ? `${productIds.length} product${productIds.length === 1 ? "" : "s"}`
      : "matching products";
    const metafield = namespace && key ? `${namespace}.${key}` : "a metafield";
    const refPart = refType ? ` (${refType})` : "";
    return `Set ${metafield}${refPart} on ${productPart}.`;
  }

  if (toolName?.startsWith("shopify_")) {
    return `Shopify · ${labelize(toolName.replace(/^shopify_/, ""))}.`;
  }

  if (toolName?.startsWith("klaviyo_")) {
    return `Klaviyo · ${labelize(toolName.replace(/^klaviyo_/, ""))}.`;
  }

  if (toolName) {
    return `${labelize(toolName)} via ${labelize(provider ?? "connector")}.`;
  }

  return `${labelize(actionType ?? "Action")} via ${labelize(provider ?? "connector")}.`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberFromRecord(
  record: Record<string, unknown> | null,
  key: string,
): number | null {
  const value = record?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function stringFromRecord(
  record: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArrayFromRecord(
  record: Record<string, unknown> | null,
  key: string,
): string[] {
  const value = record?.[key];
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function labelize(value: string): string {
  if (!value) return "";
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
