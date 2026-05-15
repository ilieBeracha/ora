import {
  REVIEW_OUTCOME_PENDING_BODY,
  REVIEW_OUTCOME_PENDING_TITLE,
  REVIEW_OUTCOME_STORE_CHANGE_BODY,
  REVIEW_OUTCOME_STORE_CHANGE_TITLE,
  outcomeNeedsStoreChange,
} from "@/lib/signals/outcome-guidance";

export type FlowStepState = "complete" | "current" | "waiting" | "blocked";

export type SignalFlowStep = {
  key:
    | "signal"
    | "evidence"
    | "recommendation"
    | "actionPlan"
    | "approval"
    | "execution"
    | "outcome";
  label: string;
  state: FlowStepState;
  detail: string;
};

export type SignalFlowInput = {
  status?: string;
  evidence: unknown[];
  recommendations: unknown[];
  actionPlans: ActionPlanFlowInput[];
  outcomes?: OutcomeFlowInput[];
};

export type ActionPlanFlowInput = {
  status: string;
  provider: string;
  actionType: string;
  executionPayload: unknown;
  approval?: unknown | null;
  executions: ExecutionFlowInput[];
  outcomes?: OutcomeFlowInput[];
};

export type ExecutionFlowInput = {
  status: string;
  errorMessage?: string | null;
};

export type OutcomeFlowInput = {
  status: string;
  summary?: string | null;
};

export type ActionQueueLane =
  | "needs_approval"
  | "ready_to_run"
  | "blocked"
  | "outcome_pending"
  | "watching"
  | "done";

export type SignalFlowSummary = {
  currentStep: SignalFlowStep;
  nextTitle: string;
  nextBody: string;
  ctaLabel: string;
  steps: SignalFlowStep[];
  actionPlan: ActionPlanFlowInput | null;
  latestExecution: ExecutionFlowInput | null;
  latestOutcome: OutcomeFlowInput | null;
  queueLane: ActionQueueLane | null;
};

export type ActionQueueItem = {
  lane: ActionQueueLane;
  label: string;
  title: string;
  body: string;
  ctaLabel: string;
  priority: number;
};

export function getSignalFlow(signal: SignalFlowInput): SignalFlowSummary {
  const actionPlan = signal.actionPlans[0] ?? null;
  const latestExecution = actionPlan?.executions[0] ?? null;
  const latestOutcome =
    signal.outcomes?.[0] ?? actionPlan?.outcomes?.[0] ?? null;
  const executable = isExecutableActionPlanPayload(actionPlan);
  const queueItem = actionPlan
    ? getActionQueueItem(actionPlan, latestExecution, latestOutcome)
    : null;

  const steps: SignalFlowStep[] = [
    {
      key: "signal",
      label: "Signal",
      state: "complete",
      detail: "Detected",
    },
    {
      key: "evidence",
      label: "Evidence",
      state: signal.evidence.length > 0 ? "complete" : "current",
      detail: signal.evidence.length
        ? `${signal.evidence.length} record${
            signal.evidence.length === 1 ? "" : "s"
          }`
        : "Needs proof",
    },
    {
      key: "recommendation",
      label: "Recommendation",
      state: signal.recommendations.length
        ? "complete"
        : signal.evidence.length
          ? "current"
          : "waiting",
      detail: signal.recommendations.length ? "Ready" : "Missing",
    },
    {
      key: "actionPlan",
      label: "ActionPlan",
      state: actionPlan
        ? "complete"
        : signal.recommendations.length
          ? "current"
          : "waiting",
      detail: actionPlan ? labelize(actionPlan.status) : "Not prepared",
    },
    {
      key: "approval",
      label: "Approval",
      state: actionPlan?.approval
        ? "complete"
        : actionPlan
          ? "current"
          : "waiting",
      detail: actionPlan?.approval ? "Approved" : "Needed",
    },
    {
      key: "execution",
      label: "Execution",
      state: latestExecution
        ? latestExecution.status === "failed"
          ? "blocked"
          : "complete"
        : actionPlan?.approval
          ? executable
            ? "current"
            : "blocked"
          : "waiting",
      detail: latestExecution
        ? labelize(latestExecution.status)
        : actionPlan?.approval
          ? executable
            ? "Ready"
            : "Not wired"
          : "Waiting",
    },
    {
      key: "outcome",
      label: "Outcome",
      state: latestOutcome
        ? latestOutcome.status === "pending"
          ? "current"
          : "complete"
        : latestExecution
          ? latestExecution.status === "failed"
            ? "blocked"
            : "current"
          : "waiting",
      detail: latestOutcome ? labelize(latestOutcome.status) : "Not measured",
    },
  ];

  const currentStep =
    steps.find((step) => step.state === "blocked") ??
    steps.find((step) => step.state === "current") ??
    steps.at(-1) ??
    steps[0];

  return {
    currentStep,
    nextTitle: nextTitleForFlow({
      actionPlan,
      currentStep,
      executable,
      latestExecution,
      latestOutcome,
    }),
    nextBody: nextBodyForFlow({
      actionPlan,
      currentStep,
      executable,
      latestExecution,
      latestOutcome,
    }),
    ctaLabel: ctaLabelForFlow({
      actionPlan,
      currentStep,
      executable,
      latestExecution,
      latestOutcome,
    }),
    steps,
    actionPlan,
    latestExecution,
    latestOutcome,
    queueLane: queueItem?.lane ?? null,
  };
}

export function getActionQueueItem(
  actionPlan: ActionPlanFlowInput,
  latestExecution = actionPlan.executions[0] ?? null,
  latestOutcome = actionPlan.outcomes?.[0] ?? null,
): ActionQueueItem {
  if (latestExecution?.status === "failed" || actionPlan.status === "failed") {
    return {
      lane: "blocked",
      label: "Blocked",
      title: "Execution failed",
      body:
        latestExecution?.errorMessage ??
        "The last execution failed. Open the Signal and review the exact error before retrying.",
      ctaLabel: "Review blocker",
      priority: 3,
    };
  }

  if (!actionPlan.approval) {
    return {
      lane: "needs_approval",
      label: "Needs approval",
      title: "Approve the exact plan",
      body:
        "Review the deterministic payload and approve it before anything can run.",
      ctaLabel: "Review and approve",
      priority: 1,
    };
  }

  if (!latestExecution && isExecutableActionPlanPayload(actionPlan)) {
    return {
      lane: "ready_to_run",
      label: "Ready to run",
      title: "Run the approved plan",
      body:
        actionPlan.provider === "ora"
          ? "Starts the operator review batch in Ora."
          : "Runs the approved connector action.",
      ctaLabel: "Run approved plan",
      priority: 2,
    };
  }

  if (!latestExecution) {
    return {
      lane: "blocked",
      label: "Blocked",
      title: "Execution is not wired",
      body: `This ${labelize(
        actionPlan.provider,
      )} plan is approved, but Ora does not have a safe executor for it yet.`,
      ctaLabel: "Review blocker",
      priority: 3,
    };
  }

  if (!latestOutcome || latestOutcome.status === "pending") {
    return {
      lane: "outcome_pending",
      label: "Outcome pending",
      title: REVIEW_OUTCOME_PENDING_TITLE,
      body: REVIEW_OUTCOME_PENDING_BODY,
      ctaLabel: "Run outcome scan",
      priority: 4,
    };
  }

  if (["resolved", "improving"].includes(latestOutcome.status)) {
    return {
      lane: "done",
      label: "Done",
      title: labelize(latestOutcome.status),
      body: latestOutcome.summary ?? "Outcome has been measured.",
      ctaLabel: "Open result",
      priority: 6,
    };
  }

  if (outcomeNeedsStoreChange(latestOutcome.status)) {
    return {
      lane: "watching",
      label: "Store change",
      title: REVIEW_OUTCOME_STORE_CHANGE_TITLE,
      body: REVIEW_OUTCOME_STORE_CHANGE_BODY,
      ctaLabel: "Run outcome scan",
      priority: 3,
    };
  }

  return {
    lane: "watching",
    label: "Watching",
    title: labelize(latestOutcome.status),
    body: latestOutcome.summary ?? "Outcome has been measured and needs review.",
    ctaLabel: "Review outcome",
    priority: 5,
  };
}

export function summarizeActionQueue(items: ActionQueueItem[]) {
  const counts = new Map<ActionQueueLane, number>();

  for (const item of items) {
    counts.set(item.lane, (counts.get(item.lane) ?? 0) + 1);
  }

  return {
    needsApproval: counts.get("needs_approval") ?? 0,
    readyToRun: counts.get("ready_to_run") ?? 0,
    blocked: counts.get("blocked") ?? 0,
    outcomePending: counts.get("outcome_pending") ?? 0,
    watching: counts.get("watching") ?? 0,
    done: counts.get("done") ?? 0,
  };
}

export function isExecutableActionPlanPayload(
  actionPlan:
    | Pick<ActionPlanFlowInput, "provider" | "executionPayload">
    | null
    | undefined,
) {
  if (!actionPlan) return false;

  const payload = asRecord(actionPlan.executionPayload);

  return (
    (actionPlan.provider === "ora" &&
      payload?.toolName === "ora_prepare_operator_review_batch") ||
    (actionPlan.provider === "shopify" &&
      payload?.toolName === "shopify_setProductReferenceMetafield")
  );
}

export function labelize(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function nextTitleForFlow({
  actionPlan,
  currentStep,
  executable,
  latestExecution,
  latestOutcome,
}: {
  actionPlan: ActionPlanFlowInput | null;
  currentStep: SignalFlowStep;
  executable: boolean;
  latestExecution: ExecutionFlowInput | null;
  latestOutcome: OutcomeFlowInput | null;
}) {
  if (currentStep.key === "evidence") return "Research the evidence";
  if (currentStep.key === "recommendation") return "Create the recommendation";
  if (currentStep.key === "actionPlan") return "Prepare one exact plan";
  if (currentStep.key === "approval") return "Approve the exact plan";
  if (currentStep.key === "execution" && actionPlan?.approval && executable) {
    return "Run the approved plan";
  }
  if (currentStep.key === "execution") return "Resolve the run blocker";
  if (currentStep.key === "outcome" && latestExecution?.status === "failed") {
    return "Fix failed execution";
  }
  if (
    currentStep.key === "outcome" &&
    (!latestOutcome || latestOutcome.status === "pending")
  ) {
    return REVIEW_OUTCOME_PENDING_TITLE;
  }

  return "Review the result";
}

function nextBodyForFlow({
  actionPlan,
  currentStep,
  executable,
  latestExecution,
  latestOutcome,
}: {
  actionPlan: ActionPlanFlowInput | null;
  currentStep: SignalFlowStep;
  executable: boolean;
  latestExecution: ExecutionFlowInput | null;
  latestOutcome: OutcomeFlowInput | null;
}) {
  if (currentStep.key === "evidence") {
    return "Ora needs proof before this should become an action.";
  }

  if (currentStep.key === "recommendation") {
    return "The Signal has evidence. The next useful UI state is the recommendation and risk.";
  }

  if (currentStep.key === "actionPlan") {
    return "Turn the recommendation into one deterministic ActionPlan before approval.";
  }

  if (currentStep.key === "approval") {
    return "Approval locks the exact payload. Nothing mutates before this step.";
  }

  if (currentStep.key === "execution" && actionPlan?.approval && executable) {
    return actionPlan.provider === "ora"
      ? "This run starts an Ora operator review batch."
      : "This run executes the approved connector mutation.";
  }

  if (currentStep.key === "execution") {
    return "The plan is approved, but there is no safe executor for this provider yet.";
  }

  if (currentStep.key === "outcome" && latestExecution?.status === "failed") {
    return latestExecution.errorMessage ?? "Execution failed and needs review.";
  }

  if (
    currentStep.key === "outcome" &&
    (!latestOutcome || latestOutcome.status === "pending")
  ) {
    return REVIEW_OUTCOME_PENDING_BODY;
  }

  return latestOutcome?.summary ?? "The full flow has a measured outcome.";
}

function ctaLabelForFlow({
  actionPlan,
  currentStep,
  executable,
  latestOutcome,
}: {
  actionPlan: ActionPlanFlowInput | null;
  currentStep: SignalFlowStep;
  executable: boolean;
  latestExecution: ExecutionFlowInput | null;
  latestOutcome: OutcomeFlowInput | null;
}) {
  if (currentStep.key === "approval") return "Review and approve";
  if (currentStep.key === "execution" && actionPlan?.approval && executable) {
    return "Run approved plan";
  }
  if (currentStep.key === "outcome" && latestOutcome?.status === "pending") {
    return "Run outcome scan";
  }
  if (currentStep.key === "outcome" && latestOutcome) return "Review outcome";
  if (currentStep.state === "blocked") return "Review blocker";

  return "Open Signal";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
