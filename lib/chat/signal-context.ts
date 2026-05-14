import { getSignalDetail } from "@/lib/signals/queries";
import { ChatWidgetSchema, type ChatWidget } from "@/lib/chat/widgets";

export type ChatContextLike = {
  signalId?: string;
  actionPlanId?: string;
  href?: string;
};

export type SignalChatRecord = NonNullable<
  Awaited<ReturnType<typeof getSignalDetail>>
>;

export function resolveSignalIdFromContext(
  context: ChatContextLike | null | undefined,
) {
  if (context?.signalId) return context.signalId;

  const href = context?.href;
  if (!href) return null;

  const match = href.match(/^\/signals\/([^/?#]+)/);

  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export async function getSignalChatRecord(
  companyId: string,
  context: ChatContextLike | null | undefined,
) {
  const signalId = resolveSignalIdFromContext(context);
  if (!signalId) return null;

  return getSignalDetail(companyId, signalId);
}

export function buildSignalContextBlock(signal: SignalChatRecord) {
  const recommendation = signal.recommendations[0];
  const actionPlan = signal.actionPlans[0];
  const latestExecution = actionPlan?.executions[0] ?? null;
  const latestOutcome = signal.outcomes[0] ?? actionPlan?.outcomes[0] ?? null;
  const customerGroup = signal.customerGroups[0] ?? null;
  const evidence = signal.evidence
    .slice(0, 6)
    .map(
      (item, index) =>
        `${index + 1}. ${labelize(item.evidenceType)} (${item.provider}, ${formatDateForChat(
          item.observedAt,
        )}): ${item.displayText}`,
    );

  return [
    "Local Ora Signal record. This is authoritative company-scoped Ora data for the current Signal. If the user asks about this Signal, this action plan, status, approval, execution, or outcome, answer directly from this record and do not ask for the Signal id.",
    "",
    `Signal: ${signal.title}`,
    `- ID: ${signal.id}`,
    `- Type: ${labelize(signal.type)}`,
    `- Status: ${labelize(signal.status)}`,
    `- Severity: ${labelize(signal.severity)}`,
    `- Category: ${labelize(signal.category)}`,
    `- Confidence: ${Math.round(signal.confidence * 100)}%`,
    `- Affected object: ${labelize(signal.affectedObjectType)}${
      signal.affectedObjectId ? ` (${signal.affectedObjectId})` : ""
    }`,
    `- Summary: ${signal.summary}`,
    `- Detected: ${formatDateForChat(signal.detectedAt)}`,
    `- Updated: ${formatDateForChat(signal.updatedAt)}`,
    "",
    recommendation
      ? [
          `Recommendation: ${recommendation.title}`,
          `- Reasoning: ${recommendation.reasoning}`,
          `- Expected impact: ${recommendation.expectedImpact ?? "Not estimated"}`,
          `- Risk: ${labelize(recommendation.riskLevel)}`,
          `- Confidence: ${Math.round(recommendation.confidence * 100)}%`,
        ].join("\n")
      : "Recommendation: none prepared.",
    "",
    actionPlan
      ? [
          `Action plan: ${labelize(actionPlan.actionType)}`,
          `- ID: ${actionPlan.id}`,
          `- Provider: ${labelize(actionPlan.provider)}`,
          `- Status: ${labelize(actionPlan.status)}`,
          `- Created: ${formatDateForChat(actionPlan.createdAt)}`,
          `- Updated: ${formatDateForChat(actionPlan.updatedAt)}`,
        ].join("\n")
      : "Action plan: none prepared.",
    "",
    actionPlan?.approval
      ? [
          "Approval: approved",
          `- Approved at: ${formatDateForChat(actionPlan.approval.approvedAt)}`,
          `- Approval text: ${actionPlan.approval.approvalText}`,
          `- Payload hash: ${actionPlan.approval.approvalPayloadHash}`,
        ].join("\n")
      : "Approval: not approved.",
    "",
    latestExecution
      ? [
          `Execution: ${labelize(latestExecution.status)}`,
          `- Tool: ${latestExecution.toolName}`,
          `- Provider: ${latestExecution.provider}`,
          `- Executed at: ${formatDateForChat(latestExecution.executedAt)}`,
          latestExecution.errorMessage
            ? `- Error: ${latestExecution.errorMessage}`
            : "- Error: none recorded",
        ].join("\n")
      : "Execution: not run.",
    "",
    latestOutcome
      ? [
          `Outcome: ${labelize(latestOutcome.status)}`,
          `- Measured at: ${formatDateForChat(latestOutcome.measuredAt)}`,
          `- Summary: ${latestOutcome.summary}`,
        ].join("\n")
      : "Outcome: not measured yet.",
    "",
    customerGroup
      ? [
          `Customer group: ${customerGroup.name}`,
          `- Members: ${customerGroup.memberCount}`,
          `- Status: ${labelize(customerGroup.status)}`,
          `- Description: ${customerGroup.description}`,
        ].join("\n")
      : "Customer group: none linked.",
    "",
    evidence.length ? `Evidence:\n${evidence.join("\n")}` : "Evidence: none recorded.",
  ].join("\n");
}

export function buildSignalStatusWidgets(signal: SignalChatRecord): ChatWidget[] {
  const recommendation = signal.recommendations[0];
  const actionPlan = signal.actionPlans[0];
  const latestExecution = actionPlan?.executions[0] ?? null;
  const latestOutcome = signal.outcomes[0] ?? actionPlan?.outcomes[0] ?? null;
  const approval = actionPlan?.approval ?? null;

  return [
    ChatWidgetSchema.parse({
      type: "scorecard_grid",
      props: {
        title: "Current Signal status",
        cards: [
          {
            label: "Signal",
            value: labelize(signal.status),
            hint: `${labelize(signal.severity)} severity · ${Math.round(
              signal.confidence * 100,
            )}% confidence`,
          },
          {
            label: "Action plan",
            value: actionPlan ? labelize(actionPlan.status) : "Not prepared",
            hint: actionPlan
              ? truncate(labelize(actionPlan.actionType), 120)
              : "No exact action exists yet",
          },
          {
            label: "Approval",
            value: approval ? "Approved" : "Not approved",
            hint: approval
              ? `Approved ${formatDateForChat(approval.approvedAt)}`
              : "Required before mutation",
          },
          {
            label: "Execution",
            value: latestExecution ? labelize(latestExecution.status) : "Not run",
            hint: latestExecution
              ? truncate(
                  latestExecution.errorMessage ??
                    `${latestExecution.toolName} · ${formatDateForChat(
                      latestExecution.executedAt,
                    )}`,
                  120,
                )
              : "Waiting on approval and execution",
          },
          {
            label: "Outcome",
            value: latestOutcome ? labelize(latestOutcome.status) : "Pending",
            hint: latestOutcome
              ? truncate(latestOutcome.summary, 120)
              : "Not measured yet",
          },
          {
            label: "Recommendation",
            value: recommendation ? "Ready" : "Missing",
            hint: recommendation
              ? truncate(recommendation.title, 120)
              : "No recommendation exists yet",
          },
        ],
      },
    }),
  ];
}

function formatDateForChat(value: Date | string | null | undefined) {
  if (!value) return "Not recorded";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";

  return date.toISOString();
}

function labelize(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function truncate(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;

  return `${value.slice(0, maxLength - 1).trim()}…`;
}
