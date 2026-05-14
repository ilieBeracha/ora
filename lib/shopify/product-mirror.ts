import type {
  ProductForDetection,
  ShopifyMetafield,
  ShopifyProductMirrorInput,
} from "@/lib/shopify/types";

function textFromHtml(value: string | null | undefined) {
  return value?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? null;
}

function edgesToNodes<T>(connection?: { edges?: Array<{ node?: T }> }) {
  return (
    connection?.edges
      ?.map((edge) => edge.node)
      .filter((node): node is T => node != null) ?? []
  );
}

export function normalizeShopifyProduct(rawProduct: Record<string, unknown>) {
  const featuredImage = rawProduct.featuredImage as
    | { url?: string | null }
    | null
    | undefined;
  const metafields = edgesToNodes<ShopifyMetafield>(
    rawProduct.metafields as { edges?: Array<{ node?: ShopifyMetafield }> },
  );

  return {
    shopifyProductId: String(rawProduct.id),
    handle: String(rawProduct.handle ?? ""),
    title: String(rawProduct.title ?? "Untitled product"),
    status: String(rawProduct.status ?? "UNKNOWN"),
    vendor: rawProduct.vendor ? String(rawProduct.vendor) : null,
    productType: rawProduct.productType ? String(rawProduct.productType) : null,
    tags: Array.isArray(rawProduct.tags)
      ? rawProduct.tags.map((tag) => String(tag))
      : [],
    totalInventory:
      typeof rawProduct.totalInventory === "number"
        ? rawProduct.totalInventory
        : null,
    imageUrl: featuredImage?.url ?? null,
    descriptionPlain: textFromHtml(String(rawProduct.descriptionHtml ?? "")),
    metafieldsJson: metafields,
    rawJson: rawProduct,
    shopifyUpdatedAt: rawProduct.updatedAt
      ? new Date(String(rawProduct.updatedAt))
      : null,
  } satisfies ShopifyProductMirrorInput;
}

export function metafieldsForProduct(product: ProductForDetection) {
  return Array.isArray(product.metafieldsJson)
    ? (product.metafieldsJson as ShopifyMetafield[])
    : [];
}

export function hasMetafield(
  product: ProductForDetection,
  namespace: string,
  key: string,
) {
  const match = metafieldsForProduct(product).find(
    (metafield) => metafield.namespace === namespace && metafield.key === key,
  );

  if (!match) return false;

  if (Array.isArray(match.references) && match.references.length > 0) {
    return true;
  }

  return Boolean(match.value && match.value !== "[]" && match.value !== "null");
}
