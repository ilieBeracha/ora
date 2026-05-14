import { describe, expect, it } from "vitest";

import { classifyCustomers } from "@/lib/lifecycle/classifier";
import {
  buildLifecycleSnapshotCounts,
  detectCustomerLifecycleSignals,
} from "@/lib/lifecycle/signals";
import type { CustomerLifecycleInput } from "@/lib/lifecycle/types";

const now = new Date("2026-05-14T12:00:00.000Z");

describe("customer lifecycle signals", () => {
  it("groups VIP at-risk customers into one Signal with one action proposal", () => {
    const profiles = classifyCustomers(
      [
        vipCustomer("1"),
        vipCustomer("2"),
        vipCustomer("3"),
        regularCustomer("4"),
      ],
      now,
    );
    const signals = detectCustomerLifecycleSignals({
      profiles,
      shopifyConnectionId: "shopify-1",
    });
    const vipSignal = signals.find(
      (signal) => signal.type === "customer_vip_at_risk",
    );

    expect(vipSignal?.affectedCount).toBe(3);
    expect(vipSignal?.members).toHaveLength(3);
    expect(vipSignal?.recommendation.provider).toBe("klaviyo");
    expect(vipSignal?.recommendation.executionPayload.args).toMatchObject({
      actionType: "vip_retention_campaign",
      channel: "klaviyo_campaign",
    });
  });

  it("detects repeat buyers newly becoming at-risk from previous stage", () => {
    const profiles = classifyCustomers(
      [
        repeatBuyer("1"),
        repeatBuyer("2"),
        repeatBuyer("3"),
      ],
      now,
    );
    const signals = detectCustomerLifecycleSignals({
      profiles,
      shopifyConnectionId: "shopify-1",
    });

    expect(signals.map((signal) => signal.type)).toContain(
      "customer_repeat_buyers_newly_at_risk",
    );
  });

  it("builds lifecycle counts for the snapshot", () => {
    const counts = buildLifecycleSnapshotCounts(
      classifyCustomers(
        [
          newCustomer("1"),
          repeatBuyer("2"),
          churnedCustomer("3"),
        ],
        now,
      ),
    );

    expect(counts).toMatchObject({
      newCount: 1,
      atRiskCount: 1,
      churnedCount: 1,
      totalCustomers: 3,
    });
  });
});

function vipCustomer(id: string): CustomerLifecycleInput {
  return {
    shopifyCustomerId: `gid://shopify/Customer/${id}`,
    email: `${id}@example.com`,
    name: `Customer ${id}`,
    orderCount: 10,
    totalSpentCents: 75_000,
    currency: "USD",
    lastOrderAt: new Date("2026-02-15T00:00:00.000Z"),
  };
}

function regularCustomer(id: string): CustomerLifecycleInput {
  return {
    shopifyCustomerId: `gid://shopify/Customer/${id}`,
    orderCount: 1,
    totalSpentCents: 5_000,
    currency: "USD",
    lastOrderAt: new Date("2026-04-30T00:00:00.000Z"),
  };
}

function repeatBuyer(id: string): CustomerLifecycleInput {
  return {
    shopifyCustomerId: `gid://shopify/Customer/${id}`,
    orderCount: 3,
    totalSpentCents: 15_000,
    currency: "USD",
    lastOrderAt: new Date("2026-02-15T00:00:00.000Z"),
    previousStage: "active_repeat",
  };
}

function newCustomer(id: string): CustomerLifecycleInput {
  return {
    shopifyCustomerId: `gid://shopify/Customer/${id}`,
    orderCount: 1,
    totalSpentCents: 5_000,
    currency: "USD",
    lastOrderAt: new Date("2026-05-01T00:00:00.000Z"),
  };
}

function churnedCustomer(id: string): CustomerLifecycleInput {
  return {
    shopifyCustomerId: `gid://shopify/Customer/${id}`,
    orderCount: 4,
    totalSpentCents: 25_000,
    currency: "USD",
    lastOrderAt: new Date("2025-12-01T00:00:00.000Z"),
  };
}
