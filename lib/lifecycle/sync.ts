import { hashApprovalPayload } from "@/lib/approval/hash";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { classifyCustomers } from "@/lib/lifecycle/classifier";
import {
  buildLifecycleSnapshotCounts,
  detectCustomerLifecycleSignals,
} from "@/lib/lifecycle/signals";
import type {
  CustomerLifecycleInput,
  LifecycleSignalCandidate,
} from "@/lib/lifecycle/types";
import { fetchAllCustomers } from "@/lib/shopify/client";

const managedLifecycleSignalTypes = [
  "customer_at_risk_segment_growing",
  "customer_churned_segment_growing",
  "customer_first_time_buyers_aging_out",
  "customer_repeat_buyers_newly_at_risk",
  "customer_new_customers_not_repeating",
  "customer_vip_at_risk",
  "customer_vip_churned",
  "customer_high_aov_at_risk",
  "customer_high_aov_churned",
];

export async function syncCustomerLifecycleForConnection(
  shopifyConnectionId: string,
) {
  const connection = await prisma.shopifyConnection.findUniqueOrThrow({
    where: { id: shopifyConnectionId },
  });
  const companyId = connection.companyId;
  const existingProfiles = await prisma.customerLifecycleProfile.findMany({
    where: { shopifyConnectionId },
    select: {
      shopifyCustomerId: true,
      lifecycleStage: true,
      previousStage: true,
      stageChangedAt: true,
    },
  });
  const existingByCustomerId = new Map(
    existingProfiles.map((profile) => [profile.shopifyCustomerId, profile]),
  );
  const rawCustomers = await fetchAllCustomers({
    shopDomain: connection.shopDomain,
    authMethod: connection.authMethod,
    encryptedAccessToken: connection.encryptedAccessToken,
    apiClientId: connection.apiClientId,
    encryptedApiClientSecret: connection.encryptedApiClientSecret,
    apiVersion: connection.apiVersion,
  });
  const lifecycleInputs: CustomerLifecycleInput[] = rawCustomers.map((customer) => {
    const existing = existingByCustomerId.get(customer.shopifyCustomerId);

    return {
      ...customer,
      previousStage: existing?.lifecycleStage as CustomerLifecycleInput["previousStage"],
    };
  });
  const classifiedAt = new Date();
  const profiles = classifyCustomers(lifecycleInputs, classifiedAt);

  for (const profile of profiles) {
    const existing = existingByCustomerId.get(profile.shopifyCustomerId);
    const stageChanged = Boolean(profile.stageChangedAt);
    const previousStage = stageChanged
      ? profile.previousStage
      : existing?.previousStage ?? null;
    const stageChangedAt = stageChanged
      ? profile.stageChangedAt
      : existing?.stageChangedAt ?? null;

    await prisma.customerLifecycleProfile.upsert({
      where: {
        shopifyConnectionId_shopifyCustomerId: {
          shopifyConnectionId,
          shopifyCustomerId: profile.shopifyCustomerId,
        },
      },
      update: {
        email: profile.email,
        name: profile.name,
        lifecycleStage: profile.lifecycleStage,
        lifecycleTags: profile.lifecycleTags,
        orderCount: profile.orderCount,
        totalSpentCents: profile.totalSpentCents,
        currency: profile.currency,
        firstOrderAt: profile.firstOrderAt,
        lastOrderAt: profile.lastOrderAt,
        avgOrderValueCents: profile.avgOrderValueCents,
        previousStage,
        stageChangedAt,
        classifiedAt: profile.classifiedAt,
        rawJson: profile.rawJson as Prisma.InputJsonValue,
      },
      create: {
        companyId,
        shopifyConnectionId,
        shopifyCustomerId: profile.shopifyCustomerId,
        email: profile.email,
        name: profile.name,
        lifecycleStage: profile.lifecycleStage,
        lifecycleTags: profile.lifecycleTags,
        orderCount: profile.orderCount,
        totalSpentCents: profile.totalSpentCents,
        currency: profile.currency,
        firstOrderAt: profile.firstOrderAt,
        lastOrderAt: profile.lastOrderAt,
        avgOrderValueCents: profile.avgOrderValueCents,
        previousStage: null,
        stageChangedAt: null,
        classifiedAt: profile.classifiedAt,
        rawJson: profile.rawJson as Prisma.InputJsonValue,
      },
    });
  }

  const sweepDate = classifiedAt.toISOString().slice(0, 10);
  const previousSnapshot = await prisma.customerLifecycleSnapshot.findFirst({
    where: {
      shopifyConnectionId,
      sweepDate: { not: sweepDate },
    },
    orderBy: { createdAt: "desc" },
  });
  const counts = buildLifecycleSnapshotCounts(profiles);

  await prisma.customerLifecycleSnapshot.upsert({
    where: {
      shopifyConnectionId_sweepDate: {
        shopifyConnectionId,
        sweepDate,
      },
    },
    update: {
      totalCustomers: counts.totalCustomers,
      newCount: counts.newCount,
      activeRepeatCount: counts.activeRepeatCount,
      atRiskCount: counts.atRiskCount,
      churnedCount: counts.churnedCount,
      vipCount: counts.vipCount,
      highAovCount: counts.highAovCount,
      totalRevenueCents: counts.totalRevenueCents,
      tagCountsJson: {
        vip: counts.vipCount,
        high_aov: counts.highAovCount,
      },
    },
    create: {
      companyId,
      shopifyConnectionId,
      sweepDate,
      totalCustomers: counts.totalCustomers,
      newCount: counts.newCount,
      activeRepeatCount: counts.activeRepeatCount,
      atRiskCount: counts.atRiskCount,
      churnedCount: counts.churnedCount,
      vipCount: counts.vipCount,
      highAovCount: counts.highAovCount,
      totalRevenueCents: counts.totalRevenueCents,
      tagCountsJson: {
        vip: counts.vipCount,
        high_aov: counts.highAovCount,
      },
    },
  });

  const candidates = detectCustomerLifecycleSignals({
    profiles,
    previousSnapshot,
    shopifyConnectionId,
  });

  await persistLifecycleSignals({
    candidates,
    companyId,
    shopifyConnectionId,
  });

  return {
    candidates: candidates.length,
    customersFetched: rawCustomers.length,
    purchasingCustomers: profiles.length,
    counts,
  };
}

async function persistLifecycleSignals({
  candidates,
  companyId,
  shopifyConnectionId,
}: {
  candidates: LifecycleSignalCandidate[];
  companyId: string;
  shopifyConnectionId: string;
}) {
  const currentTypes = candidates.map((candidate) => candidate.type);

  await prisma.signal.updateMany({
    where: {
      companyId,
      type: { in: managedLifecycleSignalTypes, notIn: currentTypes },
      affectedObjectType: "customer_segment",
      status: "open",
    },
    data: { status: "resolved" },
  });

  for (const candidate of candidates) {
    const groupKey = lifecycleGroupKey(shopifyConnectionId, candidate.type);
    const signal = await prisma.signal.upsert({
      where: {
        companyId_type_affectedObjectType_affectedObjectId: {
          companyId,
          type: candidate.type,
          affectedObjectType: "customer_segment",
          affectedObjectId: groupKey,
        },
      },
      update: {
        title: candidate.title,
        summary: candidate.summary,
        status: "open",
        severity: candidate.severity,
        category: "customer",
        impactEstimateCents: candidate.estimatedRevenueCents,
        confidence: candidate.confidence,
      },
      create: {
        companyId,
        type: candidate.type,
        title: candidate.title,
        summary: candidate.summary,
        status: "open",
        severity: candidate.severity,
        category: "customer",
        affectedObjectType: "customer_segment",
        affectedObjectId: groupKey,
        impactEstimateCents: candidate.estimatedRevenueCents,
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
        evidenceType: "customer_group",
        displayText: `${candidate.groupName}: ${candidate.groupDescription}`,
        rawPayload: {
          groupKey,
          shopifyConnectionId,
          memberCount: candidate.affectedCount,
        },
      },
    });

    const group = await prisma.customerGroup.upsert({
      where: {
        companyId_groupKey: {
          companyId,
          groupKey,
        },
      },
      update: {
        signalId: signal.id,
        name: candidate.groupName,
        description: candidate.groupDescription,
        definitionJson: candidate.groupDefinition as Prisma.InputJsonValue,
        membersJson: candidate.members as Prisma.InputJsonValue,
        memberCount: candidate.affectedCount,
        estimatedRevenueCents: candidate.estimatedRevenueCents,
        status: "ready",
        builtAt: new Date(),
      },
      create: {
        companyId,
        signalId: signal.id,
        groupKey,
        name: candidate.groupName,
        description: candidate.groupDescription,
        definitionJson: candidate.groupDefinition as Prisma.InputJsonValue,
        membersJson: candidate.members as Prisma.InputJsonValue,
        memberCount: candidate.affectedCount,
        estimatedRevenueCents: candidate.estimatedRevenueCents,
        status: "ready",
        builtAt: new Date(),
      },
    });

    const recommendation = await upsertRecommendation(signal.id, candidate);
    await upsertActionPlan({
      candidate,
      customerGroupId: group.id,
      recommendationId: recommendation.id,
      signalId: signal.id,
    });
  }
}

async function upsertRecommendation(
  signalId: string,
  candidate: LifecycleSignalCandidate,
) {
  const existing = await prisma.recommendation.findFirst({
    where: { signalId },
  });

  if (existing) {
    return prisma.recommendation.update({
      where: { id: existing.id },
      data: {
        title: candidate.recommendation.title,
        reasoning: candidate.recommendation.reasoning,
        expectedImpact: candidate.recommendation.expectedImpact,
        riskLevel: candidate.recommendation.riskLevel,
        confidence: candidate.confidence,
      },
    });
  }

  return prisma.recommendation.create({
    data: {
      signalId,
      title: candidate.recommendation.title,
      reasoning: candidate.recommendation.reasoning,
      expectedImpact: candidate.recommendation.expectedImpact,
      riskLevel: candidate.recommendation.riskLevel,
      confidence: candidate.confidence,
    },
  });
}

async function upsertActionPlan({
  candidate,
  customerGroupId,
  recommendationId,
  signalId,
}: {
  candidate: LifecycleSignalCandidate;
  customerGroupId: string;
  recommendationId: string;
  signalId: string;
}) {
  const previewPayload = {
    ...candidate.recommendation.previewPayload,
    customerGroupId,
  };
  const rawExecutionArgs = candidate.recommendation.executionPayload.args;
  const executionArgs =
    rawExecutionArgs && typeof rawExecutionArgs === "object" && !Array.isArray(rawExecutionArgs)
      ? rawExecutionArgs
      : {};
  const executionPayload = {
    ...candidate.recommendation.executionPayload,
    args: {
      ...executionArgs,
      customerGroupId,
    },
  };
  const existing = await prisma.actionPlan.findFirst({
    where: {
      signalId,
      actionType: candidate.recommendation.actionType,
      provider: candidate.recommendation.provider,
    },
    orderBy: { createdAt: "desc" },
    include: { approval: true },
  });

  if (existing && ["draft", "approval_required", "failed"].includes(existing.status)) {
    return prisma.actionPlan.update({
      where: { id: existing.id },
      data: {
        recommendationId,
        status: "approval_required",
        previewPayload: previewPayload as Prisma.InputJsonValue,
        executionPayload: executionPayload as Prisma.InputJsonValue,
      },
    });
  }

  if (existing?.approval) {
    const approvedHash = existing.approval.approvalPayloadHash;
    const currentHash = hashApprovalPayload(executionPayload);

    if (approvedHash === currentHash) return existing;
  }

  return prisma.actionPlan.create({
    data: {
      signalId,
      recommendationId,
      actionType: candidate.recommendation.actionType,
      provider: candidate.recommendation.provider,
      status: "approval_required",
      previewPayload: previewPayload as Prisma.InputJsonValue,
      executionPayload: executionPayload as Prisma.InputJsonValue,
    },
  });
}

function lifecycleGroupKey(shopifyConnectionId: string, type: string) {
  return `customer_group:${shopifyConnectionId}:${type}`;
}
