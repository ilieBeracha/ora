"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { hashApprovalPayload } from "@/lib/approval/hash";
import { requireAppManager } from "@/lib/auth/session";
import { executeApprovedActionPlan } from "@/lib/actions/execute";
import { prisma } from "@/lib/db";
import { REVIEW_OUTCOME_SCAN_STARTED_SUMMARY } from "@/lib/signals/outcome-guidance";
import { detectSignalsForConnection } from "@/lib/signals/persist";

export async function approveActionPlanAction(formData: FormData) {
  const user = await requireAppManager();
  const actionPlanId = z.string().min(1).parse(formData.get("actionPlanId"));
  const approvalText = z
    .string()
    .min(1)
    .parse(formData.get("approvalText") ?? "Approved in Ora UI.");
  const companyId = requireCompanyId(user.companyId);

  const actionPlan = await prisma.actionPlan.findFirstOrThrow({
    where: { id: actionPlanId, signal: { companyId } },
  });
  const approvalPayloadHash = hashApprovalPayload(actionPlan.executionPayload);

  await prisma.approval.upsert({
    where: { actionPlanId },
    update: {
      approvedByUserId: user.id,
      approvedAt: new Date(),
      approvalPayloadHash,
      approvalText,
    },
    create: {
      actionPlanId,
      approvedByUserId: user.id,
      approvalPayloadHash,
      approvalText,
    },
  });

  await prisma.actionPlan.update({
    where: { id: actionPlanId },
    data: { status: "approved" },
  });

  revalidatePath(`/signals/${actionPlan.signalId}`);
  revalidatePath("/actions");
}

export async function executeActionPlanAction(formData: FormData) {
  const user = await requireAppManager();
  const companyId = requireCompanyId(user.companyId);
  const actionPlanId = z.string().min(1).parse(formData.get("actionPlanId"));
  const actionPlan = await prisma.actionPlan.findFirstOrThrow({
    where: { id: actionPlanId, signal: { companyId } },
  });

  await executeApprovedActionPlan(actionPlanId);

  revalidatePath(`/signals/${actionPlan.signalId}`);
  revalidatePath("/today");
  revalidatePath("/signals");
  revalidatePath("/actions");
}

export async function rescanSignalOutcomeAction(formData: FormData) {
  const user = await requireAppManager();
  const companyId = requireCompanyId(user.companyId);
  const signalId = z.string().min(1).parse(formData.get("signalId"));
  const connectionId = z.string().min(1).parse(formData.get("connectionId"));
  const [signal, connection] = await Promise.all([
    prisma.signal.findFirstOrThrow({
      where: { id: signalId, companyId },
    }),
    prisma.shopifyConnection.findFirstOrThrow({
      where: { id: connectionId, companyId },
    }),
  ]);

  if (
    signal.affectedObjectType !== "store" ||
    signal.affectedObjectId !== connection.id
  ) {
    throw new Error("This Outcome scan must run against the Signal store.");
  }

  await prisma.shopifyConnection.update({
    where: { id: connection.id },
    data: {
      lastSignalDetectionStatus: "running",
      lastSignalDetectionError: null,
      lastSignalDetectionSummary: REVIEW_OUTCOME_SCAN_STARTED_SUMMARY,
    },
  });

  try {
    const result = await detectSignalsForConnection(connection.id);
    await prisma.shopifyConnection.update({
      where: { id: connection.id },
      data: {
        lastSignalDetectionAt: new Date(),
        lastSignalDetectionStatus: "completed",
        lastSignalDetectionSignalCount: result.signalCountWithLifecycle,
        lastSignalDetectionSummary: outcomeScanSummary(result),
        lastSignalDetectionError: null,
      },
    });
  } catch (error) {
    await prisma.shopifyConnection.update({
      where: { id: connection.id },
      data: {
        lastSignalDetectionAt: new Date(),
        lastSignalDetectionStatus: "failed",
        lastSignalDetectionError:
          error instanceof Error ? error.message : "Unknown detection failure",
        lastSignalDetectionSummary: null,
      },
    });
    revalidateSignalOutcomePaths(signal.id);
    throw error;
  }

  revalidateSignalOutcomePaths(signal.id);
}

export async function ignoreSignalAction(formData: FormData) {
  const user = await requireAppManager();
  const companyId = requireCompanyId(user.companyId);
  const signalId = z.string().min(1).parse(formData.get("signalId"));
  const signal = await prisma.signal.findFirstOrThrow({
    where: { id: signalId, companyId },
  });

  await prisma.signal.update({
    where: { id: signal.id },
    data: { status: "ignored" },
  });

  revalidatePath("/signals");
  revalidatePath(`/signals/${signal.id}`);
}

function outcomeScanSummary(result: Awaited<ReturnType<typeof detectSignalsForConnection>>) {
  const measured = result.outcomeNoChange + result.outcomesResolved;

  if (!measured) {
    return "Outcome scan completed. No pending Outcomes changed on this scan.";
  }

  return `Outcome scan completed. ${result.outcomesResolved} resolved, ${result.outcomeNoChange} still actionable.`;
}

function revalidateSignalOutcomePaths(signalId: string) {
  revalidatePath(`/signals/${signalId}`);
  revalidatePath("/today");
  revalidatePath("/signals");
  revalidatePath("/actions");
  revalidatePath("/connections");
}

function requireCompanyId(companyId: string | null) {
  if (!companyId) {
    throw new Error("Create a company before managing Signals.");
  }

  return companyId;
}
