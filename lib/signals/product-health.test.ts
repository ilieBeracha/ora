import { describe, expect, it } from "vitest";

import {
  detectDraftCatalogSignals,
  detectProductHealthSignals,
} from "@/lib/signals/product-health";

describe("product health signals", () => {
  it("groups active product issues into operational Signals", () => {
    const signals = detectProductHealthSignals([
      {
        shopifyProductId: "gid://shopify/Product/1",
        handle: "thin",
        title: "Thin Product",
        status: "ACTIVE",
        vendor: "Ora",
        productType: "",
        tags: [],
        totalInventory: 0,
        imageUrl: null,
        descriptionPlain: "",
        metafieldsJson: [],
      },
    ]);

    expect(signals.map((signal) => signal.type)).toEqual(
      [
        "product_inventory_risk",
        "product_missing_important_metafields",
        "product_weak_health",
      ],
    );
    expect(signals[0]?.recommendationTitle).toBeTruthy();
    expect(signals[0]?.affectedGroup).toContain("shoppers");
    expect(signals[0]?.rawPayload.count).toBe(1);
    expect(signals[0]).not.toHaveProperty("product");
  });

  it("does not create one active-product Signal per affected product", () => {
    const signals = detectProductHealthSignals([
      {
        shopifyProductId: "gid://shopify/Product/1",
        handle: "thin-a",
        title: "Thin Product A",
        status: "ACTIVE",
        vendor: "Ora",
        productType: "",
        tags: [],
        totalInventory: 0,
        imageUrl: null,
        descriptionPlain: "",
        metafieldsJson: [],
      },
      {
        shopifyProductId: "gid://shopify/Product/2",
        handle: "thin-b",
        title: "Thin Product B",
        status: "ACTIVE",
        vendor: "Ora",
        productType: "",
        tags: [],
        totalInventory: 0,
        imageUrl: null,
        descriptionPlain: "",
        metafieldsJson: [],
      },
    ]);

    expect(signals).toHaveLength(3);
    expect(signals.map((signal) => signal.rawPayload.count)).toEqual([2, 2, 2]);
  });

  it("summarizes draft catalog readiness without creating one Signal per product", () => {
    const signals = detectDraftCatalogSignals([
      {
        shopifyProductId: "gid://shopify/Product/2",
        handle: "ready-draft",
        title: "Ready Draft",
        status: "DRAFT",
        vendor: "Ora",
        productType: "Pants",
        tags: ["summer"],
        totalInventory: 12,
        imageUrl: "https://example.com/ready.jpg",
        descriptionPlain: "A complete draft product with enough launch copy.",
        metafieldsJson: [],
      },
      {
        shopifyProductId: "gid://shopify/Product/3",
        handle: "blocked-draft",
        title: "Blocked Draft",
        status: "DRAFT",
        vendor: "Ora",
        productType: null,
        tags: [],
        totalInventory: 0,
        imageUrl: null,
        descriptionPlain: "",
        metafieldsJson: [],
      },
    ]);

    expect(signals.map((signal) => signal.type)).toEqual([
      "draft_products_ready_for_review",
      "draft_products_need_cleanup",
    ]);
    expect(signals[0]?.rawPayload.count).toBe(1);
    expect(signals[1]?.rawPayload.count).toBe(1);
  });
});
