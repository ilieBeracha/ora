import { notFound } from "next/navigation";

import { PageHeader } from "@/components/page-header";
import { RiskBadge, SeverityBadge, StatusBadge } from "@/components/status-badge";
import { canManageApp, requireCurrentUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { getSignalDetail } from "@/lib/signals/queries";
import {
  approveActionPlanAction,
  executeActionPlanAction,
  ignoreSignalAction,
} from "./actions";

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
  const latestExecution = actionPlan?.executions[0];
  const latestOutcome = signal.outcomes[0] ?? actionPlan?.outcomes[0];
  const canManage = canManageApp(user.role);

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

      <div className="two-col">
        <div className="stack">
          <section className="panel panel-pad step-panel">
            <div className="step-number">01</div>
            <div>
              <p className="kicker">What happened</p>
              <div className="mb-3 flex flex-wrap gap-2">
                <SeverityBadge severity={signal.severity} />
                <StatusBadge status={signal.status} />
                <StatusBadge status={signal.category} />
              </div>
              <p className="leading-7">{signal.summary}</p>
            </div>
          </section>

          <section className="panel panel-pad step-panel">
            <div className="step-number">02</div>
            <div>
              <p className="kicker">Why it matters</p>
              <p className="leading-7">
                {recommendation?.expectedImpact ??
                  `Ora ranked this Signal by severity ${signal.severity} and confidence ${Math.round(
                    signal.confidence * 100,
                  )}%.`}
              </p>
            </div>
          </section>

          <section className="panel panel-pad step-panel">
            <div className="step-number">03</div>
            <div>
              <p className="kicker">Evidence</p>
              <div className="stack">
                {signal.evidence.map((evidence) => (
                  <div key={evidence.id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={evidence.provider} />
                      <StatusBadge status={evidence.evidenceType} />
                      <span className="muted text-sm">
                        {formatDate(evidence.observedAt)}
                      </span>
                    </div>
                    <p className="mt-2 leading-6">{evidence.displayText}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="panel panel-pad step-panel">
            <div className="step-number">04</div>
            <div>
              <p className="kicker">Recommended action</p>
              {recommendation ? (
                <>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <RiskBadge risk={recommendation.riskLevel} />
                    <span className="badge">
                      {Math.round(recommendation.confidence * 100)}% confidence
                    </span>
                  </div>
                  <h2 className="section-title">{recommendation.title}</h2>
                  <p className="muted mt-2 leading-6">
                    {recommendation.reasoning}
                  </p>
                  {recommendation.expectedImpact ? (
                    <p className="mt-3 text-sm leading-6">
                      {recommendation.expectedImpact}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="muted">No recommendation exists yet.</p>
              )}
            </div>
          </section>

          <section className="panel panel-pad step-panel">
            <div className="step-number">05</div>
            <div>
              <p className="kicker">Action plan</p>
              {actionPlan ? (
                <>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <StatusBadge status={actionPlan.status} />
                    <StatusBadge status={actionPlan.provider} />
                  </div>
                  <h2 className="section-title">
                    {actionPlan.actionType.replaceAll("_", " ")}
                  </h2>
                  <pre className="mt-4 overflow-auto border border-[var(--line)] bg-[var(--panel-subtle)] p-4 text-xs leading-5">
                    {JSON.stringify(actionPlan.previewPayload, null, 2)}
                  </pre>
                </>
              ) : (
                <p className="muted">
                  This Signal is informational until Ora can prepare an exact
                  action.
                </p>
              )}
            </div>
          </section>

          <section className="panel panel-pad step-panel">
            <div className="step-number">06</div>
            <div>
              <p className="kicker">Approval</p>
              {actionPlan ? (
                actionPlan.approval ? (
                  <div>
                    <StatusBadge status="approved" />
                    <p className="mt-3 text-sm leading-6">
                      Approved on {formatDate(actionPlan.approval.approvedAt)}.
                    </p>
                    <p className="muted mt-2 break-all text-xs">
                      Payload hash: {actionPlan.approval.approvalPayloadHash}
                    </p>
                  </div>
                ) : canManage ? (
                  <form action={approveActionPlanAction} className="stack">
                    <input type="hidden" name="actionPlanId" value={actionPlan.id} />
                    <input
                      type="hidden"
                      name="approvalText"
                      value="Approved in Ora Signal detail UI."
                    />
                    <p className="text-sm leading-6">
                      Approval locks the exact execution payload. If it changes,
                      Ora will require a new approval.
                    </p>
                    <button className="button button-primary" type="submit">
                      Approve exact action
                    </button>
                  </form>
                ) : (
                  <p className="muted">Only owners and admins can approve actions.</p>
                )
              ) : (
                <p className="muted">No action plan is available for approval.</p>
              )}
            </div>
          </section>

          <section className="panel panel-pad step-panel">
            <div className="step-number">07</div>
            <div>
              <p className="kicker">Execution result</p>
              {actionPlan?.approval && actionPlan.status !== "executed" && canManage ? (
                <form action={executeActionPlanAction}>
                  <input type="hidden" name="actionPlanId" value={actionPlan.id} />
                  <button className="button button-primary" type="submit">
                    Execute approved action
                  </button>
                </form>
              ) : null}

              {latestExecution ? (
                <div className="mt-4">
                  <StatusBadge status={latestExecution.status} />
                  <p className="mt-3 text-sm leading-6">
                    {latestExecution.errorMessage ??
                      `Executed ${latestExecution.toolName} on ${formatDate(
                        latestExecution.executedAt,
                      )}.`}
                  </p>
                </div>
              ) : (
                <p className="muted mt-3">No execution has run yet.</p>
              )}
            </div>
          </section>

          <section className="panel panel-pad step-panel">
            <div className="step-number">08</div>
            <div>
              <p className="kicker">Outcome tracking</p>
              {latestOutcome ? (
                <div>
                  <StatusBadge status={latestOutcome.status} />
                  <p className="mt-3 leading-6">{latestOutcome.summary}</p>
                  <p className="muted mt-2 text-sm">
                    Measured {formatDate(latestOutcome.measuredAt)}
                  </p>
                </div>
              ) : (
                <p className="muted">
                  Outcome tracking starts after an approved action executes.
                </p>
              )}
            </div>
          </section>
        </div>

        <aside className="panel panel-pad self-start">
          <h2 className="section-title">Signal facts</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div>
              <dt className="muted">Type</dt>
              <dd className="m-0">{signal.type}</dd>
            </div>
            <div>
              <dt className="muted">Affected object</dt>
              <dd className="m-0">{signal.affectedObjectType}</dd>
            </div>
            <div>
              <dt className="muted">Detected</dt>
              <dd className="m-0">{formatDate(signal.detectedAt)}</dd>
            </div>
            <div>
              <dt className="muted">Updated</dt>
              <dd className="m-0">{formatDate(signal.updatedAt)}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </>
  );
}
