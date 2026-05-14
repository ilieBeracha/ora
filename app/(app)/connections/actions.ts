"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAppManager } from "@/lib/auth/session";
import {
  KLAVIYO_DEFAULT_REVISION,
  normalizeKlaviyoRevision,
  testKlaviyoConfig,
  type KlaviyoConfig,
} from "@/lib/connectors/klaviyo";
import { deleteConnector, saveConnectorConfig } from "@/lib/connectors/store";
import { prisma } from "@/lib/db";
import { digestSecret, encryptSecret } from "@/lib/security/crypto";
import { detectSignalsForConnection } from "@/lib/signals/persist";
import { syncProductMirror } from "@/lib/shopify/sync";
import {
  exchangeShopifyClientCredentials,
  fetchShopInfo,
  normalizeShopDomain,
} from "@/lib/shopify/client";

const apiKeyConnectionSchema = z.object({
  shop: z.string().min(2),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  apiVersion: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
});

const klaviyoConnectionSchema = z.object({
  apiKey: z.string().trim().min(8),
  apiRevision: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}(?:\.[A-Za-z0-9_-]+)?$/)
    .optional(),
});

export async function saveShopifyApiKeyConnection(formData: FormData) {
  const user = await requireAppManager();
  const companyId = requireCompanyId(user.companyId);
  const parsed = apiKeyConnectionSchema.parse({
    shop: formData.get("shop"),
    clientId: formData.get("clientId"),
    clientSecret: formData.get("clientSecret"),
    apiVersion: formData.get("apiVersion") || undefined,
  });
  const shopDomain = normalizeShopDomain(parsed.shop);
  const apiVersion = parsed.apiVersion ?? process.env.SHOPIFY_API_VERSION ?? "2026-04";
  const token = await exchangeShopifyClientCredentials({
    shopDomain,
    clientId: parsed.clientId,
    clientSecret: parsed.clientSecret,
  });
  const shopInfo = await fetchShopInfo({
    shopDomain,
    accessToken: token.access_token,
    apiVersion,
  });
  const scopes = token.scope?.split(",").map((scope) => scope.trim()) ?? [];

  await prisma.shopifyConnection.upsert({
    where: { companyId_shopDomain: { companyId, shopDomain } },
    update: {
      shopName: shopInfo.name,
      email: shopInfo.email,
      status: "connected",
      authMethod: "api_key",
      scopes,
      encryptedAccessToken: encryptSecret(token.access_token),
      accessTokenDigest: digestSecret(token.access_token),
      apiClientId: parsed.clientId,
      encryptedApiClientSecret: encryptSecret(parsed.clientSecret),
      apiVersion,
      shopInfoJson: shopInfo,
      lastSyncError: null,
      lastSignalDetectionError: null,
      connectedByUserId: user.id,
    },
    create: {
      companyId,
      shopDomain,
      shopName: shopInfo.name,
      email: shopInfo.email,
      status: "connected",
      authMethod: "api_key",
      scopes,
      encryptedAccessToken: encryptSecret(token.access_token),
      accessTokenDigest: digestSecret(token.access_token),
      apiClientId: parsed.clientId,
      encryptedApiClientSecret: encryptSecret(parsed.clientSecret),
      apiVersion,
      shopInfoJson: shopInfo,
      connectedByUserId: user.id,
    },
  });

  await saveConnectorConfig(companyId, "shopify", {
    authMethod: "api_key",
    shopDomain,
    shopName: shopInfo.name,
    apiVersion,
    scopes,
    clientId: parsed.clientId,
    clientSecret: parsed.clientSecret,
    accessToken: token.access_token,
  });

  revalidatePath("/connections");
}

export async function saveKlaviyoApiKeyConnection(formData: FormData) {
  const user = await requireAppManager();
  const companyId = requireCompanyId(user.companyId);
  const parsed = klaviyoConnectionSchema.parse({
    apiKey: formData.get("apiKey"),
    apiRevision: formData.get("apiRevision") || undefined,
  });
  const config: KlaviyoConfig = {
    apiKey: parsed.apiKey,
    apiRevision: normalizeKlaviyoRevision(
      parsed.apiRevision ?? KLAVIYO_DEFAULT_REVISION,
    ),
  };
  const test = await testKlaviyoConfig(config);

  if (!test.ok) {
    throw new Error(test.message ?? "Klaviyo connection failed.");
  }

  const metadata = (test.metadata ?? {}) as Partial<KlaviyoConfig>;

  await saveConnectorConfig(companyId, "klaviyo", {
    ...config,
    accountId: metadata.accountId,
    accountName: metadata.accountName ?? null,
    currency: metadata.currency ?? null,
    timezone: metadata.timezone ?? null,
  });

  revalidatePath("/connections");
}

export async function syncProductsAction(formData: FormData) {
  const user = await requireAppManager();
  const companyId = requireCompanyId(user.companyId);
  const connectionId = z.string().min(1).parse(formData.get("connectionId"));
  const connection = await getCompanyShopifyConnection(companyId, connectionId);
  await syncProductMirror(connection.id);
  revalidatePath("/connections");
}

export async function detectSignalsAction(formData: FormData) {
  const user = await requireAppManager();
  const companyId = requireCompanyId(user.companyId);
  const connectionId = z.string().min(1).parse(formData.get("connectionId"));
  const connection = await getCompanyShopifyConnection(companyId, connectionId);

  await prisma.shopifyConnection.update({
    where: { id: connection.id },
    data: {
      lastSignalDetectionStatus: "running",
      lastSignalDetectionError: null,
      lastSignalDetectionSummary: null,
    },
  });

  try {
    const result = await detectSignalsForConnection(connection.id);
    await prisma.shopifyConnection.update({
      where: { id: connection.id },
      data: {
        lastSignalDetectionAt: new Date(),
        lastSignalDetectionStatus: "completed",
        lastSignalDetectionSignalCount: result.signalCount,
        lastSignalDetectionSummary: signalDetectionSummary(result),
        lastSignalDetectionError: null,
      },
    });
  } catch (error) {
    await prisma.shopifyConnection.update({
      where: { id: connection.id },
      data: {
        lastSignalDetectionAt: new Date(),
        lastSignalDetectionStatus: "failed",
        lastSignalDetectionError:
          error instanceof Error ? error.message : "Unknown detection failure",
        lastSignalDetectionSummary: null,
      },
    });
  }

  revalidatePath("/today");
  revalidatePath("/signals");
  revalidatePath("/connections");
}

function signalDetectionSummary(result: {
  activeGiftCards: number;
  activeProductFindings: number;
  activeProducts: number;
  draftCatalog: number;
  productHealth: number;
  signalCount: number;
  scannedProducts: number;
}) {
  const activeCopy =
    result.activeProducts === 1
      ? "1 active product"
      : `${result.activeProducts} active products`;
  const base = `Scanned ${result.scannedProducts} mirrored products. Found ${activeCopy}.`;

  if (result.signalCount > 0) {
    const parts = [
      result.productHealth
        ? `${result.productHealth} active-product pattern ${pluralize(
            "Signal",
            result.productHealth,
          )} covering ${result.activeProductFindings} product ${pluralize(
            "finding",
            result.activeProductFindings,
          )}`
        : null,
      result.draftCatalog
        ? `${result.draftCatalog} draft-catalog ${pluralize(
            "Signal",
            result.draftCatalog,
          )}`
        : null,
    ].filter(Boolean);

    return `${base} Found ${result.signalCount} ${pluralize(
      "Signal",
      result.signalCount,
    )}${parts.length ? `: ${parts.join(", ")}.` : "."}`;
  }

  if (
    result.activeProducts > 0 &&
    result.activeProducts === result.activeGiftCards
  ) {
    return `${base} The only active product is a Gift Card, so Ora skipped product health and inventory checks. Found 0 Signals.`;
  }

  if (result.activeProducts === 0) {
    return `${base} Active-only detection found 0 eligible products, so no Signals were created.`;
  }

  return `${base} No active products matched the current Signal rules. Found 0 Signals.`;
}

function pluralize(label: string, count: number) {
  return count === 1 ? label : `${label}s`;
}

export async function disconnectShopifyAction(formData: FormData) {
  const user = await requireAppManager();
  const companyId = requireCompanyId(user.companyId);
  const connectionId = z.string().min(1).parse(formData.get("connectionId"));
  const connection = await getCompanyShopifyConnection(companyId, connectionId);
  const products = await prisma.productMirror.findMany({
    where: { shopifyConnectionId: connection.id },
    select: { shopifyProductId: true },
  });
  const productIds = products.map((product) => product.shopifyProductId);

  await prisma.$transaction([
    prisma.signal.deleteMany({
      where: {
        companyId,
        affectedObjectType: "store",
        affectedObjectId: connection.id,
      },
    }),
    ...(productIds.length
      ? [
          prisma.signal.deleteMany({
            where: {
              companyId,
              affectedObjectType: "product",
              affectedObjectId: { in: productIds },
            },
          }),
        ]
      : []),
    prisma.shopifyConnection.delete({ where: { id: connection.id } }),
  ]);
  await deleteConnector(companyId, "shopify");

  revalidatePath("/today");
  revalidatePath("/signals");
  revalidatePath("/connections");
}

export async function disconnectKlaviyoAction() {
  const user = await requireAppManager();
  const companyId = requireCompanyId(user.companyId);

  await deleteConnector(companyId, "klaviyo");

  revalidatePath("/connections");
}

function requireCompanyId(companyId: string | null) {
  if (!companyId) {
    throw new Error("Create a company before managing connections.");
  }

  return companyId;
}

async function getCompanyShopifyConnection(companyId: string, id: string) {
  return prisma.shopifyConnection.findFirstOrThrow({
    where: { id, companyId },
  });
}
