import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";

import { requireAppManager } from "@/lib/auth/session";
import { saveConnectorConfig } from "@/lib/connectors/store";
import { prisma } from "@/lib/db";
import { digestSecret, encryptSecret } from "@/lib/security/crypto";
import {
  exchangeShopifyCode,
  fetchShopInfo,
  normalizeShopDomain,
} from "@/lib/shopify/client";

export async function GET(request: NextRequest) {
  const user = await requireAppManager();
  if (!user.companyId) {
    return NextResponse.redirect(new URL("/onboarding/company", request.url));
  }
  const code = request.nextUrl.searchParams.get("code");
  const shop = request.nextUrl.searchParams.get("shop");
  const state = request.nextUrl.searchParams.get("state");
  const cookieStore = await cookies();
  const storedState = cookieStore.get("ora_shopify_oauth_state")?.value;

  if (!code || !shop || !state || state !== storedState) {
    return NextResponse.redirect(new URL("/connections?shopify=invalid", request.url));
  }

  const shopDomain = normalizeShopDomain(shop);
  const apiVersion = process.env.SHOPIFY_API_VERSION ?? "2026-04";
  const token = await exchangeShopifyCode({ shopDomain, code });
  const shopInfo = await fetchShopInfo({
    shopDomain,
    accessToken: token.access_token,
    apiVersion,
  });
  const scopes = token.scope?.split(",").map((scope) => scope.trim()) ?? [];

  await prisma.shopifyConnection.upsert({
    where: {
      companyId_shopDomain: { companyId: user.companyId, shopDomain },
    },
    update: {
      shopName: shopInfo.name,
      email: shopInfo.email,
      status: "connected",
      authMethod: "oauth",
      scopes,
      encryptedAccessToken: encryptSecret(token.access_token),
      accessTokenDigest: digestSecret(token.access_token),
      apiVersion,
      shopInfoJson: shopInfo,
      connectedByUserId: user.id,
    },
    create: {
      companyId: user.companyId,
      shopDomain,
      shopName: shopInfo.name,
      email: shopInfo.email,
      status: "connected",
      authMethod: "oauth",
      scopes,
      encryptedAccessToken: encryptSecret(token.access_token),
      accessTokenDigest: digestSecret(token.access_token),
      apiVersion,
      shopInfoJson: shopInfo,
      connectedByUserId: user.id,
    },
  });

  await saveConnectorConfig(user.companyId, "shopify", {
    authMethod: "oauth",
    shopDomain,
    shopName: shopInfo.name,
    apiVersion,
    scopes,
    accessToken: token.access_token,
  });

  cookieStore.delete("ora_shopify_oauth_state");
  redirect("/connections");
}
