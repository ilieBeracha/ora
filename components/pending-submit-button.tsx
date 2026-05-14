"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

type PendingSubmitButtonProps = {
  children: ReactNode;
  className?: string;
  pendingLabel: string;
};

export function PendingSubmitButton({
  children,
  className = "button",
  pendingLabel,
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      aria-busy={pending}
      className={className}
      disabled={pending}
      type="submit"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
