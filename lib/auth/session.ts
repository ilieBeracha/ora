import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

import {
  isUserNotInvitedError,
  syncWorkOSUser,
} from "@/lib/auth/user-sync";

export async function requireCurrentUser() {
  const session = await withAuth();

  if (!session.user) {
    redirect("/login");
  }

  try {
    return await syncWorkOSUser(session.user);
  } catch (error) {
    if (isUserNotInvitedError(error)) {
      redirect("/not-invited");
    }

    throw error;
  }
}

export function canManageApp(role: string) {
  return role === "owner" || role === "admin";
}

export async function requireAppManager() {
  const user = await requireCurrentUser();

  if (!canManageApp(user.role)) {
    throw new Error("Only owners and admins can do this.");
  }

  return user;
}
