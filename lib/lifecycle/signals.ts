import type {
  ClassifiedCustomer,
  CustomerGroupMemberSnapshot,
  CustomerLifecycleTag,
  LifecycleActionRecommendation,
  LifecycleSignalCandidate,
  LifecycleSignalType,
  LifecycleSnapshotCounts,
} from "@/lib/lifecycle/types";

type PreviousSnapshot = Partial<
  Pick<LifecycleSnapshotCounts, "atRiskCount" | "churnedCount">
> | null;

type SignalRule = {
  type: LifecycleSignalType;
  title: (count: number) => string;
  summary: string;
  groupName: string;
  groupDescription: string;
  definition: Record<string, unknown>;
  select: (profile: ClassifiedCustomer) => boolean;
  minCount: number;
  minEstimatedRevenueCents?: number;
  recommendation: Omit<
    LifecycleActionRecommendation,
    "previewPayload" | "executionPayload"
  >;
};

export function buildLifecycleSnapshotCounts(
  profiles: ClassifiedCustomer[],
): LifecycleSnapshotCounts {
  return {
    totalCustomers: profiles.length,
    newCount: profiles.filter((profile) => profile.lifecycleStage === "new").length,
    activeRepeatCount: profiles.filter(
      (profile) => profile.lifecycleStage === "active_repeat",
    ).length,
    atRiskCount: profiles.filter(
      (profile) => profile.lifecycleStage === "at_risk",
    ).length,
    churnedCount: profiles.filter(
      (profile) => profile.lifecycleStage === "churned",
    ).length,
    vipCount: profiles.filter((profile) => hasTag(profile, "vip")).length,
    highAovCount: profiles.filter((profile) => hasTag(profile, "high_aov")).length,
    totalRevenueCents: profiles.reduce(
      (sum, profile) => sum + profile.totalSpentCents,
      0,
    ),
  };
}

export function detectCustomerLifecycleSignals({
  profiles,
  previousSnapshot,
  shopifyConnectionId,
}: {
  profiles: ClassifiedCustomer[];
  previousSnapshot?: PreviousSnapshot;
  shopifyConnectionId: string;
}) {
  const counts = buildLifecycleSnapshotCounts(profiles);
  const candidates = lifecycleRules
    .map((rule) => buildCandidate(rule, profiles, counts, shopifyConnectionId))
    .filter(isPresent);

  const atRiskGrowth =
    previousSnapshot?.atRiskCount == null
      ? 0
      : counts.atRiskCount - previousSnapshot.atRiskCount;
  if (atRiskGrowth >= 3) {
    const members = profiles.filter(
      (profile) => profile.lifecycleStage === "at_risk",
    );
    const candidate = buildCandidate(
      {
        ...growthRule("customer_at_risk_segment_growing", "at-risk", atRiskGrowth),
        select: (profile) => profile.lifecycleStage === "at_risk",
        definition: { stages: ["at_risk"], grewBy: atRiskGrowth },
      },
      members,
      counts,
      shopifyConnectionId,
    );
    if (candidate) candidates.push(candidate);
  }

  const churnedGrowth =
    previousSnapshot?.churnedCount == null
      ? 0
      : counts.churnedCount - previousSnapshot.churnedCount;
  if (churnedGrowth >= 3) {
    const members = profiles.filter(
      (profile) => profile.lifecycleStage === "churned",
    );
    const candidate = buildCandidate(
      {
        ...growthRule("customer_churned_segment_growing", "churned", churnedGrowth),
        select: (profile) => profile.lifecycleStage === "churned",
        definition: { stages: ["churned"], grewBy: churnedGrowth },
      },
      members,
      counts,
      shopifyConnectionId,
    );
    if (candidate) candidates.push(candidate);
  }

  return candidates.sort(
    (a, b) =>
      severityRank[b.severity] - severityRank[a.severity] ||
      b.estimatedRevenueCents - a.estimatedRevenueCents ||
      b.affectedCount - a.affectedCount,
  );
}

function buildCandidate(
  rule: SignalRule,
  profiles: ClassifiedCustomer[],
  counts: LifecycleSnapshotCounts,
  shopifyConnectionId: string,
): LifecycleSignalCandidate | null {
  const members = profiles.filter(rule.select);
  const affectedCount = members.length;
  const estimatedRevenueCents = estimateRecoveryValueCents(members);

  if (
    affectedCount < rule.minCount &&
    estimatedRevenueCents < (rule.minEstimatedRevenueCents ?? Number.MAX_SAFE_INTEGER)
  ) {
    return null;
  }

  const memberSnapshots = members.map(toMemberSnapshot);
  const previewPayload = {
    provider: rule.recommendation.provider,
    channel: rule.recommendation.channel,
    actionType: rule.recommendation.actionType,
    customerGroup: {
      shopifyConnectionId,
      definition: rule.definition,
      memberCount: affectedCount,
      estimatedRevenueCents,
      sampleMembers: memberSnapshots.slice(0, 5),
    },
    proposedAction: {
      title: rule.recommendation.title,
      expectedImpact: rule.recommendation.expectedImpact,
      riskLevel: rule.recommendation.riskLevel,
    },
  };
  const executionPayload = {
    provider: rule.recommendation.provider,
    toolName: `${rule.recommendation.provider}_prepare_${rule.recommendation.actionType}`,
    args: {
      shopifyConnectionId,
      signalType: rule.type,
      actionType: rule.recommendation.actionType,
      channel: rule.recommendation.channel,
      customerIds: memberSnapshots.map((member) => member.shopifyCustomerId),
      customerEmails: memberSnapshots
        .map((member) => member.email)
        .filter(Boolean),
      definition: rule.definition,
    },
  };

  return {
    type: rule.type,
    title: rule.title(affectedCount),
    summary: rule.summary,
    evidenceText: evidenceText(rule.type, affectedCount, estimatedRevenueCents, counts),
    groupName: rule.groupName,
    groupDescription: rule.groupDescription,
    groupDefinition: rule.definition,
    members: memberSnapshots,
    affectedCount,
    estimatedRevenueCents,
    severity: severityFor(rule.type, affectedCount, estimatedRevenueCents),
    confidence: confidenceFor(rule.type, affectedCount),
    rawPayload: {
      count: affectedCount,
      estimatedRevenueCents,
      lifecycleCounts: counts,
      groupDefinition: rule.definition,
      examples: memberSnapshots.slice(0, 10),
    },
    recommendation: {
      ...rule.recommendation,
      previewPayload,
      executionPayload,
    },
  };
}

function growthRule(
  type: LifecycleSignalType,
  stageLabel: string,
  growth: number,
): SignalRule {
  return {
    type,
    title: (count) =>
      `${count} ${stageLabel} customers need lifecycle review`,
    summary: `The ${stageLabel} customer group grew by ${growth} customers since the previous lifecycle snapshot.`,
    groupName: `${stageLabel[0]?.toUpperCase()}${stageLabel.slice(1)} customers`,
    groupDescription: `Customers currently classified as ${stageLabel}.`,
    definition: { stages: [stageLabel] },
    select: () => true,
    minCount: 3,
    recommendation: {
      provider: "klaviyo",
      channel: "klaviyo_campaign",
      actionType: "lifecycle_recovery_campaign",
      title: `Prepare ${stageLabel} customer recovery campaign`,
      reasoning:
        "The group is growing, so Ora should prepare one focused reactivation plan instead of treating each customer separately.",
      expectedImpact:
        "A grouped recovery action can address the segment before more customers lapse.",
      riskLevel: "medium",
    },
  };
}

const lifecycleRules: SignalRule[] = [
  {
    type: "customer_vip_at_risk",
    title: (count) => `${count} VIP customers are becoming at-risk`,
    summary:
      "High-value customers have not purchased recently enough to stay confidently active.",
    groupName: "At-risk VIP customers",
    groupDescription:
      "Customers tagged VIP whose last order places them in the at-risk lifecycle stage.",
    definition: { stages: ["at_risk"], tagsAll: ["vip"] },
    select: (profile) =>
      profile.lifecycleStage === "at_risk" && hasTag(profile, "vip"),
    minCount: 3,
    minEstimatedRevenueCents: 100_000,
    recommendation: {
      provider: "klaviyo",
      channel: "klaviyo_campaign",
      actionType: "vip_retention_campaign",
      title: "Prepare VIP retention outreach",
      reasoning:
        "VIP customers deserve a low-volume, high-care action before they fully churn.",
      expectedImpact:
        "Protects high-value customer relationships and gives the operator a concrete recovery batch.",
      riskLevel: "medium",
    },
  },
  {
    type: "customer_vip_churned",
    title: (count) => `${count} VIP customers have churned`,
    summary:
      "VIP customers have crossed the churn threshold and should be reviewed as one high-value recovery group.",
    groupName: "Churned VIP customers",
    groupDescription:
      "Customers tagged VIP whose last order places them in the churned lifecycle stage.",
    definition: { stages: ["churned"], tagsAll: ["vip"] },
    select: (profile) =>
      profile.lifecycleStage === "churned" && hasTag(profile, "vip"),
    minCount: 3,
    minEstimatedRevenueCents: 150_000,
    recommendation: {
      provider: "klaviyo",
      channel: "klaviyo_campaign",
      actionType: "vip_winback_campaign",
      title: "Prepare VIP winback offer",
      reasoning:
        "This is a small enough group for careful copy and large enough to deserve action.",
      expectedImpact:
        "Can recover revenue from customers who have already shown high buying intent.",
      riskLevel: "medium",
    },
  },
  {
    type: "customer_high_aov_at_risk",
    title: (count) => `${count} high-AOV customers are at-risk`,
    summary:
      "Customers with above-normal average order value are drifting out of active purchase behavior.",
    groupName: "At-risk high-AOV customers",
    groupDescription:
      "High-AOV non-VIP customers currently classified as at-risk.",
    definition: { stages: ["at_risk"], tagsAll: ["high_aov"], tagsNone: ["vip"] },
    select: (profile) =>
      profile.lifecycleStage === "at_risk" &&
      hasTag(profile, "high_aov") &&
      !hasTag(profile, "vip"),
    minCount: 5,
    recommendation: {
      provider: "klaviyo",
      channel: "klaviyo_campaign",
      actionType: "high_aov_retention_campaign",
      title: "Prepare high-AOV retention campaign",
      reasoning:
        "These customers may not be VIPs by total spend yet, but their basket quality is worth protecting.",
      expectedImpact:
        "Targets customers who can move revenue meaningfully without broad discounting.",
      riskLevel: "low",
    },
  },
  {
    type: "customer_high_aov_churned",
    title: (count) => `${count} high-AOV customers have churned`,
    summary:
      "Customers with strong basket value have gone past the churn threshold.",
    groupName: "Churned high-AOV customers",
    groupDescription:
      "High-AOV non-VIP customers currently classified as churned.",
    definition: { stages: ["churned"], tagsAll: ["high_aov"], tagsNone: ["vip"] },
    select: (profile) =>
      profile.lifecycleStage === "churned" &&
      hasTag(profile, "high_aov") &&
      !hasTag(profile, "vip"),
    minCount: 5,
    recommendation: {
      provider: "klaviyo",
      channel: "klaviyo_campaign",
      actionType: "high_aov_winback_campaign",
      title: "Prepare high-AOV winback campaign",
      reasoning:
        "The group is commercially meaningful and should get a specific winback angle.",
      expectedImpact:
        "Can recover customers who historically bought larger baskets.",
      riskLevel: "medium",
    },
  },
  {
    type: "customer_first_time_buyers_aging_out",
    title: (count) => `${count} first-time buyers are aging out`,
    summary:
      "Single-order customers have not returned quickly enough to remain in a healthy first-purchase window.",
    groupName: "First-time buyers aging out",
    groupDescription:
      "Single-order customers now classified as at-risk.",
    definition: { stages: ["at_risk"], minOrderCount: 1, maxOrderCount: 1 },
    select: (profile) =>
      profile.lifecycleStage === "at_risk" && profile.orderCount === 1,
    minCount: 8,
    recommendation: {
      provider: "klaviyo",
      channel: "klaviyo_flow",
      actionType: "second_order_nudge",
      title: "Prepare second-order nudge",
      reasoning:
        "The group has already bought once, so the next useful action is a focused reason to come back.",
      expectedImpact:
        "Improves the chance that first-time buyers become repeat customers.",
      riskLevel: "low",
    },
  },
  {
    type: "customer_repeat_buyers_newly_at_risk",
    title: (count) => `${count} repeat buyers newly became at-risk`,
    summary:
      "Customers who were previously active repeat buyers just moved into the at-risk stage.",
    groupName: "Repeat buyers newly at-risk",
    groupDescription:
      "Repeat buyers whose lifecycle stage changed from active repeat to at-risk.",
    definition: {
      stages: ["at_risk"],
      previousStages: ["active_repeat"],
      minOrderCount: 2,
    },
    select: (profile) =>
      profile.lifecycleStage === "at_risk" &&
      profile.previousStage === "active_repeat" &&
      profile.orderCount >= 2,
    minCount: 3,
    recommendation: {
      provider: "klaviyo",
      channel: "klaviyo_campaign",
      actionType: "repeat_buyer_reactivation",
      title: "Prepare repeat-buyer reactivation batch",
      reasoning:
        "These customers were active recently enough that a timely grouped action is still plausible.",
      expectedImpact:
        "Catches lapsing repeat buyers while the relationship is still warm.",
      riskLevel: "low",
    },
  },
  {
    type: "customer_new_customers_not_repeating",
    title: (count) => `${count} new customers need a repeat-purchase path`,
    summary:
      "The store has a meaningful group of new customers, but repeat purchase momentum is thin.",
    groupName: "New customers without repeat momentum",
    groupDescription:
      "New single-order customers who need a clear next-purchase path.",
    definition: { stages: ["new"], minOrderCount: 1, maxOrderCount: 1 },
    select: (profile) =>
      profile.lifecycleStage === "new" && profile.orderCount === 1,
    minCount: 10,
    recommendation: {
      provider: "klaviyo",
      channel: "klaviyo_flow",
      actionType: "post_purchase_repeat_path",
      title: "Prepare post-purchase repeat path",
      reasoning:
        "The group should be handled together with a clear second-purchase journey.",
      expectedImpact:
        "Builds a repeat-purchase system before new customers age into at-risk status.",
      riskLevel: "low",
    },
  },
];

const severityRank = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function evidenceText(
  type: LifecycleSignalType,
  count: number,
  estimatedRevenueCents: number,
  counts: LifecycleSnapshotCounts,
) {
  const estimated = Math.round(estimatedRevenueCents / 100);

  return [
    `${count} customers matched ${type.replaceAll("_", " ")}.`,
    `Current lifecycle mix: ${counts.newCount} new, ${counts.activeRepeatCount} active repeat, ${counts.atRiskCount} at-risk, ${counts.churnedCount} churned.`,
    estimated > 0 ? `Estimated recoverable value is about ${estimated}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function estimateRecoveryValueCents(members: ClassifiedCustomer[]) {
  return Math.round(
    members.reduce((sum, member) => {
      const recoveryRate =
        member.lifecycleStage === "churned" || member.lifecycleStage === "at_risk"
          ? 0.05
          : 0.1;

      return sum + member.totalSpentCents * recoveryRate;
    }, 0),
  );
}

function severityFor(
  type: LifecycleSignalType,
  count: number,
  estimatedRevenueCents: number,
): "low" | "medium" | "high" | "critical" {
  if (
    type === "customer_vip_churned" &&
    (count >= 20 || estimatedRevenueCents >= 1_000_000)
  ) {
    return "critical";
  }

  if (
    type.includes("vip") ||
    count >= 25 ||
    estimatedRevenueCents >= 250_000
  ) {
    return "high";
  }

  return count >= 5 ? "medium" : "low";
}

function confidenceFor(type: LifecycleSignalType, count: number) {
  if (type.includes("newly")) return count >= 8 ? 0.82 : 0.76;
  if (type.includes("growing")) return count >= 20 ? 0.84 : 0.78;
  if (type.includes("vip")) return 0.86;

  return 0.8;
}

function toMemberSnapshot(
  profile: ClassifiedCustomer,
): CustomerGroupMemberSnapshot {
  return {
    shopifyCustomerId: profile.shopifyCustomerId,
    email: profile.email ?? null,
    name: profile.name ?? null,
    lifecycleStage: profile.lifecycleStage,
    lifecycleTags: profile.lifecycleTags,
    orderCount: profile.orderCount,
    totalSpentCents: profile.totalSpentCents,
    currency: profile.currency,
    lastOrderAt: profile.lastOrderAt?.toISOString() ?? null,
    previousStage: profile.previousStage ?? null,
  };
}

function hasTag(
  profile: Pick<ClassifiedCustomer, "lifecycleTags">,
  tag: CustomerLifecycleTag,
) {
  return profile.lifecycleTags.includes(tag);
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
