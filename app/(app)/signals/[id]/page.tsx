import {
  Activity,
  ClipboardCheck,
  Database,
  Target,
  type LucideIcon,
} from "lucide-react";
import { notFound } from "next/navigation";

import { ChatOpenButton } from "@/components/chat-open-button";
import { PageHeader } from "@/components/page-header";
import { SeverityBadge, StatusBadge } from "@/components/status-badge";
import { canManageApp, requireCurrentUser } from "@/lib/auth/session";
import { formatDate, formatMoneyFromCents, titleCase } from "@/lib/format";
import {
  outcomeNeedsStoreChange,
} from "@/lib/signals/outcome-guidance";
import { isExecutableActionPlanPayload } from "@/lib/signals/flow";
import {
  buildActionOwnerSummary,
  buildSignalOwnerSummary,
} from "@/lib/signals/owner-summary";
import { getSignalDetail } from "@/lib/signals/queries";
import {
  approveActionPlanAction,
  executeActionPlanAction,
  ignoreSignalAction,
  rescanSignalOutcomeAction,
} from "./actions";

type EvidenceExample = {
  title: string;
  reasons: string[];
  productType: string | null;
  totalInventory: number | null;
  tags: number | null;
  descriptionLength: number | null;
  hasImage: boolean | null;
};

type SignalDetail = NonNullable<Awaited<ReturnType<typeof getSignalDetail>>>;
type SignalEvidence = SignalDetail["evidence"][number];

type CustomerMemberExample = {
  shopifyCustomerId: string;
  email: string | null;
  name: string | null;
  lifecycleStage: string;
  lifecycleTags: string[];
  orderCount: number | null;
  totalSpentCents: number | null;
  currency: string | null;
  lastOrderAt: string | null;
  previousStage: string | null;
};

type LifecycleState = "complete" | "current" | "waiting";
type VisibleFlowState = LifecycleState | "blocked";

type VisibleFlowStep = {
  label: string;
  detail: string;
  state: VisibleFlowState;
  icon: LucideIcon;
};

export default async function SignalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, user] = await Promise.all([params, requireCurrentUser()]);
  if (!user.companyId) notFound();
  const signal = await getSignalDetail(user.companyId, id);

  if (!signal) notFound();

  const recommendation = signal.recommendations[0];
  const actionPlan = signal.actionPlans[0];
  const customerGroup = signal.customerGroups[0] ?? null;
  const latestExecution = actionPlan?.executions[0];
  const latestOutcome = signal.outcomes[0] ?? actionPlan?.outcomes[0];
  const outcomeScanConnectionId = getOutcomeScanConnectionId(signal, actionPlan);
  const canManage = canManageApp(user.role);
  const canExecutePlan = isExecutableActionPlanPayload(actionPlan);
  const canApprovePlan = isApprovableActionPlan(actionPlan);
  const canRunOutcomeScan =
    canManage &&
    Boolean(outcomeScanConnectionId) &&
    (latestOutcome?.status === "pending" ||
      outcomeNeedsStoreChange(latestOutcome?.status));
  const evidencePayload = getPrimaryEvidencePayload(
    signal.evidence.map((item) => item.rawPayload),
  );
  const evidenceExamples = parseEvidenceExamples(evidencePayload?.examples);
  const evidenceFacts = buildEvidenceFacts(signal.evidence);
  const evidenceProviders = uniqueValues(
    signal.evidence.map((item) => item.provider),
  );
  const topEvidenceReason = getTopEvidenceReason(evidenceExamples);
  const latestEvidenceObservedAt = getLatestEvidenceObservedAt(signal.evidence);
  const customerMembers = parseCustomerMembers(customerGroup?.membersJson);
  const activeProductCount = numberValue(evidencePayload?.activeProductCount);
  const confidencePercent = Math.round(signal.confidence * 100);
  const ownerSummary = buildSignalOwnerSummary(signal);
  const actionSummary = actionPlan
    ? buildActionOwnerSummary({
        ...actionPlan,
        signal: {
          title: signal.title,
          affectedObjectType: signal.affectedObjectType,
          affectedObjectId: signal.affectedObjectId,
        },
      })
    : null;
  const visibleFlow = buildVisibleFlow({
    signal,
    actionPlan,
    latestExecution,
    latestOutcome,
  });
  const primaryEvidenceFact = evidenceFacts[0] ?? null;
  const primaryExample = evidenceExamples[0] ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Signal"
        title={signal.title}
        description={signal.summary}
        marker="02"
        actions={
          canManage ? (
            <form action={ignoreSignalAction}>
              <input type="hidden" name="signalId" value={signal.id} />
              <button className="button" type="submit">
                Ignore
              </button>
            </form>
          ) : null
        }
      />

      <div className="signal-detail-view signal-detail-readable">
        <section
          className={`signal-command-panel signal-command-${ownerSummary.tone}`}
          data-chat-explain="true"
          data-chat-source="signal-detail-hero"
          data-chat-title={signal.title}
          data-chat-description={`Current state: ${ownerSummary.remainingWork.title}. ${ownerSummary.remainingWork.body}`}
          data-chat-signal-id={signal.id}
          data-chat-action-plan-id={actionPlan?.id}
          data-chat-object-type="signal"
          data-chat-object-id={signal.id}
          data-chat-prompt={`Explain this Signal in plain operator language: what is real now, what was recorded, what was affected, and what is left.`}
        >
          <ChatOpenButton label="Ask about this Signal" hint="Signal" />
          <div className="signal-command-main">
            <div className="signal-hero-badges">
              <SeverityBadge severity={signal.severity} />
              <StatusBadge status={signal.status} />
              <StatusBadge status={signal.category} />
            </div>
            <p className="kicker">{commandLabel(ownerSummary.lane)}</p>
            <h2>{ownerSummary.remainingWork.title}</h2>
            <p>{ownerSummary.remainingWork.body}</p>

            <div className="signal-command-actions">
              {actionPlan && !actionPlan.approval && canManage && canApprovePlan ? (
                <form action={approveActionPlanAction}>
                  <input type="hidden" name="actionPlanId" value={actionPlan.id} />
                  <input
                    type="hidden"
                    name="approvalText"
                    value="Approved in Ora Signal detail UI."
                  />
                  <button className="button button-primary" type="submit">
                    Approve plan
                  </button>
                </form>
              ) : null}

              {actionPlan?.approval &&
              actionPlan.status !== "executed" &&
              canManage &&
              canExecutePlan ? (
                <form action={executeActionPlanAction}>
                  <input type="hidden" name="actionPlanId" value={actionPlan.id} />
                  <button className="button button-primary" type="submit">
                    {executionButtonLabel(actionPlan)}
                  </button>
                </form>
              ) : null}

              {canRunOutcomeScan && outcomeScanConnectionId ? (
                <form action={rescanSignalOutcomeAction}>
                  <input type="hidden" name="signalId" value={signal.id} />
                  <input
                    type="hidden"
                    name="connectionId"
                    value={outcomeScanConnectionId}
                  />
                  <button className="button button-primary" type="submit">
                    Run outcome scan
                  </button>
                </form>
              ) : null}

              {canManage &&
              (latestOutcome?.status === "pending" ||
                outcomeNeedsStoreChange(latestOutcome?.status)) &&
              !outcomeScanConnectionId ? (
                <p className="muted text-sm">
                  Ora cannot identify the connected store for this Outcome scan.
                </p>
              ) : null}

              {actionPlan?.approval && !canExecutePlan ? (
                <p className="muted text-sm">
                  This action can be approved for review, but live execution for{" "}
                  {titleCase(actionPlan.provider)} is not wired yet.
                </p>
              ) : null}

              {actionPlan && !canManage ? (
                <p className="muted text-sm">
                  Only owners and admins can approve or execute actions.
                </p>
              ) : null}
            </div>
          </div>

          <div className="signal-visible-flow" aria-label="Real Signal flow">
            {visibleFlow.map((step) => {
              const Icon = step.icon;
              return (
                <div
                  className={`signal-visible-flow-step signal-visible-flow-${step.state}`}
                  key={step.label}
                >
                  <span className="signal-visible-flow-icon">
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <div>
                    <strong>{step.label}</strong>
                    <small>{step.detail}</small>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="signal-truth-grid" aria-label="Current Signal truth">
            <TruthCell
              label="Needs change"
              title={ownerSummary.changeNeeded.title}
              body={ownerSummary.changeNeeded.body}
            />
            <TruthCell
              label="Recorded"
              title={ownerSummary.recordedChange.title}
              body={ownerSummary.recordedChange.body}
            />
            <TruthCell
              label="Left"
              title={ownerSummary.remainingWork.title}
              body={ownerSummary.remainingWork.body}
            />
          </div>
        </section>

        <div className="signal-readable-grid">
          <section className="signal-readable-card">
            <div className="signal-readable-head">
              <p className="kicker">Evidence</p>
              <h2>{ownerSummary.proof.title}</h2>
              <p>{ownerSummary.proof.body}</p>
            </div>
            <div className="signal-brief-metrics">
              <FactMini
                label="Affected"
                value={ownerSummary.affected.label}
              />
              <FactMini
                label="Top blocker"
                value={
                  topEvidenceReason
                    ? titleCase(topEvidenceReason.reason)
                    : "Not tagged"
                }
              />
              <FactMini
                label="Source"
                value={
                  evidenceProviders.length
                    ? evidenceProviders.map(titleCase).join(", ")
                    : "Unknown"
                }
              />
            </div>
            {primaryExample ? (
              <div className="signal-one-example">
                <span>Example</span>
                <strong>{primaryExample.title}</strong>
                <p>
                  {primaryExample.reasons.length
                    ? primaryExample.reasons.map(titleCase).join(", ")
                    : "No example reason recorded."}
                </p>
              </div>
            ) : null}
          </section>

          <section className="signal-readable-card">
            <div className="signal-readable-head">
              <p className="kicker">Action record</p>
              <h2>{ownerSummary.recordedChange.title}</h2>
              <p>{ownerSummary.recordedChange.body}</p>
            </div>
            {actionSummary ? (
              <div className="signal-action-ledger">
                {actionSummary.logEntries.map((entry) => (
                  <div
                    className={`signal-ledger-entry signal-ledger-${entry.tone}`}
                    key={entry.label}
                  >
                    <span>{entry.label}</span>
                    <strong>{entry.status}</strong>
                    <p>{entry.body}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">
                No ActionPlan has been recorded for this Signal yet.
              </p>
            )}
          </section>
        </div>

        <details className="signal-supporting-details">
          <summary>Show supporting details</summary>
          <div className="signal-supporting-grid">
            <section className="signal-supporting-card">
              <h3>Signal facts</h3>
              <dl>
                <FactRow label="Type" value={titleCase(signal.type)} />
                <FactRow label="Severity" value={titleCase(signal.severity)} />
                <FactRow label="Status" value={titleCase(signal.status)} />
                <FactRow label="Category" value={titleCase(signal.category)} />
                <FactRow
                  label="Affected"
                  value={titleCase(signal.affectedObjectType)}
                />
                <FactRow label="Confidence" value={`${confidencePercent}%`} />
                <FactRow
                  label="Impact"
                  value={formatMoneyFromCents(signal.impactEstimateCents)}
                />
                <FactRow label="Detected" value={formatDate(signal.detectedAt)} />
                <FactRow label="Updated" value={formatDate(signal.updatedAt)} />
              </dl>
            </section>

            <section className="signal-supporting-card">
              <h3>Recommendation</h3>
              {recommendation ? (
                <>
                  <p>{recommendation.reasoning}</p>
                  {recommendation.expectedImpact ? (
                    <p>{recommendation.expectedImpact}</p>
                  ) : null}
                </>
              ) : (
                <p>No recommendation is recorded yet.</p>
              )}
            </section>

            <section className="signal-supporting-card">
              <h3>More proof</h3>
              {primaryEvidenceFact ? <p>{primaryEvidenceFact.summary}</p> : null}
              <FactMini
                label="Evidence records"
                value={`${signal.evidence.length}`}
              />
              <FactMini
                label="Unique facts"
                value={`${evidenceFacts.length}`}
              />
              <FactMini
                label="Observed"
                value={
                  latestEvidenceObservedAt
                    ? formatDate(latestEvidenceObservedAt)
                    : "Not yet"
                }
              />
              {customerGroup ? (
                <FactMini
                  label="Customer group"
                  value={`${customerGroup.memberCount} members`}
                />
              ) : (
                <FactMini
                  label="Active catalog"
                  value={activeProductCount ? String(activeProductCount) : "Unknown"}
                />
              )}
              {customerMembers.length ? (
                <p>{customerMembers.length} customer examples are recorded.</p>
              ) : null}
            </section>
          </div>
          {actionPlan ? (
            <details className="payload-details">
              <summary>Technical payload</summary>
              <pre>{JSON.stringify(actionPlan.previewPayload, null, 2)}</pre>
            </details>
          ) : null}
        </details>
      </div>
    </>
  );
}

function TruthCell({
  label,
  title,
  body,
}: {
  label: string;
  title: string;
  body: string;
}) {
  return (
    <div className="signal-truth-cell">
      <span>{label}</span>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

function commandLabel(lane: ReturnType<typeof buildSignalOwnerSummary>["lane"]) {
  if (lane === "done") return "Result";
  if (lane === "outcome_pending") return "Outcome check";
  if (lane === "watching") return "Store change needed";

  return "Next action";
}

function buildVisibleFlow({
  signal,
  actionPlan,
  latestExecution,
  latestOutcome,
}: {
  signal: SignalDetail;
  actionPlan: SignalDetail["actionPlans"][number] | undefined;
  latestExecution:
    | SignalDetail["actionPlans"][number]["executions"][number]
    | undefined;
  latestOutcome: SignalDetail["outcomes"][number] | undefined;
}): VisibleFlowStep[] {
  return [
    {
      label: "Problem",
      detail: `Detected ${formatDate(signal.detectedAt)}`,
      state: "complete",
      icon: Target,
    },
    {
      label: "Proof",
      detail: signal.evidence.length
        ? `${signal.evidence.length} evidence record${
            signal.evidence.length === 1 ? "" : "s"
          }`
        : "No evidence yet",
      state: signal.evidence.length ? "complete" : "current",
      icon: Database,
    },
    {
      label: "Action",
      detail: actionDetail(actionPlan, latestExecution),
      state: actionState(actionPlan, latestExecution),
      icon: ClipboardCheck,
    },
    {
      label: "Outcome",
      detail: latestOutcome ? titleCase(latestOutcome.status) : "Not measured",
      state: outcomeState(latestExecution, latestOutcome),
      icon: Activity,
    },
  ];
}

function actionDetail(
  actionPlan: SignalDetail["actionPlans"][number] | undefined,
  latestExecution:
    | SignalDetail["actionPlans"][number]["executions"][number]
    | undefined,
) {
  if (latestExecution?.status === "failed") return "Run failed";
  if (latestExecution) return "Recorded";
  if (actionPlan?.approval) return "Approved, not run";
  if (actionPlan) return "Needs approval";

  return "No action yet";
}

function actionState(
  actionPlan: SignalDetail["actionPlans"][number] | undefined,
  latestExecution:
    | SignalDetail["actionPlans"][number]["executions"][number]
    | undefined,
): VisibleFlowState {
  if (latestExecution?.status === "failed") return "blocked";
  if (latestExecution) return "complete";
  if (actionPlan) return "current";

  return "waiting";
}

function outcomeState(
  latestExecution:
    | SignalDetail["actionPlans"][number]["executions"][number]
    | undefined,
  latestOutcome: SignalDetail["outcomes"][number] | undefined,
): VisibleFlowState {
  if (latestExecution?.status === "failed") return "blocked";
  if (!latestOutcome) return latestExecution ? "current" : "waiting";
  if (latestOutcome.status === "pending") return "current";
  if (
    latestOutcome.status === "resolved" ||
    latestOutcome.status === "improving" ||
    outcomeNeedsStoreChange(latestOutcome.status)
  ) {
    return "complete";
  }

  return "current";
}

function getOutcomeScanConnectionId(
  signal: SignalDetail,
  actionPlan: SignalDetail["actionPlans"][number] | undefined,
) {
  if (signal.affectedObjectType === "store" && signal.affectedObjectId) {
    return signal.affectedObjectId;
  }

  const executionPayload = asRecord(actionPlan?.executionPayload);
  const executionArgs = asRecord(executionPayload?.args);
  const previewPayload = asRecord(actionPlan?.previewPayload);

  return (
    nullableString(executionArgs?.shopifyConnectionId) ??
    nullableString(previewPayload?.shopifyConnectionId) ??
    nullableString(previewPayload?.connectionId)
  );
}

function FactMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="signal-mini-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="signal-fact-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function getPrimaryEvidencePayload(payloads: unknown[]) {
  return (
    payloads.map(asRecord).find((payload) => Array.isArray(payload?.examples)) ??
    payloads.map(asRecord).find(isPresentRecord) ??
    null
  );
}

function parseEvidenceExamples(value: unknown): EvidenceExample[] {
  if (!Array.isArray(value)) return [];

  return value
    .map(asRecord)
    .filter(isPresentRecord)
    .map((item) => ({
      title: stringValue(item.title, "Untitled product"),
      reasons: Array.isArray(item.reasons)
        ? item.reasons.map((reason) => String(reason)).filter(Boolean)
        : [],
      productType: nullableString(item.productType),
      totalInventory: numberValue(item.totalInventory),
      tags: numberValue(item.tags),
      descriptionLength: numberValue(item.descriptionLength),
      hasImage:
        typeof item.hasImage === "boolean" ? item.hasImage : null,
    }))
    .slice(0, 10);
}

function buildEvidenceFacts(evidenceItems: SignalEvidence[]) {
  const facts = new Map<
    string,
    {
      key: string;
      title: string;
      summary: string;
      providers: string[];
      observedAt: SignalEvidence["observedAt"];
      count: number;
    }
  >();

  for (const evidence of evidenceItems) {
    const title = titleCase(evidence.evidenceType);
    const summary = summarizeEvidenceDisplay(evidence.displayText);
    const key = `${title}:${summary}`.toLowerCase();
    const current = facts.get(key);

    if (!current) {
      facts.set(key, {
        key,
        title,
        summary,
        providers: [evidence.provider],
        observedAt: evidence.observedAt,
        count: 1,
      });
      continue;
    }

    current.count += 1;
    if (!current.providers.includes(evidence.provider)) {
      current.providers.push(evidence.provider);
    }
    if (new Date(evidence.observedAt) > new Date(current.observedAt)) {
      current.observedAt = evidence.observedAt;
    }
  }

  return [...facts.values()].sort((a, b) => b.count - a.count);
}

function summarizeEvidenceDisplay(value: string) {
  const withoutExamples = value.split(/\bExamples:/i)[0]?.trim() ?? value;
  const normalized = withoutExamples.replace(/\s+/g, " ").trim();
  const withPeriod = /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;

  return withPeriod.length > 190
    ? `${withPeriod.slice(0, 187).trim()}...`
    : withPeriod;
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function getLatestEvidenceObservedAt(evidenceItems: SignalEvidence[]) {
  return evidenceItems
    .map((item) => item.observedAt)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
}

function getTopEvidenceReason(examples: EvidenceExample[]) {
  const counts = new Map<string, number>();

  for (const example of examples) {
    for (const reason of example.reasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }

  const [reason, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ??
    [];

  return reason ? { reason, count } : null;
}

function parseCustomerMembers(value: unknown): CustomerMemberExample[] {
  if (!Array.isArray(value)) return [];

  return value
    .map(asRecord)
    .filter(isPresentRecord)
    .map((item) => ({
      shopifyCustomerId: stringValue(item.shopifyCustomerId, "unknown"),
      email: nullableString(item.email),
      name: nullableString(item.name),
      lifecycleStage: stringValue(item.lifecycleStage, "unknown"),
      lifecycleTags: Array.isArray(item.lifecycleTags)
        ? item.lifecycleTags.map((tag) => String(tag)).filter(Boolean)
        : [],
      orderCount: numberValue(item.orderCount),
      totalSpentCents: numberValue(item.totalSpentCents),
      currency: nullableString(item.currency),
      lastOrderAt: nullableString(item.lastOrderAt),
      previousStage: nullableString(item.previousStage),
    }))
    .slice(0, 12);
}

function isApprovableActionPlan(
  actionPlan:
    | { status: string; approval?: unknown | null }
    | null
    | undefined,
) {
  return (
    !actionPlan?.approval &&
    (actionPlan?.status === "draft" ||
      actionPlan?.status === "approval_required")
  );
}

function executionButtonLabel(
  actionPlan: { provider: string; executionPayload: unknown },
) {
  const payload = asRecord(actionPlan.executionPayload);

  if (
    actionPlan.provider === "ora" &&
    payload?.toolName === "ora_prepare_operator_review_batch"
  ) {
    return "Start review batch";
  }

  return "Execute approved action";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isPresentRecord(
  value: Record<string, unknown> | null,
): value is Record<string, unknown> {
  return Boolean(value);
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
