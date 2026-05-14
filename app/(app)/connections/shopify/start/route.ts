import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";

import { requireAppManager } from "@/lib/auth/session";
import { buildShopifyAuthorizationUrl, normalizeShopDomain } from "@/lib/shopify/client";

export async function GET(request: NextRequest) {
  await requireAppManager();
  const shop = request.nextUrl.searchParams.get("shop");
  if (!shop) redirect("/connections");

  const shopDomain = normalizeShopDomain(shop);
  const state = randomUUID();
  const cookieStore = await cookies();
  cookieStore.set("ora_shopify_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  redirect(buildShopifyAuthorizationUrl({ shopDomain, state }));
}

