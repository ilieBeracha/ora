import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";

export async function GET() {
  const signInUrl = await getSignInUrl({ returnTo: "/onboarding/company" });
  redirect(signInUrl);
}
