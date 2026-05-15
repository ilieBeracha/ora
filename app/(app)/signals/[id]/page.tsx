import {
  Activity,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FileCheck2,
  Gauge,
  Lightbulb,
  Play,
  ShieldCheck,
  Target,
  UsersRound,
} from "lucide-react";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { ChatOpenButton } from "@/components/chat-open-button";
import { PageHeader } from "@/components/page-header";
import { RiskBadge, SeverityBadge, StatusBadge } from "@/components/status-badge";
import { canManageApp, requireCurrentUser } from "@/lib/auth/session";
import { formatDate, formatMoneyFromCents, titleCase } from "@/lib/format";
import { getSignalDetail } from "@/lib/signals/queries";
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
  const lifecycle = [
    {
      label: "Signal",
      detail: "Detected",
      icon: Target,
      state: "complete" as LifecycleState,
    },
    {
      label: "Evidence",
      detail: `${signal.evidence.length} record${
        signal.evidence.length === 1 ? "" : "s"
      }`,
      icon: Database,
      state: signal.evidence.length ? "complete" : "waiting",
    },
    {
      label: "Recommendation",
      detail: recommendation ? "Ready" : "Missing",
      icon: Lightbulb,
      state: recommendation ? "complete" : "waiting",
    },
    {
      label: "Action plan",
      detail: actionPlan ? titleCase(actionPlan.status) : "Not prepared",
      icon: ClipboardCheck,
      state: actionPlan ? "current" : "waiting",
    },
    {
      label: "Approval",
      detail: actionPlan?.approval
        ? "Approved"
        : canApprovePlan
          ? "Required"
          : actionPlan
            ? "Review first"
            : "Required",
      icon: ShieldCheck,
      state: actionPlan?.approval
        ? "complete"
        : canApprovePlan
          ? "current"
          : "waiting",
    },
    {
      label: "Execution",
      detail: latestExecution ? titleCase(latestExecution.status) : "Not run",
      icon: Play,
      state: latestExecution ? "complete" : actionPlan?.approval ? "current" : "waiting",
    },
    {
      label: "Outcome",
      detail: latestOutcome ? titleCase(latestOutcome.status) : "Not measured",
      icon: Activity,
      state: latestOutcome ? "complete" : latestExecution ? "current" : "waiting",
    },
  ];

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
          className="signal-hero-panel"
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
          <div className="signal-hero-main">
            <div className="signal-hero-badges">
              <SeverityBadge severity={signal.severity} />
              <StatusBadge status={signal.status} />
              <StatusBadge status={signal.category} />
            </div>
            <h2>{signal.summary}</h2>
            <p>
              Ora is treating this as a {titleCase(signal.category)} Signal
              with {confidencePercent}% confidence. Review the evidence, then
              move only one exact action through approval.
            </p>
          </div>

          <div className="signal-score-grid">
            <MetricTile
              label="Affected"
              value={affectedCount ? String(affectedCount) : "Unknown"}
              hint={affectedLabel(signal.affectedObjectType)}
            />
            <MetricTile
              label="Confidence"
              value={`${confidencePercent}%`}
              hint="Signal ranking"
              meter={confidencePercent}
            />
            <MetricTile
              label="Impact"
              value={formatMoneyFromCents(signal.impactEstimateCents)}
              hint="Estimate"
            />
            <MetricTile
              label="Detected"
              value={formatDate(signal.detectedAt)}
              hint="Last scan"
            />
          </div>
        </section>

        <section className="signal-lifecycle" aria-label="Signal lifecycle">
          {lifecycle.map((item) => {
            const Icon = item.icon;
            return (
              <div
                className={`signal-lifecycle-item signal-lifecycle-${item.state}`}
                data-chat-explain="true"
                data-chat-source="signal-lifecycle"
                data-chat-title={item.label}
                data-chat-description={item.detail}
                data-chat-signal-id={signal.id}
                data-chat-action-plan-id={actionPlan?.id}
                data-chat-object-type="signal_lifecycle_step"
                data-chat-object-id={`${signal.id}:${item.label
                  .toLowerCase()
                  .replaceAll(" ", "_")}`}
                data-chat-prompt={`Explain the ${item.label} step for this Signal: ${signal.title}. Current state: ${item.detail}.`}
                key={item.label}
              >
                <ChatOpenButton
                  label={`Open ${item.label} step in chat`}
                  hint={`${item.label} step`}
                />
                <span className="signal-lifecycle-icon">
                  <Icon size={16} aria-hidden="true" />
                </span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
              </div>
            );
          })}
        </section>

        <div className="signal-detail-grid">
          <div className="signal-detail-main">
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
              <SectionHeader
                icon={<Target size={18} aria-hidden="true" />}
                label="What happened"
                title={signal.title}
              />
              <p className="signal-section-copy">{signal.summary}</p>
              <div className="signal-mini-grid">
                <FactMini label="Type" value={titleCase(signal.type)} />
                <FactMini
                  label="Affected object"
                  value={titleCase(signal.affectedObjectType)}
                />
                <FactMini label="Updated" value={formatDate(signal.updatedAt)} />
                <FactMini
                  label={customerGroup ? "Customer group" : "Active catalog size"}
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
              <SectionHeader
                icon={<Database size={18} aria-hidden="true" />}
                label="Evidence"
                title="Observed facts behind the Signal"
              />
              <div className="evidence-overview-grid">
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
                  hint={`${signal.evidence.length} evidence record${
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

              <div className="evidence-fact-board">
                <div className="evidence-fact-board-head">
                  <h3>Key facts</h3>
                  <span>Grouped to remove repeated records</span>
                </div>
                <div className="evidence-fact-list">
                  {evidenceFacts.map((fact) => (
                    <article className="evidence-fact-card" key={fact.key}>
                      <div className="evidence-fact-count">
                        {String(fact.count).padStart(2, "0")}
                      </div>
                      <div>
                        <div className="evidence-fact-top">
                          <h4>{fact.title}</h4>
                          <div className="evidence-fact-badges">
                            {fact.providers.map((provider) => (
                              <StatusBadge key={provider} status={provider} />
                            ))}
                            <span>{formatDate(fact.observedAt)}</span>
                          </div>
                        </div>
                        <p>{fact.summary}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              {evidenceExamples.length ? (
                <div className="signal-examples">
                  <div className="signal-examples-header">
                    <h3>Example products</h3>
                    <span>{evidenceExamples.length} shown from evidence</span>
                  </div>
                  <div className="signal-example-list evidence-example-grid">
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
                            <span>{example.productType ?? "No product type"}</span>
                            <span>
                              {example.totalInventory == null
                                ? "Inventory unknown"
                                : `${example.totalInventory} units`}
                            </span>
                            <span>
                              {example.tags == null
                                ? "Tags unknown"
                                : `${example.tags} tag${example.tags === 1 ? "" : "s"}`}
                            </span>
                            <span>
                              {example.descriptionLength == null
                                ? "Copy unknown"
                                : `${example.descriptionLength} copy chars`}
                            </span>
                            <span>
                              {example.hasImage == null
                                ? "Image unknown"
                                : example.hasImage
                                  ? "Image present"
                                  : "No image"}
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
                className="signal-section-card customer-group-card"
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
                <SectionHeader
                  icon={<UsersRound size={18} aria-hidden="true" />}
                  label="Customer group"
                  title={customerGroup.name}
                />
                <p className="signal-section-copy">{customerGroup.description}</p>
                <div className="signal-mini-grid customer-group-metrics">
                  <FactMini
                    label="Members"
                    value={String(customerGroup.memberCount)}
                  />
                  <FactMini
                    label="Estimated value"
                    value={formatMoneyFromCents(customerGroup.estimatedRevenueCents)}
                  />
                  <FactMini
                    label="Status"
                    value={titleCase(customerGroup.status)}
                  />
                  <FactMini
                    label="Built"
                    value={formatDate(customerGroup.builtAt)}
                  />
                </div>
                {customerMembers.length ? (
                  <div className="signal-examples">
                    <div className="signal-examples-header">
                      <h3>Member sample</h3>
                      <span>{customerMembers.length} shown from group snapshot</span>
                    </div>
                    <div className="signal-example-list">
                      {customerMembers.slice(0, 8).map((member, index) => (
                        <article
                          className="signal-example-row customer-member-row"
                          key={`${member.shopifyCustomerId}-${index}`}
                        >
                          <div className="signal-example-number">
                            {String(index + 1).padStart(2, "0")}
                          </div>
                          <div>
                            <h4>{member.name ?? member.email ?? "Shopify customer"}</h4>
                            <div className="signal-example-meta">
                              <span>{titleCase(member.lifecycleStage)}</span>
                              <span>
                                {member.orderCount == null
                                  ? "Orders unknown"
                                  : `${member.orderCount} orders`}
                              </span>
                              <span>
                                {formatCustomerSpend(
                                  member.totalSpentCents,
                                  member.currency,
                                )}
                              </span>
                              <span>
                                {member.lastOrderAt
                                  ? `Last order ${formatDate(member.lastOrderAt)}`
                                  : "No last order date"}
                              </span>
                            </div>
                            {member.lifecycleTags.length ? (
                              <div className="signal-reason-row">
                                {member.lifecycleTags.map((tag) => (
                                  <span className="badge" key={tag}>
                                    {titleCase(tag)}
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
            ) : null}

            <div className="signal-work-grid">
              <section
                className="signal-section-card"
                data-chat-explain="true"
                data-chat-source="signal-section"
                data-chat-title="Recommended action"
                data-chat-description={
                  recommendation?.reasoning ??
                  "No recommendation is available for this Signal yet."
                }
                data-chat-signal-id={signal.id}
                data-chat-action-plan-id={actionPlan?.id}
                data-chat-object-type="recommendation"
                data-chat-object-id={recommendation?.id ?? signal.id}
                data-chat-prompt={`Explain the recommended action for this Signal: ${signal.title}.`}
              >
                <SectionHeader
                  icon={<Lightbulb size={18} aria-hidden="true" />}
                  label="Recommended action"
                  title={recommendation?.title ?? "No recommendation yet"}
                />
                {recommendation ? (
                  <>
                    <div className="signal-inline-badges">
                      <RiskBadge risk={recommendation.riskLevel} />
                      <span className="badge">
                        {Math.round(recommendation.confidence * 100)}% confidence
                      </span>
                    </div>
                    <p className="signal-section-copy">
                      {recommendation.reasoning}
                    </p>
                    {recommendation.expectedImpact ? (
                      <div className="signal-callout">
                        <CheckCircle2 size={16} aria-hidden="true" />
                        <p>{recommendation.expectedImpact}</p>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="muted">Ora has not prepared a recommendation.</p>
                )}
              </section>

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
                <SectionHeader
                  icon={<FileCheck2 size={18} aria-hidden="true" />}
                  label="Action plan"
                  title={
                    actionPlan
                      ? titleCase(actionPlan.actionType)
                      : "No exact action prepared"
                  }
                />
                {actionPlan ? (
                  <>
                    <div className="signal-inline-badges">
                      <StatusBadge status={actionPlan.status} />
                      <StatusBadge status={actionPlan.provider} />
                    </div>
                    <ActionPlanProgress
                      actionPlan={actionPlan}
                      canExecutePlan={canExecutePlan}
                      latestExecution={latestExecution}
                    />
                    <ActionPlanPlainSummary actionPlan={actionPlan} />
                    <div className="signal-plan-preview">
                      <FactMini label="Created" value={formatDate(actionPlan.createdAt)} />
                      <FactMini label="Updated" value={formatDate(actionPlan.updatedAt)} />
                    </div>
                    <details className="payload-details">
                      <summary>Technical payload</summary>
                      <pre>{JSON.stringify(actionPlan.previewPayload, null, 2)}</pre>
                    </details>
                  </>
                ) : (
                  <p className="muted">
                    This Signal is informational until Ora can prepare an exact
                    action.
                  </p>
                )}
              </section>
            </div>

            <section
              className="signal-section-card"
              data-chat-explain="true"
              data-chat-source="signal-section"
              data-chat-title="Approval, execution, outcome"
              data-chat-description="The strict mutation path for this Signal."
              data-chat-signal-id={signal.id}
              data-chat-action-plan-id={actionPlan?.id}
              data-chat-object-type="signal_mutation_path"
              data-chat-object-id={actionPlan?.id ?? signal.id}
              data-chat-prompt={`Explain the approval, execution, and outcome status for this Signal: ${signal.title}.`}
            >
              <SectionHeader
                icon={<ShieldCheck size={18} aria-hidden="true" />}
                label="Approval, execution, outcome"
                title="Strict mutation path"
              />
              <div className="signal-path-grid">
                <PathPanel
                  label="Approval"
                  status={
                    actionPlan?.approval
                      ? "approved"
                      : canApprovePlan
                        ? "required"
                        : actionPlan
                          ? "review draft"
                          : "not ready"
                  }
                  body={
                    actionPlan?.approval
                      ? `Approved on ${formatDate(actionPlan.approval.approvedAt)}.`
                      : canApprovePlan
                        ? "Approval locks the exact execution payload before any connected system can be changed."
                        : actionPlan
                          ? "Ora prepared a deterministic review batch. Choose the exact operator action before approval or execution."
                          : "Approval starts after Ora prepares an exact action plan."
                  }
                  footnote={
                    actionPlan?.approval
                      ? `Payload hash: ${actionPlan.approval.approvalPayloadHash}`
                      : null
                  }
                />
                <PathPanel
                  label="Execution"
                  status={latestExecution?.status ?? "not run"}
                  body={
                    latestExecution
                      ? latestExecution.errorMessage ??
                        `Executed ${latestExecution.toolName} on ${formatDate(
                          latestExecution.executedAt,
                        )}.`
                      : actionPlan && !canExecutePlan
                        ? "This grouped action is approval-ready, but live execution for this provider is not enabled yet."
                      : "Execution waits until approval exists and the payload still matches."
                  }
                />
                <PathPanel
                  label="Outcome"
                  status={latestOutcome?.status ?? "pending"}
                  body={
                    latestOutcome
                      ? latestOutcome.summary
                      : "Outcome tracking starts after the approved action is verified."
                  }
                  footnote={
                    latestOutcome
                      ? `Measured ${formatDate(latestOutcome.measuredAt)}`
                      : null
                  }
                />
              </div>
            </section>
          </div>

          <aside className="signal-side-panel">
            <section
              className="signal-next-action"
              data-chat-explain="true"
              data-chat-source="signal-next-action"
              data-chat-title="Next action"
              data-chat-description={nextActionTitle(
                Boolean(actionPlan),
                Boolean(actionPlan?.approval),
                Boolean(latestExecution),
                canExecutePlan,
                canApprovePlan,
              )}
              data-chat-signal-id={signal.id}
              data-chat-action-plan-id={actionPlan?.id}
              data-chat-object-type="next_action"
              data-chat-object-id={actionPlan?.id ?? signal.id}
              data-chat-prompt={`Explain the next action for this Signal: ${signal.title}.`}
            >
                <ChatOpenButton label="Open next action in chat" hint="Next action" />
              <div className="signal-next-icon">
                <Gauge size={18} aria-hidden="true" />
              </div>
              <div>
                <p className="kicker">Next action</p>
                <h2>
                  {nextActionTitle(
                    Boolean(actionPlan),
                    Boolean(actionPlan?.approval),
                    Boolean(latestExecution),
                    canExecutePlan,
                    canApprovePlan,
                  )}
                </h2>
                <p>
                  {nextActionBody(
                    Boolean(actionPlan),
                    Boolean(actionPlan?.approval),
                    Boolean(latestExecution),
                    canExecutePlan,
                    canApprovePlan,
                  )}
                </p>
              </div>

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
            </section>

            <section
              className="signal-facts-panel"
              data-chat-explain="true"
              data-chat-source="signal-facts"
              data-chat-title="Signal facts"
              data-chat-description={`Type ${titleCase(signal.type)}, severity ${titleCase(
                signal.severity,
              )}, status ${titleCase(signal.status)}.`}
              data-chat-signal-id={signal.id}
              data-chat-action-plan-id={actionPlan?.id}
              data-chat-object-type="signal_facts"
              data-chat-object-id={signal.id}
              data-chat-prompt={`Explain the facts and metadata for this Signal: ${signal.title}.`}
            >
              <ChatOpenButton label="Open Signal facts in chat" hint="Signal facts" />
              <h2 className="section-title">Signal facts</h2>
              <dl>
                <FactRow label="Type" value={titleCase(signal.type)} />
                <FactRow label="Severity" value={titleCase(signal.severity)} />
                <FactRow label="Status" value={titleCase(signal.status)} />
                <FactRow label="Category" value={titleCase(signal.category)} />
                <FactRow
                  label="Affected"
                  value={titleCase(signal.affectedObjectType)}
                />
                <FactRow label="Detected" value={formatDate(signal.detectedAt)} />
                <FactRow label="Updated" value={formatDate(signal.updatedAt)} />
              </dl>
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}

function MetricTile({
  label,
  value,
  hint,
  meter,
}: {
  label: string;
  value: string;
  hint: string;
  meter?: number;
}) {
  return (
    <div className="signal-score-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
      {typeof meter === "number" ? (
        <div className="signal-meter" aria-hidden="true">
          <span style={{ width: `${Math.max(0, Math.min(100, meter))}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function SectionHeader({
  icon,
  label,
  title,
}: {
  icon: ReactNode;
  label: string;
  title: string;
}) {
  return (
    <header className="signal-section-header">
      <span className="signal-section-icon">{icon}</span>
      <div>
        <p className="kicker">{label}</p>
        <h2>{title}</h2>
      </div>
      <ChatOpenButton label={`Open ${label} in chat`} hint={label} />
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

function ActionPlanProgress({
  actionPlan,
  canExecutePlan,
  latestExecution,
}: {
  actionPlan: SignalDetail["actionPlans"][number];
  canExecutePlan: boolean;
  latestExecution:
    | SignalDetail["actionPlans"][number]["executions"][number]
    | undefined;
}) {
  const steps = [
    {
      label: "Review",
      detail: "Plan is prepared",
      state: "complete" as LifecycleState,
    },
    {
      label: "Approve",
      detail: actionPlan.approval ? "Payload locked" : "Needs approval",
      state: actionPlan.approval ? "complete" : "current" as LifecycleState,
    },
    {
      label: "Execute",
      detail: latestExecution
        ? titleCase(latestExecution.status)
        : canExecutePlan
          ? "Ready after approval"
          : "Not wired",
      state: latestExecution
        ? "complete"
        : actionPlan.approval && canExecutePlan
          ? "current"
          : "waiting" as LifecycleState,
    },
  ];

  return (
    <div className="signal-plan-progress" aria-label="Action plan progress">
      {steps.map((step) => (
        <div
          className={`signal-plan-progress-step signal-plan-progress-${step.state}`}
          key={step.label}
        >
          <span>{step.label}</span>
          <strong>{step.detail}</strong>
        </div>
      ))}
    </div>
  );
}

function ActionPlanPlainSummary({
  actionPlan,
}: {
  actionPlan: SignalDetail["actionPlans"][number];
}) {
  const preview = asRecord(actionPlan.previewPayload);
  const requiredReview = stringArray(preview?.requiredReview).slice(0, 3);
  const operatorDecision = nullableString(preview?.operatorDecision);
  const affectedCount = numberValue(preview?.affectedCount);
  const isOraReview = actionPlan.provider === "ora";

  return (
    <div className="signal-plan-readable">
      <div className="signal-plan-readable-main">
        <p className="kicker">Plain meaning</p>
        <h3>
          {isOraReview
            ? "Starts a focused operator review batch"
            : "Runs one approved connector action"}
        </h3>
        <p>
          {isOraReview
            ? "This execution records the review batch in Ora. It does not change Shopify automatically."
            : "Execution runs only after approval locks the exact payload."}
        </p>
      </div>
      <div className="signal-plan-readable-facts">
        <FactMini
          label="Affected"
          value={affectedCount == null ? "Unknown" : String(affectedCount)}
        />
        <FactMini
          label="Run mode"
          value={isOraReview ? "Ora review" : titleCase(actionPlan.provider)}
        />
      </div>
      {operatorDecision || requiredReview.length ? (
        <div className="signal-plan-checklist">
          {operatorDecision ? (
            <div>
              <strong>Decision needed</strong>
              <p>{operatorDecision}</p>
            </div>
          ) : null}
          {requiredReview.length ? (
            <ul>
              {requiredReview.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PathPanel({
  label,
  status,
  body,
  footnote,
}: {
  label: string;
  status: string;
  body: string;
  footnote?: string | null;
}) {
  return (
    <article
      className="signal-path-panel"
      data-chat-explain="true"
      data-chat-source="signal-path-panel"
      data-chat-title={label}
      data-chat-description={body}
      data-chat-object-type="signal_path_step"
      data-chat-prompt={`Explain this ${label} status: ${status}. ${body}`}
    >
      <ChatOpenButton label={`Open ${label} status in chat`} hint={`${label} status`} />
      <div>
        <p className="kicker">{label}</p>
        <StatusBadge status={status} />
      </div>
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

function affectedLabel(value: string) {
  if (value === "store") return "Store-level";
  if (value === "product") return "Products";
  if (value === "customer_segment") return "Customer segment";
  if (value === "collection") return "Collection";
  return titleCase(value);
}

function nextActionTitle(
  hasActionPlan: boolean,
  hasApproval: boolean,
  hasExecution: boolean,
  canExecutePlan: boolean,
  canApprovePlan: boolean,
) {
  if (!hasActionPlan) return "Review evidence";
  if (!hasApproval && !canApprovePlan) return "Review prepared plan";
  if (!hasApproval) return "Approve plan";
  if (!canExecutePlan) return "Ready for operator review";
  if (!hasExecution) return "Run approved plan";
  return "Track outcome";
}

function nextActionBody(
  hasActionPlan: boolean,
  hasApproval: boolean,
  hasExecution: boolean,
  canExecutePlan: boolean,
  canApprovePlan: boolean,
) {
  if (!hasActionPlan) {
    return "This Signal does not have an executable plan yet, so the useful step is evidence review.";
  }

  if (!hasApproval && !canApprovePlan) {
    return "Ora prepared a review batch, but it still needs a final operator choice before approval.";
  }

  if (!hasApproval) {
    return "Approve only after the plan matches the exact review or connector action you want.";
  }

  if (!canExecutePlan) {
    return "This plan is approved, but execution for this provider is not wired yet.";
  }

  if (!hasExecution) {
    return "Ora will validate the approved payload hash before running the plan.";
  }

  return "Watch whether the Signal improves, resolves, or needs a different action.";
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
  if (totalSpentCents == null) return "Spend unknown";

  const amount = new Intl.NumberFormat("en", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: currency ?? "USD",
  }).format(totalSpentCents / 100);

  return `${amount} lifetime spend`;
}

function isExecutableActionPlan(
  actionPlan: { provider: string; executionPayload: unknown } | null | undefined,
) {
  const payload = asRecord(actionPlan?.executionPayload);

  if (
    actionPlan?.provider === "ora" &&
    payload?.toolName === "ora_prepare_operator_review_batch"
  ) {
    return true;
  }

  return (
    actionPlan?.provider === "shopify" &&
    payload?.toolName === "shopify_setProductReferenceMetafield"
  );
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

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : [];
}
