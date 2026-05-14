import Link from "next/link";

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
        title="Execution history"
        description="Approved actions, executions, verification status, and outcomes live here."
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

            return (
              <article
                className="panel panel-pad signal-card task-card signal-row"
                key={action.id}
              >
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
                  </div>

                  <Link className="button" href={`/signals/${action.signalId}`}>
                    Open Signal
                  </Link>
                </div>

                <div className="task-details">
                  <div className="task-detail">
                    <p className="kicker">Approval</p>
                    {action.approval ? (
                      <p className="text-sm leading-6">
                        {action.approval.approvedBy.email} ·{" "}
                        {formatDate(action.approval.approvedAt)}
                      </p>
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
