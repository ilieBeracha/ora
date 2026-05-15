import Link from "next/link";

import { ChatOpenButton } from "@/components/chat-open-button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requireCurrentUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { listActionHistory } from "@/lib/signals/queries";

export default async function ActionsPage() {
  const user = await requireCurrentUser();
  const actions = user.companyId ? await listActionHistory(user.companyId) : [];

  return (
    <>
      <PageHeader
        eyebrow="Actions"
        title="Action plans"
        description="Prepared plans, approvals, execution status, and outcomes live here."
        marker="04"
      />

      {actions.length === 0 ? (
        <EmptyState
          title="No actions yet"
          note="04"
          body="Actions appear after Ora creates an ActionPlan from a Signal."
        />
      ) : (
        <div className="signal-list">
          {actions.map((action) => {
            const latestExecution = action.executions[0];
            const latestOutcome = action.outcomes[0];
            const needsApproval =
              !action.approval &&
              (action.status === "draft" ||
                action.status === "approval_required");
            const canRun = Boolean(
              action.approval && !latestExecution && isExecutableActionPlan(action),
            );
            const nextStep = actionNextStep(action, latestExecution);

            return (
              <article
                className="panel panel-pad signal-card task-card signal-row"
                data-chat-explain="true"
                data-chat-source="action-card"
                data-chat-title={action.signal.title}
                data-chat-description={action.actionType.replaceAll("_", " ")}
                data-chat-signal-id={action.signalId}
                data-chat-action-plan-id={action.id}
                data-chat-object-type="action_plan"
                data-chat-object-id={action.id}
                data-chat-prompt={`Explain this action history item for "${action.signal.title}" and what its approval, execution, and outcome mean.`}
                key={action.id}
              >
                <ChatOpenButton
                  label={`Open ${action.signal.title} action in chat`}
                  hint="Plan status"
                />
                <div className="task-primary">
                  <div className="task-copy">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <StatusBadge status={action.status} />
                      {latestExecution ? (
                        <StatusBadge status={latestExecution.status} />
                      ) : null}
                      {latestOutcome ? (
                        <StatusBadge status={latestOutcome.status} />
                      ) : null}
                    </div>
                    <h2 className="section-title">{action.signal.title}</h2>
                    <p className="muted mt-2 text-sm">
                      {action.actionType.replaceAll("_", " ")} · Created{" "}
                      {formatDate(action.createdAt)}
                    </p>
                    <div className="action-card-next">
                      <strong>{nextStep.title}</strong>
                      <span>{nextStep.body}</span>
                    </div>
                  </div>

                  <Link
                    className={`button ${
                      needsApproval || canRun ? "button-primary" : ""
                    }`}
                    href={`/signals/${action.signalId}`}
                  >
                    {needsApproval
                      ? "Review and approve"
                      : canRun
                        ? "Run approved plan"
                        : "Open plan"}
                  </Link>
                </div>

                <div className="action-plan-flow" aria-label="Action plan flow">
                  <ActionStep
                    label="Review"
                    state="complete"
                    value="Prepared"
                  />
                  <ActionStep
                    label="Approve"
                    state={action.approval ? "complete" : "current"}
                    value={action.approval ? "Approved" : "Needed"}
                  />
                  <ActionStep
                    label="Execute"
                    state={
                      latestExecution
                        ? "complete"
                        : canRun
                          ? "current"
                          : "waiting"
                    }
                    value={
                      latestExecution
                        ? latestExecution.status
                        : canRun
                          ? "Ready"
                          : "Waiting"
                    }
                  />
                </div>

                <div className="task-details">
                  <div className="task-detail">
                    <p className="kicker">Approval</p>
                    {action.approval ? (
                      <p className="text-sm leading-6">
                        {action.approval.approvedBy.email} ·{" "}
                        {formatDate(action.approval.approvedAt)}
                      </p>
                    ) : action.status === "draft" ? (
                      <p className="muted text-sm">Review plan details.</p>
                    ) : (
                      <p className="muted text-sm">Awaiting approval.</p>
                    )}
                  </div>
                  <div className="task-detail">
                    <p className="kicker">Execution</p>
                    <p className="text-sm leading-6">
                      {latestExecution?.errorMessage ??
                        latestExecution?.status ??
                        "No execution yet."}
                    </p>
                  </div>
                  <div className="task-detail">
                    <p className="kicker">Outcome</p>
                    <p className="text-sm leading-6">
                      {latestOutcome?.summary ?? "Outcome not measured yet."}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

function ActionStep({
  label,
  state,
  value,
}: {
  label: string;
  state: "complete" | "current" | "waiting";
  value: string;
}) {
  return (
    <div className={`action-plan-step action-plan-step-${state}`}>
      <span>{label}</span>
      <strong>{value.replaceAll("_", " ")}</strong>
    </div>
  );
}

function actionNextStep(
  action: Awaited<ReturnType<typeof listActionHistory>>[number],
  latestExecution: Awaited<
    ReturnType<typeof listActionHistory>
  >[number]["executions"][number] | undefined,
) {
  if (!action.approval) {
    return {
      title: "Next: approve the plan",
      body: "Open the Signal, review the exact plan, then approve it.",
    };
  }

  if (!latestExecution && isExecutableActionPlan(action)) {
    return {
      title: "Next: run the approved plan",
      body:
        action.provider === "ora"
          ? "Starts the operator review batch in Ora."
          : "Runs the approved connector action.",
    };
  }

  if (!latestExecution) {
    return {
      title: "Execution not wired",
      body: "The plan is approved, but this provider has no executor yet.",
    };
  }

  return {
    title: "Next: watch outcome",
    body: "Execution has run; outcome tracking is the remaining step.",
  };
}

function isExecutableActionPlan(action: {
  provider: string;
  executionPayload: unknown;
}) {
  const payload = asRecord(action.executionPayload);

  return (
    (action.provider === "ora" &&
      payload?.toolName === "ora_prepare_operator_review_batch") ||
    (action.provider === "shopify" &&
      payload?.toolName === "shopify_setProductReferenceMetafield")
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
