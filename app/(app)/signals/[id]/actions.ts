"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { hashApprovalPayload } from "@/lib/approval/hash";
import { requireAppManager } from "@/lib/auth/session";
import { executeApprovedActionPlan } from "@/lib/actions/execute";
import { prisma } from "@/lib/db";

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

function requireCompanyId(companyId: string | null) {
  if (!companyId) {
    throw new Error("Create a company before managing Signals.");
  }

  return companyId;
}
