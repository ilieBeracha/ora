import Link from "next/link";

import { ChatOpenButton } from "@/components/chat-open-button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SeverityBadge, StatusBadge } from "@/components/status-badge";
import { requireCurrentUser } from "@/lib/auth/session";
import { getTopSignals } from "@/lib/signals/queries";

export default async function TodayPage() {
  const user = await requireCurrentUser();
  const signals = user.companyId ? await getTopSignals(user.companyId, 3) : [];

  return (
    <>
      <PageHeader
        eyebrow="Today"
        title="Signals that need attention now"
        description="Only the top Signals appear here. Ora stays focused on what happened, why it matters, and the next approved action."
        marker="01"
      />

      {signals.length === 0 ? (
        <EmptyState
          title="No open Signals yet"
          note="01"
          body="Connect Shopify, refresh the product mirror, then detect Signals to see the highest-priority work here."
          action={
            <Link className="button button-primary" href="/connections">
              Go to Connections
            </Link>
          }
        />
      ) : (
        <div className="signal-list">
          {signals.map((signal) => (
            <article
              className="panel panel-pad signal-card task-card signal-row"
              data-chat-explain="true"
              data-chat-source="signal-card"
              data-chat-title={signal.title}
              data-chat-description={signal.summary}
              data-chat-signal-id={signal.id}
              data-chat-object-type="signal"
              data-chat-object-id={signal.id}
              data-chat-prompt={`Explain this Signal: ${signal.title}. Why does it matter and what should I review first?`}
              key={signal.id}
            >
              <ChatOpenButton label={`Open ${signal.title} in chat`} />
              <div className="task-primary">
                <div className="task-copy">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={signal.severity} />
                    <StatusBadge status={signal.status} />
                  </div>
                  <h2 className="section-title">{signal.title}</h2>
                  <p className="muted mt-2 max-w-3xl leading-6">
                    {signal.summary}
                  </p>
                </div>

                <Link
                  className="button button-primary"
                  href={`/signals/${signal.id}`}
                >
                  Review Signal
                </Link>
              </div>

              <div className="task-details">
                <div className="task-detail">
                  <p className="kicker">Evidence</p>
                  <p className="text-sm leading-6">
                    {signal.evidence[0]?.displayText ??
                      "No evidence has been recorded yet."}
                  </p>
                </div>
                <div className="task-detail">
                  <p className="kicker">Recommended action</p>
                  <p className="text-sm leading-6">
                    {signal.recommendations[0]?.title ??
                      "Review the Signal before preparing an action."}
                  </p>
                </div>
                <div className="task-detail">
                  <p className="kicker">Priority</p>
                  <p className="text-sm leading-6">
                    {signal.severity} severity ·{" "}
                    {Math.round(signal.confidence * 100)}% confidence
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
