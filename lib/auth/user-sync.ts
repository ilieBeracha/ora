import type { User as WorkOSUser } from "@workos-inc/node";

import { prisma } from "@/lib/db";
import type { UserRole } from "@/lib/generated/prisma/client";

export type UserSyncDecision = {
  role: UserRole;
  invitedByUserId: string | null;
  companyId: string | null;
  invitationAccepted: boolean;
  needsCompanyOnboarding: boolean;
};

export class UserNotInvitedError extends Error {
  code = "USER_NOT_INVITED";

  constructor(email: string) {
    super(`${email} has not been invited to Ora.`);
    this.name = "UserNotInvitedError";
  }
}

export function isUserNotInvitedError(
  error: unknown,
): error is UserNotInvitedError {
  if (error instanceof UserNotInvitedError) return true;
  if (!error || typeof error !== "object" || !("code" in error)) return false;

  return error.code === "USER_NOT_INVITED";
}

export function decideUserSync(params: {
  existingUserCount: number;
  pendingInvitation?: {
    invitedByUserId: string | null;
    companyId?: string | null;
    invitedBy?: { companyId: string | null } | null;
  } | null;
}): UserSyncDecision {
  if (params.pendingInvitation) {
    return {
      role: "member",
      invitedByUserId: params.pendingInvitation.invitedByUserId,
      companyId:
        params.pendingInvitation.companyId ??
        params.pendingInvitation.invitedBy?.companyId ??
        null,
      invitationAccepted: true,
      needsCompanyOnboarding: false,
    };
  }

  return {
    role: "admin",
    invitedByUserId: null,
    companyId: null,
    invitationAccepted: false,
    needsCompanyOnboarding: true,
  };
}

export async function syncWorkOSUser(workosUser: WorkOSUser) {
  const existing = await prisma.user.findUnique({
    where: { workosUserId: workosUser.id },
  });

  if (existing) {
    if (existing.status === "suspended") {
      throw new UserNotInvitedError(workosUser.email);
    }

    return prisma.user.update({
      where: { id: existing.id },
      data: {
        email: workosUser.email,
        firstName: workosUser.firstName,
        lastName: workosUser.lastName,
        status: existing.status === "invited" ? "active" : existing.status,
      },
    });
  }

  const [existingUserCount, pendingInvitation] = await Promise.all([
    prisma.user.count(),
    prisma.invitation.findFirst({
      where: {
        email: { equals: workosUser.email, mode: "insensitive" },
        status: "pending",
      },
      include: {
        invitedBy: {
          select: { companyId: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const decision = decideUserSync({
    existingUserCount,
    pendingInvitation,
  });

  const user = await prisma.user.create({
    data: {
      workosUserId: workosUser.id,
      email: workosUser.email,
      firstName: workosUser.firstName,
      lastName: workosUser.lastName,
      role: decision.role,
      status: "active",
      companyId: decision.companyId,
      invitedByUserId: decision.invitedByUserId,
    },
  });

  if (pendingInvitation && decision.invitationAccepted) {
    await prisma.invitation.update({
      where: { id: pendingInvitation.id },
      data: {
        status: "accepted",
        acceptedAt: new Date(),
      },
    });
  }

  return user;
}
