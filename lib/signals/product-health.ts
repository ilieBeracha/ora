import type { ProductForDetection } from "@/lib/shopify/types";

export type ProductHealthCandidate = {
  type:
    | "product_missing_important_metafields"
    | "product_weak_health"
    | "product_inventory_risk";
  title: string;
  summary: string;
  evidenceText: string;
  affectedGroup: string;
  recommendationTitle: string;
  recommendationReasoning: string;
  expectedImpact: string;
  riskLevel: "low" | "medium" | "high";
  severity: "low" | "medium" | "high" | "critical";
  category: "product" | "inventory" | "catalog";
  confidence: number;
  rawPayload: Record<string, unknown>;
};

export type StoreCatalogCandidate = {
  type: "draft_products_ready_for_review" | "draft_products_need_cleanup";
  title: string;
  summary: string;
  evidenceText: string;
  affectedGroup: string;
  recommendationTitle: string;
  recommendationReasoning: string;
  expectedImpact: string;
  riskLevel: "low" | "medium" | "high";
  severity: "low" | "medium" | "high" | "critical";
  category: "product" | "inventory" | "catalog";
  confidence: number;
  rawPayload: Record<string, unknown>;
};

export function detectProductHealthSignals(products: ProductForDetection[]) {
  const signals: ProductHealthCandidate[] = [];
  const activeProducts = products.filter(
    (product) => product.status === "ACTIVE" && !isGiftCardProduct(product),
  );
  const weakProductPages = activeProducts.filter(needsProductPageWork);
  const unavailableProducts = activeProducts.filter(
    (product) => (product.totalInventory ?? 0) <= 0,
  );
  const weakCatalogProducts = activeProducts.filter(needsCatalogClassification);

  if (unavailableProducts.length > 0) {
    signals.push({
      type: "product_inventory_risk",
      title: `${unavailableProducts.length} active ${pluralize(
        "product",
        unavailableProducts.length,
      )} ${unavailableProducts.length === 1 ? "is" : "are"} unavailable`,
      summary:
        "Active products with no available inventory need an operator decision before demand is sent toward them.",
      evidenceText: `${unavailableProducts.length} active ${pluralize(
        "product",
        unavailableProducts.length,
      )} have no available inventory. Examples: ${productExamples(
        unavailableProducts,
      )}.`,
      affectedGroup:
        "Product-page visitors, collection shoppers, and operators managing active catalog availability.",
      recommendationTitle: "Review unavailable active products as one batch",
      recommendationReasoning:
        "This is an availability Signal, not a sales Signal. Decide which products should be restocked, hidden, or left active with clear merchandising intent.",
      expectedImpact:
        "Keeps the active catalog aligned with what customers can actually buy.",
      riskLevel: "medium",
      severity: severityFromCount(unavailableProducts.length, activeProducts.length),
      category: "inventory",
      confidence: 0.82,
      rawPayload: aggregatePayload(
        unavailableProducts,
        activeProducts.length,
        inventoryReasons,
      ),
    });
  }

  if (weakCatalogProducts.length > 0) {
    signals.push({
      type: "product_missing_important_metafields",
      title: `${weakCatalogProducts.length} active ${pluralize(
        "product",
        weakCatalogProducts.length,
      )} need catalog classification`,
      summary:
        "These active products lack basic catalog structure, which makes them harder to route into collections, filters, and operator workflows.",
      evidenceText: `${weakCatalogProducts.length} active ${pluralize(
        "product",
        weakCatalogProducts.length,
      )} are missing product type, tags, or both. Examples: ${weakCatalogProducts
        .slice(0, 5)
        .map(
          (product) =>
            `${product.title} (${catalogClassificationReasons(product).join(
              ", ",
            )})`,
        )
        .join("; ")}.`,
      affectedGroup:
        "Collection shoppers, filtered navigation, and operators preparing merchandising or campaign work.",
      recommendationTitle: "Complete catalog fields as a focused cleanup batch",
      recommendationReasoning:
        "This is a merchandising-readiness Signal. Fill in missing product type and tags before using these products for segmentation, promotion, or collection placement.",
      expectedImpact:
        "Cleaner catalog structure should make products easier to find, group, and act on.",
      riskLevel: "low",
      severity: severityFromCount(weakCatalogProducts.length, activeProducts.length),
      category: "catalog",
      confidence: 0.76,
      rawPayload: aggregatePayload(
        weakCatalogProducts,
        activeProducts.length,
        catalogClassificationReasons,
      ),
    });
  }

  if (weakProductPages.length > 0) {
    signals.push({
      type: "product_weak_health",
      title: `${weakProductPages.length} active product ${pluralize(
        "page",
        weakProductPages.length,
      )} need selling basics`,
      summary:
        "These active product pages are too thin to confidently send demand toward them.",
      evidenceText: `${weakProductPages.length} active product ${pluralize(
        "page",
        weakProductPages.length,
      )} have thin copy, no image, or both. Examples: ${weakProductPages
        .slice(0, 5)
        .map(
          (product) =>
            `${product.title} (${productPageReasons(product).join(", ")})`,
        )
        .join("; ")}.`,
      affectedGroup:
        "Product-page visitors, collection shoppers, and operators deciding what products are ready to promote.",
      recommendationTitle: "Improve product pages before driving more traffic",
      recommendationReasoning:
        "Treat this as a conversion-readiness Signal. Add clearer product copy and basic merchandising context before using these products in campaigns, collections, or customer outreach.",
      expectedImpact:
        "Better PDP clarity should reduce hesitation for shoppers who already reach these products.",
      riskLevel: "low",
      severity: severityFromCount(weakProductPages.length, activeProducts.length),
      category: "product",
      confidence: 0.74,
      rawPayload: aggregatePayload(
        weakProductPages,
        activeProducts.length,
        productPageReasons,
      ),
    });
  }

  return signals;
}

export function detectDraftCatalogSignals(products: ProductForDetection[]) {
  const draftProducts = products.filter((product) => product.status === "DRAFT");
  const readyDrafts = draftProducts.filter(isDraftReadyForReview);
  const cleanupDrafts = draftProducts.filter(needsDraftCleanup);
  const signals: StoreCatalogCandidate[] = [];

  if (readyDrafts.length > 0) {
    signals.push({
      type: "draft_products_ready_for_review",
      title: `${readyDrafts.length} draft products look ready for launch review`,
      summary:
        "These draft products already have the basics Ora can see: image, inventory, product type, tags, and usable product copy.",
      evidenceText: `${readyDrafts.length} draft products look launch-ready. Examples: ${productExamples(
        readyDrafts,
      )}.`,
      affectedGroup:
        "Operators choosing what to activate, merchandise, or place into collections next.",
      recommendationTitle: "Review a focused batch for activation",
      recommendationReasoning:
        "This is a catalog opportunity Signal. Review the ready draft products, choose the strongest batch, and decide whether they should become active or be scheduled for merchandising.",
      expectedImpact:
        "Turns existing catalog work into sellable inventory without creating new products from scratch.",
      riskLevel: "medium",
      severity: readyDrafts.length >= 50 ? "high" : "medium",
      category: "catalog",
      confidence: 0.82,
      rawPayload: {
        count: readyDrafts.length,
        examples: readyDrafts.slice(0, 10).map(productSnapshot),
      },
    });
  }

  if (cleanupDrafts.length > 0) {
    signals.push({
      type: "draft_products_need_cleanup",
      title: `${cleanupDrafts.length} draft products need cleanup before launch`,
      summary:
        "These draft products are not ready to activate because they are missing one or more launch basics.",
      evidenceText: `${cleanupDrafts.length} draft products have launch blockers. Examples: ${cleanupDrafts
        .slice(0, 5)
        .map((product) => `${product.title} (${draftCleanupReasons(product).join(", ")})`)
        .join("; ")}.`,
      affectedGroup:
        "Operators preparing draft products for activation, collection placement, and campaigns.",
      recommendationTitle: "Clean up the launch blockers before activation",
      recommendationReasoning:
        "This is a catalog readiness Signal. Fix missing product type, tags, image, inventory, or copy before these products move into the active catalog.",
      expectedImpact:
        "Reduces messy launches and makes draft products easier to sort, filter, and merchandise.",
      riskLevel: "low",
      severity: cleanupDrafts.length >= 50 ? "high" : "medium",
      category: "catalog",
      confidence: 0.8,
      rawPayload: {
        count: cleanupDrafts.length,
        examples: cleanupDrafts.slice(0, 10).map((product) => ({
          ...productSnapshot(product),
          reasons: draftCleanupReasons(product),
        })),
      },
    });
  }

  return signals;
}

export function isGiftCardProduct(product: ProductForDetection) {
  const values = [
    product.title,
    product.productType,
    ...product.tags,
  ].map((value) => value?.toLowerCase() ?? "");

  return values.some((value) => value.includes("gift card"));
}

function needsProductPageWork(product: ProductForDetection) {
  return productPageReasons(product).length > 0;
}

function productPageReasons(product: ProductForDetection) {
  const reasons: string[] = [];

  if (!product.imageUrl) reasons.push("no image");
  if ((product.descriptionPlain?.length ?? 0) < 80) {
    reasons.push(`${product.descriptionPlain?.length ?? 0} copy chars`);
  }

  return reasons;
}

function needsCatalogClassification(product: ProductForDetection) {
  return catalogClassificationReasons(product).length > 0;
}

function catalogClassificationReasons(product: ProductForDetection) {
  const reasons: string[] = [];

  if (!product.productType) reasons.push("no product type");
  if (product.tags.length === 0) reasons.push("no tags");

  return reasons;
}

function inventoryReasons(product: ProductForDetection) {
  return [`${product.totalInventory ?? 0} units available`];
}

function isDraftReadyForReview(product: ProductForDetection) {
  return (
    Boolean(product.imageUrl) &&
    Boolean(product.productType) &&
    product.tags.length > 0 &&
    (product.totalInventory ?? 0) > 0 &&
    (product.descriptionPlain?.length ?? 0) >= 40
  );
}

function needsDraftCleanup(product: ProductForDetection) {
  return draftCleanupReasons(product).length > 0;
}

function draftCleanupReasons(product: ProductForDetection) {
  const reasons: string[] = [];

  if (!product.imageUrl) reasons.push("no image");
  if (!product.productType) reasons.push("no product type");
  if (product.tags.length === 0) reasons.push("no tags");
  if ((product.totalInventory ?? 0) <= 0) reasons.push("no inventory");
  if ((product.descriptionPlain?.length ?? 0) < 40) reasons.push("thin copy");

  return reasons;
}

function productExamples(products: ProductForDetection[]) {
  return products
    .slice(0, 5)
    .map((product) => product.title)
    .join(", ");
}

function aggregatePayload(
  products: ProductForDetection[],
  activeProductCount: number,
  reasonsForProduct: (product: ProductForDetection) => string[],
) {
  return {
    count: products.length,
    activeProductCount,
    examples: products.slice(0, 10).map((product) => ({
      ...productSnapshot(product),
      reasons: reasonsForProduct(product),
    })),
  };
}

function severityFromCount(
  count: number,
  activeProductCount: number,
): "medium" | "high" {
  const share = activeProductCount > 0 ? count / activeProductCount : 0;

  return count >= 10 || share >= 0.1 ? "high" : "medium";
}

function pluralize(label: string, count: number) {
  return count === 1 ? label : `${label}s`;
}

function productSnapshot(product: ProductForDetection) {
  return {
    title: product.title,
    productId: product.shopifyProductId,
    productType: product.productType,
    tags: product.tags.length,
    totalInventory: product.totalInventory,
    hasImage: Boolean(product.imageUrl),
    descriptionLength: product.descriptionPlain?.length ?? 0,
  };
}
