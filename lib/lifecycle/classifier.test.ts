import { describe, expect, it } from "vitest";

import { classifyCustomers, stageForCustomer } from "@/lib/lifecycle/classifier";
import type { CustomerLifecycleInput } from "@/lib/lifecycle/types";

const now = new Date("2026-05-14T12:00:00.000Z");

describe("customer lifecycle classifier", () => {
  it("classifies customers by purchase recency and repeat behavior", () => {
    expect(
      stageForCustomer(
        { orderCount: 1, lastOrderAt: new Date("2026-05-01T00:00:00.000Z") },
        now,
      ),
    ).toBe("new");
    expect(
      stageForCustomer(
        { orderCount: 3, lastOrderAt: new Date("2026-04-01T00:00:00.000Z") },
        now,
      ),
    ).toBe("active_repeat");
    expect(
      stageForCustomer(
        { orderCount: 2, lastOrderAt: new Date("2026-02-15T00:00:00.000Z") },
        now,
      ),
    ).toBe("at_risk");
    expect(
      stageForCustomer(
        { orderCount: 4, lastOrderAt: new Date("2025-12-01T00:00:00.000Z") },
        now,
      ),
    ).toBe("churned");
  });

  it("tags VIP and high-AOV customers with store-relative thresholds", () => {
    const customers: CustomerLifecycleInput[] = Array.from({ length: 12 }).map(
      (_, index) => ({
        shopifyCustomerId: `gid://shopify/Customer/${index + 1}`,
        orderCount: index === 11 ? 2 : 1,
        totalSpentCents: index === 11 ? 90_000 : 5_000 + index * 1_000,
        currency: "ILS",
        lastOrderAt: new Date("2026-03-01T00:00:00.000Z"),
      }),
    );

    const classified = classifyCustomers(customers, now);
    const top = classified.find((customer) =>
      customer.shopifyCustomerId.endsWith("/12"),
    );

    expect(top?.lifecycleTags).toContain("vip");
    expect(top?.lifecycleTags).toContain("high_aov");
  });

  it("keeps the previous stage when a stage change is detected", () => {
    const [customer] = classifyCustomers(
      [
        {
          shopifyCustomerId: "gid://shopify/Customer/1",
          orderCount: 2,
          totalSpentCents: 20_000,
          currency: "USD",
          lastOrderAt: new Date("2026-02-15T00:00:00.000Z"),
          previousStage: "active_repeat",
        },
      ],
      now,
    );

    expect(customer?.lifecycleStage).toBe("at_risk");
    expect(customer?.previousStage).toBe("active_repeat");
    expect(customer?.stageChangedAt?.toISOString()).toBe(now.toISOString());
  });
});
