import { handleAuth } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";

import {
  isUserNotInvitedError,
  syncWorkOSUser,
} from "@/lib/auth/user-sync";

export const GET = handleAuth({
  returnPathname: "/onboarding/company",
  onSuccess: async ({ user }) => {
    await syncWorkOSUser(user);
  },
  onError: ({ error, request }) => {
    if (isUserNotInvitedError(error)) {
      return NextResponse.redirect(new URL("/not-invited", request.url));
    }

    return NextResponse.redirect(new URL("/login", request.url));
  },
});
