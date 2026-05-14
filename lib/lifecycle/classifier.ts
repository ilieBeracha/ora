import type {
  ClassifiedCustomer,
  CustomerLifecycleInput,
  CustomerLifecycleStage,
  CustomerLifecycleTag,
} from "@/lib/lifecycle/types";

type CurrencyThresholds = {
  vipSpendCents: number;
  highAovCents: number | null;
};

const vipSpendFloorCents = 50_000;
const vipOrderCountFloor = 10;
const highAovMinimumSampleSize = 10;

export function classifyCustomers(
  customers: CustomerLifecycleInput[],
  now = new Date(),
) {
  const purchasingCustomers = customers.filter(
    (customer) => customer.orderCount > 0,
  );
  const thresholds = computeThresholdsByCurrency(purchasingCustomers);

  return purchasingCustomers.map((customer) =>
    classifyCustomer(customer, thresholds.get(customer.currency), now),
  );
}

export function classifyCustomer(
  customer: CustomerLifecycleInput,
  thresholds: CurrencyThresholds | undefined,
  now = new Date(),
): ClassifiedCustomer {
  const lifecycleStage = stageForCustomer(customer, now);
  const avgOrderValueCents =
    customer.orderCount > 0
      ? Math.round(customer.totalSpentCents / customer.orderCount)
      : null;
  const lifecycleTags: CustomerLifecycleTag[] = [];

  if (
    customer.orderCount >= vipOrderCountFloor ||
    customer.totalSpentCents >=
      Math.max(vipSpendFloorCents, thresholds?.vipSpendCents ?? vipSpendFloorCents)
  ) {
    lifecycleTags.push("vip");
  }

  if (
    avgOrderValueCents != null &&
    thresholds?.highAovCents != null &&
    avgOrderValueCents >= thresholds.highAovCents
  ) {
    lifecycleTags.push("high_aov");
  }

  return {
    ...customer,
    lifecycleStage,
    lifecycleTags,
    avgOrderValueCents,
    stageChangedAt:
      customer.previousStage && customer.previousStage !== lifecycleStage
        ? now
        : null,
    classifiedAt: now,
  };
}

export function stageForCustomer(
  customer: Pick<CustomerLifecycleInput, "lastOrderAt" | "orderCount">,
  now = new Date(),
): CustomerLifecycleStage {
  if (!customer.lastOrderAt) return "churned";

  const daysSinceLastOrder = Math.floor(
    (startOfDayUtc(now).getTime() -
      startOfDayUtc(customer.lastOrderAt).getTime()) /
      86_400_000,
  );

  if (customer.orderCount === 1 && daysSinceLastOrder <= 30) return "new";
  if (customer.orderCount > 1 && daysSinceLastOrder <= 60) {
    return "active_repeat";
  }
  if (daysSinceLastOrder <= 120) return "at_risk";

  return "churned";
}

export function computeThresholdsByCurrency(customers: CustomerLifecycleInput[]) {
  const byCurrency = new Map<string, CustomerLifecycleInput[]>();

  for (const customer of customers) {
    const bucket = byCurrency.get(customer.currency) ?? [];
    bucket.push(customer);
    byCurrency.set(customer.currency, bucket);
  }

  return new Map(
    [...byCurrency.entries()].map(([currency, rows]) => {
      const avgOrderValues = rows
        .filter((row) => row.orderCount > 0)
        .map((row) => Math.round(row.totalSpentCents / row.orderCount));

      return [
        currency,
        {
          vipSpendCents: Math.max(
            vipSpendFloorCents,
            percentile(
              rows.map((row) => row.totalSpentCents),
              0.85,
            ),
          ),
          highAovCents:
            avgOrderValues.length >= highAovMinimumSampleSize
              ? percentile(avgOrderValues, 0.85)
              : null,
        },
      ] as const;
    }),
  );
}

function percentile(values: number[], fraction: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  );

  return sorted[index] ?? 0;
}

function startOfDayUtc(date: Date) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}
