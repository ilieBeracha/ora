import Link from "next/link";

import { ChatOpenButton } from "@/components/chat-open-button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requireCurrentUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import {
  getActionQueueItem,
  summarizeActionQueue,
} from "@/lib/signals/flow";
import { buildActionOwnerSummary } from "@/lib/signals/owner-summary";
import { listActionHistory } from "@/lib/signals/queries";

export default async function ActionsPage() {
  const user = await requireCurrentUser();
  const actions = user.companyId ? await listActionHistory(user.companyId) : [];
  const queueItems = actions.map((action) =>
    getActionQueueItem(
      action,
      action.executions[0] ?? null,
      action.outcomes[0] ?? null,
    ),
  );
  const queueSummary = summarizeActionQueue(queueItems);
  const highestPriority = queueItems
    .map((item, index) => ({ item, action: actions[index] }))
    .sort((a, b) => a.item.priority - b.item.priority)[0];
  const actionRows = actions.map((action, index) => ({
    action,
    queueItem: queueItems[index],
    summary: buildActionOwnerSummary(action),
  }));

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
        <>
          <section
            className="action-command-center"
            data-chat-explain="true"
            data-chat-source="action-summary"
            data-chat-title="Action queue"
            data-chat-description={`${queueSummary.needsApproval} need approval, ${queueSummary.readyToRun} ready to run, ${queueSummary.watching} need store changes before another scan, ${queueSummary.outcomePending} waiting on outcome scan, ${queueSummary.blocked} blocked.`}
            data-chat-prompt="Summarize the action queue. Start with what needs approval, what is ready to run, what needs store changes before another scan, and what outcome scan matters."
          >
            <ChatOpenButton
              label="Open action queue in chat"
              hint="Action queue"
            />
            <div className="action-command-copy">
              <p className="kicker">Operating queue</p>
              <h2>
                {highestPriority
                  ? highestPriority.item.title
                  : "No action needs review"}
              </h2>
              <p>
                {highestPriority
                  ? `${highestPriority.action.signal.title}: ${highestPriority.item.body}`
                  : "Every ActionPlan currently has a measured outcome."}
              </p>
            </div>
            <div className="action-lane-grid" aria-label="Action queue lanes">
              <ActionLane
                label="Needs approval"
                value={queueSummary.needsApproval}
                detail="Review exact payloads"
                tone="attention"
              />
              <ActionLane
                label="Ready to run"
                value={queueSummary.readyToRun}
                detail="Approved and executable"
                tone="ready"
              />
              <ActionLane
                label="Store change"
                value={queueSummary.watching}
                detail="Fix data, then scan"
                tone="watching"
              />
              <ActionLane
                label="Blocked"
                value={queueSummary.blocked}
                detail="Needs operator review"
                tone="blocked"
              />
              <ActionLane
                label="Outcome pending"
                value={queueSummary.outcomePending}
                detail="Run happened; proof remains"
                tone="watching"
              />
            </div>
          </section>

          <div className="signal-list action-queue-list">
            {actionRows.map(({ action, queueItem, summary }) => {
              const canRun = queueItem.lane === "ready_to_run";
              const needsApproval = queueItem.lane === "needs_approval";
              const needsStoreChange =
                queueItem.title === "Change store, then scan";

              return (
                <article
                  className={`panel panel-pad signal-card task-card signal-row action-row action-row-${queueItem.lane}`}
                  data-chat-explain="true"
                  data-chat-source="action-card"
                  data-chat-title={action.signal.title}
                  data-chat-description={`${queueItem.label}: ${queueItem.body}. Affected: ${summary.affected.label}. Recorded: ${summary.recordedChange.title}.`}
                  data-chat-signal-id={action.signalId}
                  data-chat-action-plan-id={action.id}
                  data-chat-object-type="action_plan"
                  data-chat-object-id={action.id}
                  data-chat-prompt={`Explain this action item for "${action.signal.title}". Start with the action log, what was affected, what has already changed or been recorded, and what remains.`}
                  key={action.id}
                >
                  <ChatOpenButton
                    label={`Open ${action.signal.title} action in chat`}
                    hint="Plan status"
                  />
                  <div className="task-primary">
                    <div className="task-copy">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span
                          className={`flow-badge flow-badge-${laneState(
                            queueItem.lane,
                          )}`}
                        >
                          {queueItem.label}
                        </span>
                        <StatusBadge status={action.status} />
                        <span
                          className={`flow-badge flow-badge-${summary.tone}`}
                        >
                          {summary.affected.label}
                        </span>
                      </div>
                      <h2 className="section-title">{action.signal.title}</h2>
                      <p className="muted mt-2 text-sm">
                        {action.actionType.replaceAll("_", " ")} · Created{" "}
                        {formatDate(action.createdAt)}
                      </p>
                      <div className="action-card-next">
                        <strong>{summary.remainingWork.title}</strong>
                        <span>{summary.remainingWork.body}</span>
                      </div>
                    </div>

                    <Link
                      className={`button ${
                        needsApproval || canRun || needsStoreChange
                          ? "button-primary"
                          : ""
                      }`}
                      href={`/signals/${action.signalId}`}
                    >
                      {queueItem.ctaLabel}
                    </Link>
                  </div>

                  <div
                    className="action-effect-grid"
                    aria-label="Action effect"
                  >
                    <ActionEffectCell
                      label="Affected"
                      title={summary.affected.label}
                      body={summary.affected.detail}
                    />
                    <ActionEffectCell
                      label="Recorded"
                      title={summary.recordedChange.title}
                      body={summary.recordedChange.body}
                    />
                    <ActionEffectCell
                      label="Left"
                      title={summary.remainingWork.title}
                      body={summary.remainingWork.body}
                    />
                  </div>

                  <div
                    className="action-log-list"
                    aria-label="Recorded action log"
                  >
                    {summary.logEntries.map((entry) => (
                      <ActionLogEntry entry={entry} key={entry.label} />
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

function ActionLane({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  tone: "attention" | "ready" | "blocked" | "watching";
}) {
  return (
    <div className={`action-lane action-lane-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function ActionEffectCell({
  label,
  title,
  body,
}: {
  label: string;
  title: string;
  body: string;
}) {
  return (
    <div className="action-effect-cell">
      <span>{label}</span>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

function ActionLogEntry({
  entry,
}: {
  entry: ReturnType<typeof buildActionOwnerSummary>["logEntries"][number];
}) {
  return (
    <div className={`action-log-entry action-log-entry-${entry.tone}`}>
      <div>
        <span>{entry.label}</span>
        <strong>{entry.status}</strong>
      </div>
      <p>{entry.body}</p>
      {entry.meta ? <small>{entry.meta}</small> : null}
    </div>
  );
}

function laneState(lane: ReturnType<typeof getActionQueueItem>["lane"]) {
  if (lane === "blocked") return "blocked";
  if (
    lane === "ready_to_run" ||
    lane === "needs_approval" ||
    lane === "outcome_pending" ||
    lane === "watching"
  ) {
    return "current";
  }

  return "complete";
}
