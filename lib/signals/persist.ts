import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  detectDraftCatalogSignals,
  detectProductHealthSignals,
  isGiftCardProduct,
} from "@/lib/signals/product-health";

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

    const hasRecommendation = await prisma.recommendation.findFirst({
      where: { signalId: signal.id },
    });

    if (hasRecommendation) {
      await prisma.recommendation.update({
        where: { id: hasRecommendation.id },
        data: {
          title: candidate.recommendationTitle,
          reasoning: candidate.recommendationReasoning,
          expectedImpact: candidate.expectedImpact,
          riskLevel: candidate.riskLevel,
          confidence: candidate.confidence,
        },
      });
    } else {
      await prisma.recommendation.create({
        data: {
          signalId: signal.id,
          title: candidate.recommendationTitle,
          reasoning: candidate.recommendationReasoning,
          expectedImpact: candidate.expectedImpact,
          riskLevel: candidate.riskLevel,
          confidence: candidate.confidence,
        },
      });
    }
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

    const hasRecommendation = await prisma.recommendation.findFirst({
      where: { signalId: signal.id },
    });

    if (!hasRecommendation) {
      await prisma.recommendation.create({
        data: {
          signalId: signal.id,
          title: candidate.recommendationTitle,
          reasoning: candidate.recommendationReasoning,
          expectedImpact: candidate.expectedImpact,
          riskLevel: candidate.riskLevel,
          confidence: candidate.confidence,
        },
      });
    }
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
    scannedProducts: products.length,
  };
}
