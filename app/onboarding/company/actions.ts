"use server";

import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { z } from "zod";

import { syncWorkOSUser } from "@/lib/auth/user-sync";
import { prisma } from "@/lib/db";

const companySchema = z.object({
  companyName: z.string().trim().min(1).max(120),
});

export async function createCompanyAction(formData: FormData) {
  const session = await withAuth();

  if (!session.user) {
    redirect("/login");
  }

  const user = await syncWorkOSUser(session.user);

  if (user.companyId) {
    redirect("/today");
  }

  const parsed = companySchema.parse({
    companyName: formData.get("companyName"),
  });

  await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        name: parsed.companyName,
        adminUserId: user.id,
      },
    });

    await tx.user.update({
      where: { id: user.id },
      data: {
        role: "admin",
        companyId: company.id,
      },
    });
  });

  redirect("/today");
}
