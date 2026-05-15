import {
  CheckCircle2,
  Database,
  Gauge,
  Lightbulb,
  Target,
  UsersRound,
} from "lucide-react";
import { notFound } from "next/navigation";

import { ChatOpenButton } from "@/components/chat-open-button";
import { PageHeader } from "@/components/page-header";
import { RiskBadge, SeverityBadge, StatusBadge } from "@/components/status-badge";
import { canManageApp, requireCurrentUser } from "@/lib/auth/session";
import { formatDate, formatMoneyFromCents, titleCase } from "@/lib/format";
import { getSignalDetail } from "@/lib/signals/queries";
import {
  computeDecisionGuidance,
  computeDecisionLabel,
  computeStages,
  executionButtonLabel,
  isApprovableActionPlan,
  isExecutableActionPlan,
  summarizeActionPlanPayload,
  summarizeActionPlanPlain,
} from "@/lib/signals/decision";
import {
  buildEvidenceFacts,
  getLatestEvidenceObservedAt,
  getTopEvidenceReason,
  uniqueValues,
} from "@/lib/signals/evidence-facts";
import {
  approveActionPlanAction,
  executeActionPlanAction,
  ignoreSignalAction,
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
  const canManage = canManageApp(user.role);
  const canExecutePlan = isExecutableActionPlan(actionPlan);
  const canApprovePlan = isApprovableActionPlan(actionPlan);
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
  const detectedCount = numberValue(evidencePayload?.count);
  const affectedCount = customerGroup?.memberCount ?? detectedCount;
  const activeProductCount = numberValue(evidencePayload?.activeProductCount);
  const confidencePercent = Math.round(signal.confidence * 100);
  const planPlain = summarizeActionPlanPlain(actionPlan);
  const decisionInput = {
    evidenceCount: signal.evidence.length,
    hasActionPlan: Boolean(actionPlan),
    hasApproval: Boolean(actionPlan?.approval),
    hasExecution: Boolean(latestExecution),
    executionStatus: latestExecution?.status ?? null,
    hasOutcome: Boolean(latestOutcome),
    outcomeStatus: latestOutcome?.status ?? null,
    canExecutePlan,
  };
  const stages = computeStages(decisionInput);
  const decisionLabel = computeDecisionLabel(decisionInput);
  const guidance = computeDecisionGuidance(decisionInput);
  const payloadSummary = summarizeActionPlanPayload(
    actionPlan?.actionType,
    actionPlan?.previewPayload,
    actionPlan?.provider,
  );
  const showHistory =
    Boolean(actionPlan?.approval) ||
    Boolean(latestExecution) ||
    Boolean(latestOutcome);

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

      <div className="signal-detail-view">
        <section
          className="signal-decision"
          data-chat-explain="true"
          data-chat-source="signal-detail-hero"
          data-chat-title={signal.title}
          data-chat-description={signal.summary}
          data-chat-signal-id={signal.id}
          data-chat-action-plan-id={actionPlan?.id}
          data-chat-object-type="signal"
          data-chat-object-id={signal.id}
          data-chat-prompt={`Explain this Signal detail: ${signal.title}. Summarize what matters and what I should inspect next.`}
        >
          <ChatOpenButton label="Open Signal summary in chat" hint="Signal summary" />

          <header className="signal-decision-head">
            <div className="signal-decision-headline">
              <div className="signal-decision-badges">
                <span
                  className={`signal-pill signal-pill-${decisionLabel.tone}`}
                >
                  {decisionLabel.label}
                </span>
                <SeverityBadge severity={signal.severity} />
                <StatusBadge status={signal.status} />
                <StatusBadge status={signal.category} />
              </div>
              <h2>{signal.summary}</h2>
              <p className="signal-decision-meta">
                <span>{titleCase(signal.severity)} severity</span>
                <span>{confidencePercent}% confidence</span>
                <span>
                  {formatMoneyFromCents(signal.impactEstimateCents)} impact
                </span>
                {affectedCount ? (
                  <span>
                    {affectedCount} {affectedLabel(signal.affectedObjectType).toLowerCase()}
                  </span>
                ) : null}
                <span>detected {formatDate(signal.detectedAt)}</span>
              </p>
            </div>

            <ol className="signal-stage-track" aria-label="Signal pipeline">
              {stages.map((stage) => (
                <li
                  className={`signal-stage signal-stage-${stage.state}`}
                  data-chat-explain="true"
                  data-chat-source="signal-lifecycle"
                  data-chat-title={stage.label}
                  data-chat-description={stage.detail}
                  data-chat-signal-id={signal.id}
                  data-chat-action-plan-id={actionPlan?.id}
                  data-chat-object-type="signal_lifecycle_step"
                  data-chat-object-id={`${signal.id}:${stage.key}`}
                  data-chat-prompt={`Explain the ${stage.label} stage for this Signal: ${signal.title}. Current state: ${stage.detail}.`}
                  key={stage.key}
                >
                  <ChatOpenButton
                    label={`Open ${stage.label} stage in chat`}
                    hint={`${stage.label} stage`}
                  />
                  <span className="signal-stage-dot" aria-hidden="true" />
                  <span className="signal-stage-text">
                    <strong>{stage.label}</strong>
                    <small>{stage.detail}</small>
                  </span>
                </li>
              ))}
            </ol>
          </header>

          <div
            className="signal-decision-action"
            data-chat-explain="true"
            data-chat-source="signal-next-action"
            data-chat-title={guidance.title}
            data-chat-description={guidance.body}
            data-chat-signal-id={signal.id}
            data-chat-action-plan-id={actionPlan?.id}
            data-chat-object-type="next_action"
            data-chat-object-id={actionPlan?.id ?? signal.id}
            data-chat-prompt={`Explain the next action for this Signal: ${signal.title}. Current state: ${guidance.title}.`}
          >
            <ChatOpenButton label="Open next action in chat" hint="Next action" />
            <div className="signal-decision-action-head">
              <span className="signal-decision-icon">
                <Gauge size={18} aria-hidden="true" />
              </span>
              <div>
                <p className="kicker">Next action</p>
                <h3>{guidance.title}</h3>
                <p className="signal-decision-action-body">{guidance.body}</p>
              </div>
            </div>

            {recommendation ? (
              <div className="signal-decision-recommendation">
                <div className="signal-decision-recommendation-head">
                  <Lightbulb size={15} aria-hidden="true" />
                  <span>Ora recommends</span>
                  <RiskBadge risk={recommendation.riskLevel} />
                  <span className="signal-decision-confidence">
                    {Math.round(recommendation.confidence * 100)}% confidence
                  </span>
                </div>
                <p className="signal-decision-recommendation-title">
                  {recommendation.title}
                </p>
                {actionPlan ? (
                  <p className="signal-decision-payload-summary">
                    <span>Will do:</span> {payloadSummary}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="signal-decision-buttons">
              {actionPlan && canApprovePlan && canManage ? (
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

              {actionPlan && !canManage ? (
                <p className="muted text-sm">
                  Only owners and admins can approve or execute actions.
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <div className="signal-body">
          <section
            className="signal-section-card"
            data-chat-explain="true"
            data-chat-source="signal-section"
            data-chat-title="What happened"
            data-chat-description={signal.summary}
            data-chat-signal-id={signal.id}
            data-chat-action-plan-id={actionPlan?.id}
            data-chat-object-type="signal"
            data-chat-object-id={signal.id}
            data-chat-prompt={`Explain what happened in this Signal: ${signal.title}.`}
          >
            <ChatOpenButton label="Open What happened in chat" hint="What happened" />
            <CompactSectionHeader
              icon={<Target size={16} aria-hidden="true" />}
              label="What happened"
            />
            <p className="signal-section-copy">{signal.summary}</p>
            <div className="signal-fact-strip">
              <FactCell label="Type" value={titleCase(signal.type)} />
              <FactCell
                label="Affected"
                value={titleCase(signal.affectedObjectType)}
              />
              <FactCell label="Updated" value={formatDate(signal.updatedAt)} />
              <FactCell
                label={customerGroup ? "Customer group" : "Active catalog"}
                value={
                  customerGroup
                    ? `${customerGroup.memberCount} members`
                    : activeProductCount
                      ? String(activeProductCount)
                      : "Unknown"
                }
              />
            </div>
          </section>

          <section
            className="signal-section-card"
            data-chat-explain="true"
            data-chat-source="signal-section"
            data-chat-title="Evidence"
            data-chat-description="Observed facts behind the Signal."
            data-chat-signal-id={signal.id}
            data-chat-action-plan-id={actionPlan?.id}
            data-chat-object-type="signal"
            data-chat-object-id={signal.id}
            data-chat-prompt={`Explain the evidence for this Signal: ${signal.title}.`}
          >
            <ChatOpenButton label="Open Evidence in chat" hint="Evidence" />
            <CompactSectionHeader
              icon={<Database size={16} aria-hidden="true" />}
              label="Evidence"
              meta={`${signal.evidence.length} record${
                signal.evidence.length === 1 ? "" : "s"
              } · ${evidenceFacts.length} unique`}
            />
            <div className="evidence-overview">
              <EvidenceMetric
                label="Detected"
                value={
                  affectedCount
                    ? String(affectedCount)
                    : String(signal.evidence.length)
                }
                hint={affectedLabel(signal.affectedObjectType)}
              />
              <EvidenceMetric
                label="Unique facts"
                value={String(evidenceFacts.length)}
                hint={`${signal.evidence.length} record${
                  signal.evidence.length === 1 ? "" : "s"
                }`}
              />
              <EvidenceMetric
                label="Top blocker"
                value={
                  topEvidenceReason
                    ? titleCase(topEvidenceReason.reason)
                    : "Not tagged"
                }
                hint={
                  topEvidenceReason
                    ? `${topEvidenceReason.count} example${
                        topEvidenceReason.count === 1 ? "" : "s"
                      }`
                    : "No example reasons"
                }
              />
              <EvidenceMetric
                label="Source"
                value={
                  evidenceProviders.length
                    ? evidenceProviders.map(titleCase).join(", ")
                    : "Unknown"
                }
                hint={
                  latestEvidenceObservedAt
                    ? `Observed ${formatDate(latestEvidenceObservedAt)}`
                    : "No observation date"
                }
              />
            </div>
            <ul className="evidence-list">
              {evidenceFacts.map((fact) => (
                <li className="evidence-row" key={fact.key}>
                  <div className="evidence-row-main">
                    <p className="kicker">
                      {fact.title}
                      {fact.count > 1 ? (
                        <span className="evidence-count">×{fact.count}</span>
                      ) : null}
                    </p>
                    <p>{fact.summary}</p>
                  </div>
                  <div className="evidence-row-meta">
                    {fact.providers.map((provider) => (
                      <StatusBadge key={provider} status={provider} />
                    ))}
                    <span>{formatDate(fact.observedAt)}</span>
                  </div>
                </li>
              ))}
            </ul>

            {evidenceExamples.length ? (
              <div className="signal-examples">
                <div className="signal-examples-header">
                  <h3>Example products</h3>
                  <span>{evidenceExamples.length} shown from evidence</span>
                </div>
                <div className="signal-example-list">
                  {evidenceExamples.map((example, index) => (
                    <article
                      className="signal-example-row"
                      key={`${example.title}-${index}`}
                    >
                      <div className="signal-example-number">
                        {String(index + 1).padStart(2, "0")}
                      </div>
                      <div>
                        <h4>{example.title}</h4>
                        <div className="signal-example-meta">
                          <span>
                            {example.productType ?? "No product type"}
                          </span>
                          <span>
                            {example.totalInventory == null
                              ? "Inventory unknown"
                              : `${example.totalInventory} units`}
                          </span>
                          <span>
                            {example.tags == null
                              ? "Tags unknown"
                              : `${example.tags} tag${
                                  example.tags === 1 ? "" : "s"
                                }`}
                          </span>
                          <span>
                            {example.descriptionLength == null
                              ? "Copy unknown"
                              : `${example.descriptionLength} copy chars`}
                          </span>
                        </div>
                        {example.reasons.length ? (
                          <div className="signal-reason-row">
                            {example.reasons.map((reason) => (
                              <span className="badge" key={reason}>
                                {reason}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          {customerGroup ? (
            <section
              className="signal-section-card"
              data-chat-explain="true"
              data-chat-source="signal-section"
              data-chat-title={customerGroup.name}
              data-chat-description={customerGroup.description}
              data-chat-signal-id={signal.id}
              data-chat-action-plan-id={actionPlan?.id}
              data-chat-object-type="customer_group"
              data-chat-object-id={customerGroup.id}
              data-chat-prompt={`Explain this customer group and what grouped actions make sense: ${customerGroup.name}.`}
            >
              <ChatOpenButton
                label={`Open ${customerGroup.name} in chat`}
                hint="Customer group"
              />
              <CompactSectionHeader
                icon={<UsersRound size={16} aria-hidden="true" />}
                label="Customer group"
                meta={`${customerGroup.memberCount} members · ${formatMoneyFromCents(
                  customerGroup.estimatedRevenueCents,
                )}`}
              />
              <p className="signal-section-copy">
                {customerGroup.description}
              </p>
              {customerMembers.length ? (
                <div className="customer-table-wrap">
                  <table className="customer-table">
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Stage</th>
                        <th>Orders</th>
                        <th>Spend</th>
                        <th>Last order</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customerMembers.slice(0, 8).map((member, index) => (
                        <tr key={`${member.shopifyCustomerId}-${index}`}>
                          <td>
                            <strong>
                              {member.name ??
                                member.email ??
                                "Shopify customer"}
                            </strong>
                          </td>
                          <td>{titleCase(member.lifecycleStage)}</td>
                          <td>
                            {member.orderCount == null
                              ? "—"
                              : member.orderCount}
                          </td>
                          <td>
                            {formatCustomerSpend(
                              member.totalSpentCents,
                              member.currency,
                            )}
                          </td>
                          <td>
                            {member.lastOrderAt
                              ? formatDate(member.lastOrderAt)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          ) : null}

          <section
            className="signal-section-card"
            data-chat-explain="true"
            data-chat-source="signal-section"
            data-chat-title="Action plan"
            data-chat-description={
              actionPlan
                ? `Exact proposed action: ${titleCase(actionPlan.actionType)}.`
                : "No exact action plan has been prepared yet."
            }
            data-chat-signal-id={signal.id}
            data-chat-action-plan-id={actionPlan?.id}
            data-chat-object-type="action_plan"
            data-chat-object-id={actionPlan?.id ?? signal.id}
            data-chat-prompt={`Explain the action plan for this Signal: ${signal.title}. Include whether approval or execution is blocked.`}
          >
            <ChatOpenButton label="Open Action plan in chat" hint="Action plan" />
            <CompactSectionHeader
              icon={<Lightbulb size={16} aria-hidden="true" />}
              label="Action plan"
              meta={
                actionPlan
                  ? `${titleCase(actionPlan.provider)} · ${titleCase(
                      actionPlan.status,
                    )}`
                  : "Not prepared"
              }
            />

            {actionPlan && planPlain ? (
              <>
                <p className="signal-section-copy">
                  <strong>{planPlain.headline}.</strong> {payloadSummary}
                </p>
                <p className="muted text-sm signal-section-secondary">
                  {planPlain.body}
                </p>
                {planPlain.operatorDecision || planPlain.requiredReview.length ? (
                  <div className="signal-plan-checklist">
                    {planPlain.operatorDecision ? (
                      <div>
                        <strong>Decision needed</strong>
                        <p>{planPlain.operatorDecision}</p>
                      </div>
                    ) : null}
                    {planPlain.requiredReview.length ? (
                      <div>
                        <strong>Required review</strong>
                        <ul>
                          {planPlain.requiredReview.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <details className="payload-raw">
                  <summary>Technical payload</summary>
                  <pre className="payload-inline">
                    {JSON.stringify(actionPlan.previewPayload, null, 2)}
                  </pre>
                </details>
              </>
            ) : (
              <p className="muted text-sm">
                This Signal is informational until Ora can prepare an exact
                action.
              </p>
            )}

            {recommendation ? (
              <details className="reasoning-block">
                <summary>Why Ora recommends this</summary>
                <div className="reasoning-block-body">
                  <p>{recommendation.reasoning}</p>
                  {recommendation.expectedImpact ? (
                    <div className="signal-callout">
                      <CheckCircle2 size={16} aria-hidden="true" />
                      <p>{recommendation.expectedImpact}</p>
                    </div>
                  ) : null}
                </div>
              </details>
            ) : null}
          </section>
        </div>

        {showHistory ? (
          <section className="signal-history" aria-label="Signal history">
            <h2 className="section-title">History</h2>
            <div className="signal-history-grid">
              {actionPlan?.approval ? (
                <HistoryCard
                  label="Approval"
                  status="approved"
                  body={`Approved on ${formatDate(actionPlan.approval.approvedAt)}.`}
                  footnote={`Payload hash: ${actionPlan.approval.approvalPayloadHash}`}
                  signalId={signal.id}
                  actionPlanId={actionPlan.id}
                  signalTitle={signal.title}
                />
              ) : null}
              {latestExecution ? (
                <HistoryCard
                  label="Execution"
                  status={latestExecution.status}
                  body={
                    latestExecution.errorMessage ??
                    `Executed ${latestExecution.toolName} on ${formatDate(
                      latestExecution.executedAt,
                    )}.`
                  }
                  signalId={signal.id}
                  actionPlanId={actionPlan?.id}
                  signalTitle={signal.title}
                />
              ) : null}
              {latestOutcome ? (
                <HistoryCard
                  label="Outcome"
                  status={latestOutcome.status}
                  body={latestOutcome.summary}
                  footnote={`Measured ${formatDate(latestOutcome.measuredAt)}`}
                  signalId={signal.id}
                  actionPlanId={actionPlan?.id}
                  signalTitle={signal.title}
                />
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </>
  );
}

function CompactSectionHeader({
  icon,
  label,
  meta,
}: {
  icon: React.ReactNode;
  label: string;
  meta?: string;
}) {
  return (
    <header className="signal-compact-header">
      <span className="signal-compact-header-icon">{icon}</span>
      <h2>{label}</h2>
      {meta ? <span className="signal-compact-header-meta">{meta}</span> : null}
    </header>
  );
}

function EvidenceMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="evidence-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}

function FactCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="signal-fact-cell">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function HistoryCard({
  label,
  status,
  body,
  footnote,
  signalId,
  actionPlanId,
  signalTitle,
}: {
  label: string;
  status: string;
  body: string;
  footnote?: string | null;
  signalId: string;
  actionPlanId?: string;
  signalTitle: string;
}) {
  return (
    <article
      className="signal-history-card"
      data-chat-explain="true"
      data-chat-source="signal-path-panel"
      data-chat-title={label}
      data-chat-description={body}
      data-chat-signal-id={signalId}
      data-chat-action-plan-id={actionPlanId}
      data-chat-object-type="signal_path_step"
      data-chat-prompt={`Explain this ${label} status for the Signal "${signalTitle}": ${status}. ${body}`}
    >
      <ChatOpenButton label={`Open ${label} status in chat`} hint={`${label} status`} />
      <header>
        <p className="kicker">{label}</p>
        <StatusBadge status={status} />
      </header>
      <p>{body}</p>
      {footnote ? <small>{footnote}</small> : null}
    </article>
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

function affectedLabel(value: string) {
  if (value === "store") return "Store-level";
  if (value === "product") return "Products";
  if (value === "customer_segment") return "Customers";
  if (value === "collection") return "Collection";
  return titleCase(value);
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

function formatCustomerSpend(
  totalSpentCents: number | null,
  currency: string | null,
) {
  if (totalSpentCents == null) return "—";

  return new Intl.NumberFormat("en", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: currency ?? "USD",
  }).format(totalSpentCents / 100);
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
