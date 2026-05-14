import { describe, expect, it } from "vitest";

import { hasMetafield } from "@/lib/shopify/product-mirror";
import type { ProductForDetection } from "@/lib/shopify/types";

const baseProduct: ProductForDetection = {
  shopifyProductId: "gid://shopify/Product/1",
  handle: "running-shoe",
  title: "Running Shoe",
  status: "ACTIVE",
  vendor: "Ora Footwear",
  productType: "Shoes",
  tags: ["running", "summer"],
  totalInventory: 12,
  imageUrl: "https://example.com/shoe.jpg",
  descriptionPlain: "Lightweight running shoe.",
  metafieldsJson: [],
};

describe("product mirror helpers", () => {
  it("detects existing metafield values", () => {
    expect(
      hasMetafield(
        {
          ...baseProduct,
          metafieldsJson: [
            {
              namespace: "custom",
              key: "material",
              value: "cotton",
            },
          ],
        },
        "custom",
        "material",
      ),
    ).toBe(true);
  });
});
