import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { SeverityBadge, StatusBadge } from "@/components/status-badge";
import { requireCurrentUser } from "@/lib/auth/session";
import { formatDate, formatMoneyFromCents, titleCase } from "@/lib/format";
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
  const signals = user.companyId ? await listSignals(user.companyId, activeStatus) : [];

  return (
    <>
      <PageHeader
        eyebrow="Signals"
        title="Signal center"
        description="Signals are interpretations backed by Evidence. Each one should point toward one clear next action."
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
        <div className="signal-list">
          {signals.map((signal) => (
            <Link
              className="panel panel-pad signal-card task-card signal-row block"
              href={`/signals/${signal.id}`}
              key={signal.id}
            >
              <div className="task-primary">
                <div className="task-copy">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={signal.severity} />
                    <StatusBadge status={signal.status} />
                    <span className="badge">{titleCase(signal.category)}</span>
                  </div>
                  <h2 className="section-title">{signal.title}</h2>
                  <p className="muted mt-2 max-w-3xl text-sm leading-6">
                    {signal.summary}
                  </p>
                </div>

                <div className="fact-rail">
                  <div className="fact-row">
                    <span className="fact-label">Expected impact</span>
                    <div>{formatMoneyFromCents(signal.impactEstimateCents)}</div>
                  </div>
                  <div className="fact-row">
                    <span className="fact-label">Last detected</span>
                    <div>{formatDate(signal.detectedAt)}</div>
                  </div>
                  <div className="fact-row">
                    <span className="fact-label">Affected</span>
                    <div>{signal.affectedObjectType.replaceAll("_", " ")}</div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
