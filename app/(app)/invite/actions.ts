"use server";

import { getWorkOS } from "@workos-inc/authkit-nextjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAppManager } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const inviteSchema = z.object({
  email: z.string().email(),
});

export async function inviteUserAction(formData: FormData) {
  const user = await requireAppManager();
  const parsed = inviteSchema.parse({ email: formData.get("email") });

  if (!user.companyId) {
    throw new Error("Create a company before inviting users.");
  }

  const invitation = await getWorkOS().userManagement.sendInvitation({
    email: parsed.email,
    inviterUserId: user.workosUserId,
  });

  await prisma.invitation.create({
    data: {
      email: invitation.email,
      companyId: user.companyId,
      invitedByUserId: user.id,
      status: invitation.state,
      workosInvitationId: invitation.id,
      token: invitation.token,
      expiresAt: new Date(invitation.expiresAt),
    },
  });

  revalidatePath("/invite");
}

export async function revokeInvitationAction(formData: FormData) {
  const user = await requireAppManager();
  const invitationId = z.string().min(1).parse(formData.get("invitationId"));
  if (!user.companyId) {
    throw new Error("Create a company before managing invitations.");
  }

  const invitation = await prisma.invitation.findFirstOrThrow({
    where: { id: invitationId, companyId: user.companyId },
  });

  if (invitation.workosInvitationId) {
    await getWorkOS().userManagement.revokeInvitation(
      invitation.workosInvitationId,
    );
  }

  await prisma.invitation.update({
    where: { id: invitation.id },
    data: { status: "revoked" },
  });

  revalidatePath("/invite");
}
