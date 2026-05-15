import Link from "next/link";

import { ChatOpenButton } from "@/components/chat-open-button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SeverityBadge, StatusBadge } from "@/components/status-badge";
import { requireCurrentUser } from "@/lib/auth/session";
import { formatDate, formatMoneyFromCents, titleCase } from "@/lib/format";
import {
  buildSignalOwnerSummary,
  summarizeSignalOwnerQueue,
} from "@/lib/signals/owner-summary";
import { listSignals } from "@/lib/signals/queries";

const filters = [
  { label: "Needs attention", value: "open" },
  { label: "Monitoring", value: "monitoring" },
  { label: "Resolved", value: "resolved" },
  { label: "Ignored", value: "ignored" },
];

export default async function SignalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const user = await requireCurrentUser();
  const activeStatus = status ?? "open";
  const signals = user.companyId
    ? await listSignals(user.companyId, activeStatus)
    : [];
  const signalRows = signals.map((signal) => ({
    signal,
    summary: buildSignalOwnerSummary(signal),
  }));
  const workQueue = summarizeSignalOwnerQueue(
    signalRows.map((row) => row.summary),
  );
  const leadRow =
    signalRows.find((row) =>
      ["blocked", "needs_approval", "ready_to_run"].includes(row.summary.lane),
    ) ?? signalRows[0];

  return (
    <>
      <PageHeader
        eyebrow="Signals"
        title="Signal center"
        description="Each Signal shows what needs changing, what has been recorded, and what is still left to do."
        marker="02"
      />

      <div className="filter-row">
        {filters.map((filter) => (
          <Link
            key={filter.value}
            className={
              activeStatus === filter.value
                ? "button filter-button-active"
                : "button filter-button"
            }
            href={`/signals?status=${filter.value}`}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      {signals.length === 0 ? (
        <EmptyState
          title="No Signals in this view"
          note="02"
          body="Run detection from Connections after products have been mirrored."
        />
      ) : (
        <>
          <section
            className="signal-owner-board"
            data-chat-explain="true"
            data-chat-source="signal-summary"
            data-chat-title="Signal work queue"
            data-chat-description={`${workQueue.research} research-only, ${workQueue.needsApproval} need approval, ${workQueue.readyToRun} ready to run, ${workQueue.blocked} blocked, ${workQueue.outcomePending} waiting on outcome.`}
            data-chat-object-type="signal_queue"
            data-chat-prompt="Summarize the Signal work queue. Focus on what needs to change, what is already recorded, and what remains."
          >
            <ChatOpenButton label="Open Signal queue in chat" hint="Queue" />
            <div className="signal-owner-board-copy">
              <p className="kicker">Work queue</p>
              <h2>
                {leadRow
                  ? leadRow.summary.remainingWork.title
                  : "No Signal work in this view"}
              </h2>
              <p>
                {leadRow
                  ? `${leadRow.signal.title}: ${leadRow.summary.remainingWork.body}`
                  : "Change, action, and outcome records will appear here after detection."}
              </p>
            </div>
            <div className="signal-owner-lanes" aria-label="Signal work lanes">
              <SignalLane label="Research" value={workQueue.research} />
              <SignalLane label="Approval" value={workQueue.needsApproval} />
              <SignalLane label="Ready" value={workQueue.readyToRun} />
              <SignalLane label="Blocked" value={workQueue.blocked} />
              <SignalLane label="Outcome" value={workQueue.outcomePending} />
            </div>
          </section>

          <div className="signal-list signal-owner-list">
            {signalRows.map(({ signal, summary }) => {
              return (
                <article
                  className={`panel panel-pad signal-card task-card signal-row signal-owner-card signal-owner-card-${summary.tone}`}
                  data-chat-explain="true"
                  data-chat-source="signal-card"
                  data-chat-title={signal.title}
                  data-chat-description={`Needs change: ${summary.changeNeeded.body} Recorded: ${summary.recordedChange.title}. Left: ${summary.remainingWork.title}. Affected: ${summary.affected.label}.`}
                  data-chat-signal-id={signal.id}
                  data-chat-object-type="signal"
                  data-chat-object-id={signal.id}
                  data-chat-prompt={`Explain this Signal: ${signal.title}. Start with what needs changing, what has already been recorded, what is left, and what was affected.`}
                  key={signal.id}
                >
                  <ChatOpenButton label={`Open ${signal.title} in chat`} />
                  <div className="task-primary signal-task-primary">
                    <div className="task-copy">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <SeverityBadge severity={signal.severity} />
                        <StatusBadge status={signal.status} />
                        <span className="badge">
                          {titleCase(signal.category)}
                        </span>
                        <span
                          className={`flow-badge flow-badge-${summary.tone}`}
                        >
                          {summary.actionLogLine}
                        </span>
                      </div>
                      <h2 className="section-title">{signal.title}</h2>
                      <p className="muted mt-2 max-w-3xl text-sm leading-6">
                        {summary.proof.body}
                      </p>
                    </div>

                    <div className="signal-row-actions">
                      <div className="fact-rail">
                        <div className="fact-row">
                          <span className="fact-label">Affected</span>
                          <div>{summary.affected.label}</div>
                        </div>
                        <div className="fact-row">
                          <span className="fact-label">Impact</span>
                          <div>
                            {formatMoneyFromCents(signal.impactEstimateCents)}
                          </div>
                        </div>
                        <div className="fact-row">
                          <span className="fact-label">Last detected</span>
                          <div>{formatDate(signal.detectedAt)}</div>
                        </div>
                      </div>
                      <Link
                        className={`button ${
                          ["attention", "ready", "blocked"].includes(
                            summary.tone,
                          )
                            ? "button-primary"
                            : ""
                        }`}
                        href={`/signals/${signal.id}`}
                      >
                        {summary.remainingWork.title}
                      </Link>
                    </div>
                  </div>

                  <div className="signal-owner-grid" aria-label="Signal summary">
                    <SignalWorkCell
                      label="Needs change"
                      title={summary.changeNeeded.title}
                      body={summary.changeNeeded.body}
                    />
                    <SignalWorkCell
                      label="Recorded"
                      title={summary.recordedChange.title}
                      body={summary.recordedChange.body}
                    />
                    <SignalWorkCell
                      label="Left"
                      title={summary.remainingWork.title}
                      body={summary.remainingWork.body}
                    />
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

function SignalLane({ label, value }: { label: string; value: number }) {
  return (
    <div className="signal-owner-lane">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SignalWorkCell({
  label,
  title,
  body,
}: {
  label: string;
  title: string;
  body: string;
}) {
  return (
    <div className="signal-work-cell">
      <span>{label}</span>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}
