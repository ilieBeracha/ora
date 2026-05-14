import { describe, expect, it } from "vitest";

import { decideUserSync } from "@/lib/auth/user-sync";

describe("user sync decisions", () => {
  it("starts an uninvited user as an admin who needs company onboarding", () => {
    expect(decideUserSync({ existingUserCount: 0 })).toEqual({
      role: "admin",
      invitedByUserId: null,
      companyId: null,
      invitationAccepted: false,
      needsCompanyOnboarding: true,
    });
  });

  it("accepts a pending invitation into the inviter company", () => {
    expect(
      decideUserSync({
        existingUserCount: 1,
        pendingInvitation: {
          invitedByUserId: "user_1",
          companyId: "company_1",
        },
      }),
    ).toEqual({
      role: "member",
      invitedByUserId: "user_1",
      companyId: "company_1",
      invitationAccepted: true,
      needsCompanyOnboarding: false,
    });
  });

  it("lets later uninvited users create their own company instead of joining", () => {
    expect(
      decideUserSync({
        existingUserCount: 1,
        pendingInvitation: null,
      }),
    ).toEqual({
      role: "admin",
      invitedByUserId: null,
      companyId: null,
      invitationAccepted: false,
      needsCompanyOnboarding: true,
    });
  });
});
