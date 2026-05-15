import { describe, expect, it } from "vitest";

import {
  buildEvidenceFacts,
  getLatestEvidenceObservedAt,
  getTopEvidenceReason,
  uniqueValues,
} from "@/lib/signals/evidence-facts";

describe("buildEvidenceFacts", () => {
  it("groups duplicate records and counts occurrences", () => {
    const facts = buildEvidenceFacts([
      {
        evidenceType: "inventory_check",
        displayText: "2 active products have no available inventory.",
        provider: "shopify",
        observedAt: "2026-05-10T08:00:00Z",
      },
      {
        evidenceType: "inventory_check",
        displayText: "2 active products have no available inventory.",
        provider: "shopify",
        observedAt: "2026-05-11T08:00:00Z",
      },
      {
        evidenceType: "metafield_coverage",
        displayText: "5 products are missing custom.swatch metafield.",
        provider: "shopify",
        observedAt: "2026-05-09T08:00:00Z",
      },
    ]);

    expect(facts).toHaveLength(2);
    const inventoryFact = facts.find((f) => f.title === "Inventory Check");
    expect(inventoryFact?.count).toBe(2);
    expect(inventoryFact?.observedAt).toBe("2026-05-11T08:00:00Z");
    expect(facts[0].count).toBe(2);
  });

  it("collects unique providers across duplicates", () => {
    const facts = buildEvidenceFacts([
      {
        evidenceType: "inventory_check",
        displayText: "Out of stock items.",
        provider: "shopify",
        observedAt: "2026-05-10T08:00:00Z",
      },
      {
        evidenceType: "inventory_check",
        displayText: "Out of stock items.",
        provider: "klaviyo",
        observedAt: "2026-05-10T09:00:00Z",
      },
    ]);

    expect(facts).toHaveLength(1);
    expect(facts[0].providers.sort()).toEqual(["klaviyo", "shopify"]);
  });

  it("strips Examples: suffix from display text in the dedup key", () => {
    const facts = buildEvidenceFacts([
      {
        evidenceType: "inventory_check",
        displayText: "2 products are out of stock. Examples: A, B",
        provider: "shopify",
        observedAt: "2026-05-10T08:00:00Z",
      },
      {
        evidenceType: "inventory_check",
        displayText: "2 products are out of stock. Examples: C, D",
        provider: "shopify",
        observedAt: "2026-05-11T08:00:00Z",
      },
    ]);

    expect(facts).toHaveLength(1);
    expect(facts[0].count).toBe(2);
    expect(facts[0].summary).toContain("2 products are out of stock");
    expect(facts[0].summary).not.toContain("Examples");
  });
});

describe("getTopEvidenceReason", () => {
  it("returns the most frequent reason across examples", () => {
    const top = getTopEvidenceReason([
      { reasons: ["No image", "No product type"] },
      { reasons: ["No image"] },
      { reasons: ["No tags"] },
    ]);

    expect(top).toEqual({ reason: "No image", count: 2 });
  });

  it("returns null when there are no reasons", () => {
    expect(getTopEvidenceReason([])).toBeNull();
    expect(getTopEvidenceReason([{ reasons: [] }])).toBeNull();
  });
});

describe("getLatestEvidenceObservedAt", () => {
  it("returns the most recent observed timestamp", () => {
    const latest = getLatestEvidenceObservedAt([
      {
        evidenceType: "a",
        displayText: "x",
        provider: "shopify",
        observedAt: "2026-05-10T08:00:00Z",
      },
      {
        evidenceType: "b",
        displayText: "y",
        provider: "shopify",
        observedAt: "2026-05-12T08:00:00Z",
      },
      {
        evidenceType: "c",
        displayText: "z",
        provider: "shopify",
        observedAt: "2026-05-11T08:00:00Z",
      },
    ]);

    expect(latest).toBe("2026-05-12T08:00:00Z");
  });

  it("returns null for an empty array", () => {
    expect(getLatestEvidenceObservedAt([])).toBeNull();
  });
});

describe("uniqueValues", () => {
  it("dedupes and removes empty entries", () => {
    expect(uniqueValues(["a", "b", "a", "", "b", "c"])).toEqual(["a", "b", "c"]);
  });
});
