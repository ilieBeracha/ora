import Link from "next/link";

import { ChatOpenButton } from "@/components/chat-open-button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SeverityBadge, StatusBadge } from "@/components/status-badge";
import { requireCurrentUser } from "@/lib/auth/session";
import { formatDate, titleCase } from "@/lib/format";
import { getTopSignals } from "@/lib/signals/queries";

export default async function TodayPage() {
  const user = await requireCurrentUser();
  const signals = user.companyId ? await getTopSignals(user.companyId, 8) : [];
  const leadSignal = signals[0];
  const trendCards = buildTrendCards(signals);
  const durableExamples = signals.slice(0, 3);
  const categoryLanes = buildCategoryLanes(signals);

  return (
    <>
      <PageHeader
        eyebrow="Today"
        title="Today's operating brief"
        description="Durable patterns and concrete examples from active Signals. Use the Signal center for the full queue."
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
        <div className="today-brief">
          {leadSignal ? (
            <section
              className="today-lead-insight"
              data-chat-explain="true"
              data-chat-source="today-lead-insight"
              data-chat-title={leadSignal.title}
              data-chat-description={leadSignal.summary}
              data-chat-signal-id={leadSignal.id}
              data-chat-object-type="signal"
              data-chat-object-id={leadSignal.id}
              data-chat-prompt={`Explain today's main operating insight: ${leadSignal.title}. Include the evidence and the safest next review.`}
            >
              <ChatOpenButton label={`Open ${leadSignal.title} in chat`} />
              <div>
                <div className="today-lead-meta">
                  <SeverityBadge severity={leadSignal.severity} />
                  <StatusBadge status={leadSignal.status} />
                  <span className="badge">{titleCase(leadSignal.category)}</span>
                </div>
                <p className="kicker">Main thing to remember</p>
                <h2>{leadSignal.title}</h2>
                <p>{leadSignal.summary}</p>
              </div>

              <div className="today-lead-proof">
                <p className="kicker">Concrete proof</p>
                <strong>
                  {leadSignal.evidence[0]?.displayText ??
                    "No evidence has been recorded yet."}
                </strong>
                <span>
                  Updated {formatDate(leadSignal.updatedAt)} -{" "}
                  {Math.round(leadSignal.confidence * 100)}% confidence
                </span>
                <Link
                  className="button button-primary"
                  href={`/signals/${leadSignal.id}`}
                >
                  Review this Signal
                </Link>
              </div>
            </section>
          ) : null}

          <section className="today-trend-grid" aria-label="Current trends">
            {trendCards.map((card) => (
              <article
                className="today-trend-card"
                data-chat-explain="true"
                data-chat-source="today-trend-card"
                data-chat-title={card.label}
                data-chat-description={`${card.value} - ${card.detail}`}
                data-chat-prompt={`Explain this Today insight: ${card.label} - ${card.value}. ${card.detail}`}
                key={card.label}
              >
                <ChatOpenButton label={`Open ${card.label} in chat`} />
                <p className="kicker">{card.label}</p>
                <strong>{card.value}</strong>
                <span>{card.detail}</span>
              </article>
            ))}
          </section>

          <section className="today-memory-grid" aria-label="Durable examples">
            {durableExamples.map((signal) => (
              <article
                className="today-memory-card"
                data-chat-explain="true"
                data-chat-source="today-memory-card"
                data-chat-title={signal.title}
                data-chat-description={signal.summary}
                data-chat-signal-id={signal.id}
                data-chat-object-type="signal"
                data-chat-object-id={signal.id}
                data-chat-prompt={`Explain this durable example from today: ${signal.title}.`}
                key={signal.id}
              >
                <ChatOpenButton label={`Open ${signal.title} in chat`} />
                <div className="today-memory-top">
                  <span>{titleCase(signal.category)}</span>
                  <SeverityBadge severity={signal.severity} />
                </div>
                <h3>{signal.title}</h3>
                <p>{signal.evidence[0]?.displayText ?? signal.summary}</p>
                <Link href={`/signals/${signal.id}`}>Open Signal</Link>
              </article>
            ))}
          </section>

          {categoryLanes.length > 0 ? (
            <section className="today-lanes" aria-label="Signal pressure lanes">
              <div className="today-section-head">
                <p className="kicker">Trend lanes</p>
                <h2 className="section-title">Where pressure is clustering</h2>
              </div>
              <div className="today-lane-list">
                {categoryLanes.map((lane) => (
                  <Link
                    className="today-lane"
                    href={`/signals?status=open`}
                    key={lane.category}
                  >
                    <span>{titleCase(lane.category)}</span>
                    <strong>{lane.count} open</strong>
                    <small>{lane.example}</small>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}

type TodaySignal = Awaited<ReturnType<typeof getTopSignals>>[number];

function buildTrendCards(signals: TodaySignal[]) {
  const categoryCounts = countBy(signals, (signal) => signal.category);
  const severityCounts = countBy(signals, (signal) => signal.severity);
  const topCategory = topEntry(categoryCounts);
  const topSeverity = topEntry(severityCounts);
  const highestConfidence = [...signals].sort(
    (a, b) => b.confidence - a.confidence,
  )[0];

  return [
    {
      label: "Dominant pattern",
      value: topCategory ? titleCase(topCategory[0]) : "No pattern yet",
      detail: topCategory
        ? `${topCategory[1]} of ${signals.length} open Signals point here.`
        : "Ora has not found a repeating pressure point.",
    },
    {
      label: "Risk posture",
      value: topSeverity ? titleCase(topSeverity[0]) : "Unknown",
      detail: topSeverity
        ? `${topSeverity[1]} Signals are currently ${topSeverity[0]} priority.`
        : "No open Signal priority is available.",
    },
    {
      label: "Strongest proof",
      value: highestConfidence
        ? `${Math.round(highestConfidence.confidence * 100)}% confidence`
        : "No proof yet",
      detail:
        highestConfidence?.evidence[0]?.displayText ??
        "Evidence will appear after detection runs.",
    },
  ];
}

function buildCategoryLanes(signals: TodaySignal[]) {
  const grouped = new Map<string, TodaySignal[]>();

  for (const signal of signals) {
    grouped.set(signal.category, [...(grouped.get(signal.category) ?? []), signal]);
  }

  return [...grouped.entries()]
    .map(([category, items]) => ({
      category,
      count: items.length,
      example: items[0]?.title ?? "No example yet",
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
}

function countBy<T>(items: T[], keyFor: (item: T) => string) {
  const counts = new Map<string, number>();

  for (const item of items) {
    const key = keyFor(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function topEntry(counts: Map<string, number>) {
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
}
