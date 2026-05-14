import { AppShell } from "@/components/app-shell";
import { requireCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireCurrentUser();

  if (!user.companyId) {
    redirect("/onboarding/company");
  }

  return <AppShell user={user}>{children}</AppShell>;
}
