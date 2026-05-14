export type CustomerLifecycleStage =
  | "new"
  | "active_repeat"
  | "at_risk"
  | "churned";

export type CustomerLifecycleTag = "vip" | "high_aov";

export type CustomerLifecycleInput = {
  shopifyCustomerId: string;
  email?: string | null;
  name?: string | null;
  orderCount: number;
  totalSpentCents: number;
  currency: string;
  firstOrderAt?: Date | null;
  lastOrderAt?: Date | null;
  previousStage?: CustomerLifecycleStage | null;
  rawJson?: unknown;
};

export type ClassifiedCustomer = CustomerLifecycleInput & {
  lifecycleStage: CustomerLifecycleStage;
  lifecycleTags: CustomerLifecycleTag[];
  avgOrderValueCents: number | null;
  stageChangedAt: Date | null;
  classifiedAt: Date;
};

export type LifecycleSnapshotCounts = {
  totalCustomers: number;
  newCount: number;
  activeRepeatCount: number;
  atRiskCount: number;
  churnedCount: number;
  vipCount: number;
  highAovCount: number;
  totalRevenueCents: number;
};

export type LifecycleSignalType =
  | "customer_at_risk_segment_growing"
  | "customer_churned_segment_growing"
  | "customer_first_time_buyers_aging_out"
  | "customer_repeat_buyers_newly_at_risk"
  | "customer_new_customers_not_repeating"
  | "customer_vip_at_risk"
  | "customer_vip_churned"
  | "customer_high_aov_at_risk"
  | "customer_high_aov_churned";

export type CustomerGroupMemberSnapshot = {
  shopifyCustomerId: string;
  email: string | null;
  name: string | null;
  lifecycleStage: CustomerLifecycleStage;
  lifecycleTags: CustomerLifecycleTag[];
  orderCount: number;
  totalSpentCents: number;
  currency: string;
  lastOrderAt: string | null;
  previousStage: CustomerLifecycleStage | null;
};

export type LifecycleActionRecommendation = {
  provider: "klaviyo" | "ora";
  channel: string;
  actionType: string;
  title: string;
  reasoning: string;
  expectedImpact: string;
  riskLevel: "low" | "medium" | "high";
  previewPayload: Record<string, unknown>;
  executionPayload: Record<string, unknown>;
};

export type LifecycleSignalCandidate = {
  type: LifecycleSignalType;
  title: string;
  summary: string;
  evidenceText: string;
  groupName: string;
  groupDescription: string;
  groupDefinition: Record<string, unknown>;
  members: CustomerGroupMemberSnapshot[];
  affectedCount: number;
  estimatedRevenueCents: number;
  severity: "low" | "medium" | "high" | "critical";
  confidence: number;
  rawPayload: Record<string, unknown>;
  recommendation: LifecycleActionRecommendation;
};
