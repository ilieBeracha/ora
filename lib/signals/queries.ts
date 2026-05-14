import { prisma } from "@/lib/db";

const severityRank = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export async function getTopSignals(companyId: string, limit = 3) {
  const signals = await prisma.signal.findMany({
    where: { companyId, status: "open" },
    include: {
      evidence: { orderBy: { observedAt: "desc" }, take: 2 },
      recommendations: { take: 1 },
    },
    orderBy: [{ detectedAt: "desc" }],
    take: 20,
  });

  return signals
    .sort(
      (a, b) =>
        severityRank[b.severity] - severityRank[a.severity] ||
        b.confidence - a.confidence,
    )
    .slice(0, limit);
}

const signalStatuses = ["open", "monitoring", "resolved", "ignored"] as const;

export async function listSignals(companyId: string, status = "open") {
  const selectedStatus = signalStatuses.includes(
    status as (typeof signalStatuses)[number],
  )
    ? status
    : "open";

  return prisma.signal.findMany({
    where: { companyId, status: selectedStatus as never },
    include: {
      evidence: { orderBy: { observedAt: "desc" }, take: 1 },
      recommendations: { take: 1 },
    },
    orderBy: [{ status: "asc" }, { detectedAt: "desc" }],
  });
}

export async function getSignalDetail(companyId: string, id: string) {
  return prisma.signal.findFirst({
    where: { id, companyId },
    include: {
      evidence: { orderBy: { observedAt: "desc" } },
      recommendations: { orderBy: { id: "asc" } },
      actionPlans: {
        orderBy: { createdAt: "desc" },
        include: {
          approval: true,
          executions: { orderBy: { executedAt: "desc" } },
          outcomes: { orderBy: { measuredAt: "desc" } },
        },
      },
      outcomes: { orderBy: { measuredAt: "desc" } },
    },
  });
}

export async function listActionHistory(companyId: string) {
  return prisma.actionPlan.findMany({
    where: {
      signal: {
        companyId,
        status: { not: "ignored" },
      },
    },
    include: {
      signal: true,
      approval: { include: { approvedBy: true } },
      executions: { orderBy: { executedAt: "desc" } },
      outcomes: { orderBy: { measuredAt: "desc" } },
    },
    orderBy: { updatedAt: "desc" },
  });
}
