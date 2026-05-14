"use client";

import { useFormStatus } from "react-dom";

export function CompanySubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      className="button button-primary onboarding-submit"
      disabled={pending}
      type="submit"
    >
      {pending ? "Creating company" : "Create company"}
    </button>
  );
}
