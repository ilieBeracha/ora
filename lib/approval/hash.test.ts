import { describe, expect, it } from "vitest";

import { assertApprovedPayload } from "@/lib/approval/guard";
import { hashApprovalPayload } from "@/lib/approval/hash";

describe("approval payload hashing", () => {
  it("is stable regardless of object key order", () => {
    const a = {
      provider: "shopify",
      args: { productId: "gid://shopify/Product/1", key: "complementary" },
    };
    const b = {
      args: { key: "complementary", productId: "gid://shopify/Product/1" },
      provider: "shopify",
    };

    expect(hashApprovalPayload(a)).toEqual(hashApprovalPayload(b));
  });

  it("rejects execution when the approved payload no longer matches", () => {
    const approved = {
      provider: "shopify",
      args: { productId: "gid://shopify/Product/1" },
    };
    const changed = {
      provider: "shopify",
      args: { productId: "gid://shopify/Product/2" },
    };

    expect(() =>
      assertApprovedPayload({
        executionPayload: changed,
        approvalPayloadHash: hashApprovalPayload(approved),
      }),
    ).toThrow("approved payload no longer matches");
  });
});

