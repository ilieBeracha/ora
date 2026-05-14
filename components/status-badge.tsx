import { clsx } from "clsx";

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={clsx("badge", `badge-${severity}`)}>{severity}</span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <span className="badge">{status.replaceAll("_", " ")}</span>;
}

export function RiskBadge({ risk }: { risk: string }) {
  return <span className={clsx("badge", `badge-${risk}`)}>{risk} risk</span>;
}
