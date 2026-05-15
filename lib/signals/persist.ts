import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  detectDraftCatalogSignals,
  detectProductHealthSignals,
  isGiftCardProduct,
  type ProductHealthCandidate,
  type StoreCatalogCandidate,
} from "@/lib/signals/product-health";
import { buildStoreSignalActionPlan } from "@/lib/signals/action-plans";
import { syncCustomerLifecycleForConnection } from "@/lib/lifecycle/sync";
import {
  buildReviewOutcomeMetrics,
  reviewOutcomeStatusForDetection,
  summarizeReviewOutcomeScan,
} from "@/lib/signals/outcome-guidance";

type StoreSignalCandidate = ProductHealthCandidate | StoreCatalogCandidate;

const managedStoreSignalTypes = [
  "product_missing_important_metafields",
  "product_weak_health",
  "product_inventory_risk",
  "draft_products_ready_for_review",
  "draft_products_need_cleanup",
];

const legacyProductSignalTypes = [
  "product_missing_important_metafields",
  "product_weak_health",
  "product_inventory_risk",
];

export async function detectSignalsForConnection(shopifyConnectionId: string) {
  const connection = await prisma.shopifyConnection.findUniqueOrThrow({
    where: { id: shopifyConnectionId },
    select: { companyId: true },
  });
  const companyId = connection.companyId;
  const products = await prisma.productMirror.findMany({
    where: { shopifyConnectionId },
  });

  const activeProducts = products.filter((product) => product.status === "ACTIVE");
  const activeGiftCards = activeProducts.filter(isGiftCardProduct);
  const draftCatalog = detectDraftCatalogSignals(products);
  const productHealth = detectProductHealthSignals(products);
  const currentStoreSignalTypes = [
    ...productHealth.map((candidate) => candidate.type),
    ...draftCatalog.map((candidate) => candidate.type),
  ];
  const productIds = products.map((product) => product.shopifyProductId);

  if (productIds.length > 0) {
    await prisma.signal.deleteMany({
      where: {
        companyId,
        type: { in: legacyProductSignalTypes },
        affectedObjectType: "product",
        affectedObjectId: { in: productIds },
      },
    });
  }

  await prisma.signal.updateMany({
    where: {
      companyId,
      type: { in: managedStoreSignalTypes, notIn: currentStoreSignalTypes },
      affectedObjectType: "store",
      affectedObjectId: shopifyConnectionId,
      status: "open",
    },
    data: { status: "resolved" },
  });

  const outcomeScan = await reconcilePendingStoreReviewOutcomes({
    companyId,
    currentStoreSignalTypes,
    shopifyConnectionId,
  });

  for (const candidate of productHealth) {
    const signal = await prisma.signal.upsert({
      where: {
        companyId_type_affectedObjectType_affectedObjectId: {
          companyId,
          type: candidate.type,
          affectedObjectType: "store",
          affectedObjectId: shopifyConnectionId,
        },
      },
      update: {
        title: candidate.title,
        summary: candidate.summary,
        status: "open",
        severity: candidate.severity,
        category: candidate.category,
        confidence: candidate.confidence,
      },
      create: {
        companyId,
        type: candidate.type,
        title: candidate.title,
        summary: candidate.summary,
        status: "open",
        severity: candidate.severity,
        category: candidate.category,
        affectedObjectType: "store",
        affectedObjectId: shopifyConnectionId,
        confidence: candidate.confidence,
      },
    });

    await prisma.signalEvidence.create({
      data: {
        signalId: signal.id,
        provider: "shopify",
        evidenceType: candidate.type,
        displayText: candidate.evidenceText,
        rawPayload: candidate.rawPayload as Prisma.InputJsonValue,
      },
    });

    await prisma.signalEvidence.create({
      data: {
        signalId: signal.id,
        provider: "system",
        evidenceType: "affected_group",
        displayText: candidate.affectedGroup,
        rawPayload: { shopifyConnectionId },
      },
    });

    const recommendation = await upsertStoreRecommendation(signal.id, candidate);
    await upsertStoreActionPlan({
      candidate,
      recommendationId: recommendation.id,
      shopifyConnectionId,
      signalId: signal.id,
    });
  }

  for (const candidate of draftCatalog) {
    const signal = await prisma.signal.upsert({
      where: {
        companyId_type_affectedObjectType_affectedObjectId: {
          companyId,
          type: candidate.type,
          affectedObjectType: "store",
          affectedObjectId: shopifyConnectionId,
        },
      },
      update: {
        title: candidate.title,
        summary: candidate.summary,
        status: "open",
        severity: candidate.severity,
        category: candidate.category,
        confidence: candidate.confidence,
      },
      create: {
        companyId,
        type: candidate.type,
        title: candidate.title,
        summary: candidate.summary,
        status: "open",
        severity: candidate.severity,
        category: candidate.category,
        affectedObjectType: "store",
        affectedObjectId: shopifyConnectionId,
        confidence: candidate.confidence,
      },
    });

    await prisma.signalEvidence.create({
      data: {
        signalId: signal.id,
        provider: "shopify",
        evidenceType: candidate.type,
        displayText: candidate.evidenceText,
        rawPayload: candidate.rawPayload as Prisma.InputJsonValue,
      },
    });

    await prisma.signalEvidence.create({
      data: {
        signalId: signal.id,
        provider: "system",
        evidenceType: "affected_group",
        displayText: candidate.affectedGroup,
        rawPayload: { shopifyConnectionId },
      },
    });

    const recommendation = await upsertStoreRecommendation(signal.id, candidate);
    await upsertStoreActionPlan({
      candidate,
      recommendationId: recommendation.id,
      shopifyConnectionId,
      signalId: signal.id,
    });
  }

  let lifecycleResult: Awaited<
    ReturnType<typeof syncCustomerLifecycleForConnection>
  > | null = null;
  let lifecycleError: string | null = null;

  try {
    lifecycleResult = await syncCustomerLifecycleForConnection(shopifyConnectionId);
  } catch (error) {
    lifecycleError =
      error instanceof Error
        ? error.message
        : "Customer lifecycle detection failed.";
  }

  return {
    activeGiftCards: activeGiftCards.length,
    activeProducts: activeProducts.length,
    activeProductFindings: productHealth.reduce(
      (sum, candidate) => sum + Number(candidate.rawPayload.count ?? 0),
      0,
    ),
    draftCatalog: draftCatalog.length,
    productHealth: productHealth.length,
    signalCount: productHealth.length + draftCatalog.length,
    customerLifecycleError: lifecycleError,
    customerLifecycleSignals: lifecycleResult?.candidates ?? 0,
    customersClassified: lifecycleResult?.purchasingCustomers ?? 0,
    customersFetched: lifecycleResult?.customersFetched ?? 0,
    lifecycleCounts: lifecycleResult?.counts ?? null,
    outcomeNoChange: outcomeScan.noChange,
    outcomesResolved: outcomeScan.resolved,
    signalCountWithLifecycle:
      productHealth.length + draftCatalog.length + (lifecycleResult?.candidates ?? 0),
    scannedProducts: products.length,
  };
}

async function reconcilePendingStoreReviewOutcomes({
  companyId,
  currentStoreSignalTypes,
  shopifyConnectionId,
}: {
  companyId: string;
  currentStoreSignalTypes: string[];
  shopifyConnectionId: string;
}) {
  const currentTypes = new Set(currentStoreSignalTypes);
  const pendingOutcomes = await prisma.outcome.findMany({
    where: {
      status: { in: ["pending", "no_change", "worsened"] },
      signal: {
        companyId,
        affectedObjectType: "store",
        affectedObjectId: shopifyConnectionId,
        status: { not: "ignored" },
        type: { in: managedStoreSignalTypes },
      },
      actionPlan: {
        provider: "ora",
        executions: {
          some: {
            status: "success",
            toolName: "ora_prepare_operator_review_batch",
          },
        },
      },
    },
    include: {
      signal: {
        select: {
          id: true,
          type: true,
        },
      },
    },
  });
  const measuredAt = new Date();
  let noChange = 0;
  let resolved = 0;

  for (const outcome of pendingOutcomes) {
    const stillDetected = currentTypes.has(outcome.signal.type);
    const status = reviewOutcomeStatusForDetection(stillDetected);

    if (stillDetected) {
      noChange += 1;
    } else {
      resolved += 1;
    }

    await prisma.$transaction([
      prisma.outcome.update({
        where: { id: outcome.id },
        data: {
          measuredAt,
          metricsJson: buildReviewOutcomeMetrics({
            measuredAt,
            previousMetrics: outcome.metricsJson,
            signalType: outcome.signal.type,
            stillDetected,
          }) as Prisma.InputJsonValue,
          status,
          summary: summarizeReviewOutcomeScan(stillDetected),
        },
      }),
      prisma.signal.update({
        where: { id: outcome.signalId },
        data: {
          status: stillDetected ? "open" : "resolved",
        },
      }),
    ]);
  }

  return { noChange, resolved };
}

async function upsertStoreRecommendation(
  signalId: string,
  candidate: StoreSignalCandidate,
) {
  const existing = await prisma.recommendation.findFirst({
    where: { signalId },
  });

  if (existing) {
    return prisma.recommendation.update({
      where: { id: existing.id },
      data: {
        title: candidate.recommendationTitle,
        reasoning: candidate.recommendationReasoning,
        expectedImpact: candidate.expectedImpact,
        riskLevel: candidate.riskLevel,
        confidence: candidate.confidence,
      },
    });
  }

  return prisma.recommendation.create({
    data: {
      signalId,
      title: candidate.recommendationTitle,
      reasoning: candidate.recommendationReasoning,
      expectedImpact: candidate.expectedImpact,
      riskLevel: candidate.riskLevel,
      confidence: candidate.confidence,
    },
  });
}

async function upsertStoreActionPlan({
  candidate,
  recommendationId,
  shopifyConnectionId,
  signalId,
}: {
  candidate: StoreSignalCandidate;
  recommendationId: string;
  shopifyConnectionId: string;
  signalId: string;
}) {
  const plan = buildStoreSignalActionPlan(candidate, shopifyConnectionId);
  const existing = await prisma.actionPlan.findFirst({
    where: {
      signalId,
      actionType: plan.actionType,
      provider: plan.provider,
    },
    orderBy: { createdAt: "desc" },
    include: {
      approval: true,
      outcomes: { orderBy: { measuredAt: "desc" }, take: 1 },
    },
  });

  if (existing?.approval || existing?.status === "executed") {
    return existing;
  }

  if (existing) {
    return prisma.actionPlan.update({
      where: { id: existing.id },
      data: {
        recommendationId,
        status: "approval_required",
        previewPayload: plan.previewPayload as Prisma.InputJsonValue,
        executionPayload: plan.executionPayload as Prisma.InputJsonValue,
      },
    });
  }

  return prisma.actionPlan.create({
    data: {
      signalId,
      recommendationId,
      actionType: plan.actionType,
      provider: plan.provider,
      status: "approval_required",
      previewPayload: plan.previewPayload as Prisma.InputJsonValue,
      executionPayload: plan.executionPayload as Prisma.InputJsonValue,
    },
  });
}
