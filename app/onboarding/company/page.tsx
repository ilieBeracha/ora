import { redirect } from "next/navigation";

import { CompanySubmitButton } from "@/app/onboarding/company/submit-button";
import { requireCurrentUser } from "@/lib/auth/session";
import { createCompanyAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function CompanyOnboardingPage() {
  const user = await requireCurrentUser();

  if (user.companyId) {
    redirect("/today");
  }

  const userName = [user.firstName, user.lastName].filter(Boolean).join(" ");

  return (
    <main className="onboarding-page">
      <section className="onboarding-card">
        <div className="onboarding-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>

        <div className="onboarding-copy">
          <p className="onboarding-step">Company setup</p>
          <h1>Create your company in Ora</h1>
          <p>
            You were not invited into an existing Ora company. Create one now
            and you will be the company admin.
          </p>
        </div>

        <form action={createCompanyAction} className="onboarding-form">
          <div className="onboarding-user">
            <span>Signed in as</span>
            <strong>{userName || user.email}</strong>
            <small>{user.email}</small>
          </div>

          <label className="onboarding-field">
            <span>Company name</span>
            <input
              autoComplete="organization"
              autoFocus
              className="input onboarding-input"
              maxLength={120}
              name="companyName"
              placeholder="TAMU PANTS"
              required
              type="text"
            />
          </label>

          <CompanySubmitButton />
        </form>
      </section>
    </main>
  );
}
