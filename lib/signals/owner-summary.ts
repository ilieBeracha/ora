import { formatDate } from "@/lib/format";
import {
  getActionQueueItem,
  getSignalFlow,
  labelize,
  type ActionQueueLane,
  type ActionPlanFlowInput,
  type ExecutionFlowInput,
  type OutcomeFlowInput,
} from "@/lib/signals/flow";

export type SummaryTone =
  | "attention"
  | "ready"
  | "blocked"
  | "watching"
  | "done"
  | "research";

export type SummaryCell = {
  title: string;
  body: string;
};

export type AffectedSummary = {
  label: string;
  detail: string;
  count: number | null;
};

export type ActionLogEntry = {
  label: string;
  status: string;
  body: string;
  meta: string | null;
  tone: SummaryTone;
};

export type SignalOwnerSummary = {
  tone: SummaryTone;
  lane: ActionQueueLane | "research";
  affected: AffectedSummary;
  changeNeeded: SummaryCell;
  recordedChange: SummaryCell;
  remainingWork: SummaryCell;
  proof: SummaryCell;
  actionLogLine: string;
};

export type ActionOwnerSummary = {
  tone: SummaryTone;
  affected: AffectedSummary;
  recordedChange: SummaryCell;
  remainingWork: SummaryCell;
  logEntries: ActionLogEntry[];
};

export type SignalOwnerSummaryInput = {
  title: string;
  summary: string;
  affectedObjectType: string;
  affectedObjectId?: string | null;
  evidence: EvidenceSummaryInput[];
  recommendations: RecommendationSummaryInput[];
  actionPlans: ActionPlanOwnerInput[];
  outcomes?: OutcomeSummaryInput[];
};

export type ActionOwnerInput = ActionPlanOwnerInput & {
  signal: {
    title: string;
    affectedObjectType: string;
    affectedObjectId?: string | null;
  };
};

export type ActionPlanOwnerInput = ActionPlanFlowInput & {
  id?: string;
  actionType: string;
  previewPayload: unknown;
  createdAt?: Date | string;
  updatedAt?: Date | string;
  approval?: ApprovalSummaryInput | null;
  executions: ExecutionOwnerInput[];
  outcomes?: OutcomeSummaryInput[];
};

export type EvidenceSummaryInput = {
  displayText?: string | null;
  rawPayload?: unknown;
  observedAt?: Date | string;
};

export type RecommendationSummaryInput = {
  title: string;
  reasoning: string;
  expectedImpact?: string | null;
};

export type ApprovalSummaryInput = {
  approvedAt?: Date | string;
  approvedBy?: { email?: string | null } | null;
};

export type ExecutionOwnerInput = ExecutionFlowInput & {
  toolName?: string | null;
  inputPayload?: unknown;
  outputPayload?: unknown;
  executedAt?: Date | string;
};

export type OutcomeSummaryInput = OutcomeFlowInput & {
  measuredAt?: Date | string;
  metricsJson?: unknown;
};

export function buildSignalOwnerSummary(
  signal: SignalOwnerSummaryInput,
): SignalOwnerSummary {
  const actionPlan = signal.actionPlans[0] ?? null;
  const latestExecution = actionPlan?.executions[0] ?? null;
  const latestOutcome =
    signal.outcomes?.[0] ?? actionPlan?.outcomes?.[0] ?? null;
  const queueItem = actionPlan
    ? getActionQueueItem(actionPlan, latestExecution, latestOutcome)
    : null;
  const flow = getSignalFlow(signal);
  const lane = queueItem?.lane ?? "research";
  const affected = describeAffectedScope({
    signal,
    actionPlan,
    latestExecution,
    latestOutcome,
  });
  const recordedChange = describeRecordedChange({
    actionPlan,
    latestExecution,
    latestOutcome,
  });

  return {
    tone: toneForLane(lane),
    lane,
    affected,
    changeNeeded: describeNeededChange(signal, actionPlan),
    recordedChange,
    remainingWork: {
      title: queueItem?.title ?? flow.nextTitle,
      body: queueItem?.body ?? flow.nextBody,
    },
    proof: describeProof(signal),
    actionLogLine: buildSignalLogLine({
      actionPlan,
      latestExecution,
      latestOutcome,
    }),
  };
}

export function buildActionOwnerSummary(
  actionPlan: ActionOwnerInput,
): ActionOwnerSummary {
  const latestExecution = actionPlan.executions[0] ?? null;
  const latestOutcome = actionPlan.outcomes?.[0] ?? null;
  const queueItem = getActionQueueItem(
    actionPlan,
    latestExecution,
    latestOutcome,
  );
  const affected = describeAffectedScope({
    signal: actionPlan.signal,
    actionPlan,
    latestExecution,
    latestOutcome,
  });
  const recordedChange = describeRecordedChange({
    actionPlan,
    latestExecution,
    latestOutcome,
  });

  return {
    tone: toneForLane(queueItem.lane),
    affected,
    recordedChange,
    remainingWork: {
      title: queueItem.title,
      body: queueItem.body,
    },
    logEntries: buildActionLogEntries(
      actionPlan,
      latestExecution,
      latestOutcome,
    ),
  };
}

export function summarizeSignalOwnerQueue(items: SignalOwnerSummary[]) {
  return {
    research: items.filter((item) => item.lane === "research").length,
    needsApproval: items.filter((item) => item.lane === "needs_approval").length,
    readyToRun: items.filter((item) => item.lane === "ready_to_run").length,
    blocked: items.filter((item) => item.lane === "blocked").length,
    outcomePending: items.filter((item) =>
      ["outcome_pending", "watching"].includes(item.lane),
    ).length,
    done: items.filter((item) => item.lane === "done").length,
  };
}

function describeNeededChange(
  signal: SignalOwnerSummaryInput,
  actionPlan: ActionPlanOwnerInput | null,
): SummaryCell {
  const preview = asRecord(actionPlan?.previewPayload);
  const operatorDecision = nullableString(preview?.operatorDecision);
  const recommendation = signal.recommendations[0];

  if (operatorDecision) {
    return {
      title: "Operator decision",
      body: truncateSentence(operatorDecision, 150),
    };
  }

  if (recommendation) {
    return {
      title: recommendation.title,
      body: truncateSentence(
        recommendation.expectedImpact ??
          recommendation.reasoning ??
          signal.summary,
        150,
      ),
    };
  }

  return {
    title: "Understand the Signal",
    body: truncateSentence(signal.summary, 150),
  };
}

function describeRecordedChange({
  actionPlan,
  latestExecution,
  latestOutcome,
}: {
  actionPlan: ActionPlanOwnerInput | null;
  latestExecution: ExecutionOwnerInput | null;
  latestOutcome: OutcomeSummaryInput | null;
}): SummaryCell {
  if (latestOutcome && latestOutcome.status !== "pending") {
    return {
      title: `Outcome recorded: ${labelize(latestOutcome.status)}`,
      body: truncateSentence(
        latestOutcome.summary ?? "Outcome has been recorded.",
        150,
      ),
    };
  }

  if (latestExecution?.status === "failed") {
    return {
      title: "Failed run recorded",
      body:
        latestExecution.errorMessage ??
        "The attempted execution failed and needs review.",
    };
  }

  if (latestExecution?.status === "success") {
    const toolName =
      latestExecution.toolName ??
      toolNameFromPayload(latestExecution.inputPayload);

    if (toolName === "ora_prepare_operator_review_batch") {
      return {
        title: "Review batch recorded",
        body:
          "Ora logged the operator review batch. No connected store data changed automatically.",
      };
    }

    if (toolName === "shopify_setProductReferenceMetafield") {
      return {
        title: "Shopify update recorded",
        body:
          "The approved Shopify mutation ran and Ora recorded the verification result.",
      };
    }

    return {
      title: "Execution recorded",
      body: "Ora recorded a successful run for the approved action.",
    };
  }

  if (actionPlan?.approval) {
    return {
      title: "Approval recorded",
      body:
        "The exact payload is approved. No execution has been recorded yet.",
    };
  }

  if (actionPlan) {
    return {
      title: "Plan prepared",
      body: "No approval or connected-system change has been recorded yet.",
    };
  }

  return {
    title: "Nothing changed yet",
    body: "Only the Signal research is recorded. No ActionPlan exists yet.",
  };
}

function describeProof(signal: SignalOwnerSummaryInput): SummaryCell {
  const evidence = signal.evidence[0];

  return {
    title: evidence ? "Proof recorded" : "Proof missing",
    body: evidence?.displayText
      ? truncateSentence(evidence.displayText, 150)
      : "Ora needs an Evidence record before this should become an action.",
  };
}

function describeAffectedScope({
  signal,
  actionPlan,
  latestExecution,
  latestOutcome,
}: {
  signal: {
    affectedObjectType: string;
    affectedObjectId?: string | null;
  };
  actionPlan?: ActionPlanOwnerInput | null;
  latestExecution?: ExecutionOwnerInput | null;
  latestOutcome?: OutcomeSummaryInput | null;
}): AffectedSummary {
  const preview = asRecord(actionPlan?.previewPayload);
  const executionInput = asRecord(latestExecution?.inputPayload);
  const executionArgs = asRecord(executionInput?.args);
  const output = asRecord(latestExecution?.outputPayload);
  const metrics = asRecord(latestOutcome?.metricsJson);
  const examples = arrayValue(preview?.examples);
  const referenceProductIds = stringArray(executionArgs?.referenceProductIds);
  const count =
    numberValue(output?.affectedCount) ??
    numberValue(metrics?.affectedCount) ??
    numberValue(preview?.affectedCount) ??
    numberValue(executionArgs?.affectedCount) ??
    (referenceProductIds.length ? referenceProductIds.length : null) ??
    (examples.length ? examples.length : null);
  const scope =
    count == null
      ? labelize(signal.affectedObjectType)
      : `${count} ${affectedNoun(signal.affectedObjectType, count)}`;
  const objective =
    nullableString(preview?.objective) ??
    nullableString(preview?.operatorDecision);

  if (objective) {
    return {
      label: scope,
      detail: truncateSentence(objective, 150),
      count,
    };
  }

  if (signal.affectedObjectId) {
    return {
      label: scope,
      detail: `Affected ${labelize(signal.affectedObjectType)} ${shortObjectId(
        signal.affectedObjectId,
      )}.`,
      count,
    };
  }

  return {
    label: scope,
    detail: `Affected scope is ${labelize(signal.affectedObjectType)}.`,
    count,
  };
}

function buildActionLogEntries(
  actionPlan: ActionOwnerInput,
  latestExecution: ExecutionOwnerInput | null,
  latestOutcome: OutcomeSummaryInput | null,
): ActionLogEntry[] {
  const approval = actionPlan.approval;

  return [
    {
      label: "Plan",
      status: labelize(actionPlan.status),
      body: `${labelize(actionPlan.actionType)} prepared.`,
      meta: actionPlan.createdAt ? formatDate(actionPlan.createdAt) : null,
      tone: "research",
    },
    {
      label: "Approval",
      status: approval ? "Approved" : "Not approved",
      body: approval
        ? `Approved by ${approval.approvedBy?.email ?? "an Ora user"}.`
        : "No execution can run until approval is recorded.",
      meta: approval?.approvedAt ? formatDate(approval.approvedAt) : null,
      tone: approval ? "done" : "attention",
    },
    {
      label: "Execution",
      status: latestExecution ? labelize(latestExecution.status) : "Not run",
      body: executionLogBody(actionPlan, latestExecution),
      meta: latestExecution?.executedAt
        ? formatDate(latestExecution.executedAt)
        : null,
      tone: latestExecution
        ? latestExecution.status === "failed"
          ? "blocked"
          : "done"
        : approval
          ? "ready"
          : "watching",
    },
    {
      label: "Outcome",
      status: latestOutcome ? labelize(latestOutcome.status) : "Not measured",
      body:
        latestOutcome?.summary ??
        "Outcome is recorded after execution or follow-up measurement.",
      meta: latestOutcome?.measuredAt
        ? formatDate(latestOutcome.measuredAt)
        : null,
      tone: latestOutcome
        ? latestOutcome.status === "resolved" ||
          latestOutcome.status === "improving"
          ? "done"
          : "watching"
        : "watching",
    },
  ];
}

function executionLogBody(
  actionPlan: ActionOwnerInput,
  latestExecution: ExecutionOwnerInput | null,
) {
  if (!latestExecution) {
    return actionPlan.approval
      ? "Approved and waiting to run."
      : "Waiting for approval.";
  }

  if (latestExecution.errorMessage) return latestExecution.errorMessage;

  const toolName =
    latestExecution.toolName ??
    toolNameFromPayload(latestExecution.inputPayload);

  if (toolName === "ora_prepare_operator_review_batch") {
    return "Ora recorded the review batch and kept connected systems unchanged.";
  }

  if (toolName === "shopify_setProductReferenceMetafield") {
    return "Shopify metafield mutation ran and Ora stored the verification result.";
  }

  return "Ora recorded the execution result.";
}

function buildSignalLogLine({
  actionPlan,
  latestExecution,
  latestOutcome,
}: {
  actionPlan: ActionPlanOwnerInput | null;
  latestExecution: ExecutionOwnerInput | null;
  latestOutcome: OutcomeSummaryInput | null;
}) {
  if (latestOutcome) {
    return `Outcome: ${labelize(latestOutcome.status)}`;
  }

  if (latestExecution) {
    return `Execution: ${labelize(latestExecution.status)}`;
  }

  if (actionPlan?.approval) {
    return "Approval recorded";
  }

  if (actionPlan) {
    return "ActionPlan prepared";
  }

  return "Research only";
}

function toneForLane(lane: ActionQueueLane | "research"): SummaryTone {
  if (lane === "blocked") return "blocked";
  if (lane === "ready_to_run") return "ready";
  if (lane === "outcome_pending" || lane === "watching") return "watching";
  if (lane === "done") return "done";
  if (lane === "research") return "research";

  return "attention";
}

function affectedNoun(affectedObjectType: string, count: number) {
  const noun =
    affectedObjectType === "customer_segment"
      ? "customer segment"
      : affectedObjectType === "store"
        ? "store area"
        : affectedObjectType.replaceAll("_", " ");

  if (count === 1) return noun;
  if (noun.endsWith("s")) return noun;

  return `${noun}s`;
}

function toolNameFromPayload(payload: unknown) {
  return nullableString(asRecord(payload)?.toolName);
}

function truncateSentence(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;

  return `${normalized.slice(0, maxLength - 1).trim()}...`;
}

function shortObjectId(value: string) {
  return value.split("/").filter(Boolean).at(-1) ?? value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
