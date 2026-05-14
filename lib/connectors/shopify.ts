import { z } from "zod";

import { prisma } from "@/lib/db";
import {
  fetchShopInfo,
  resolveShopifyAccessToken,
  shopifyGraphql,
} from "@/lib/shopify/client";
import { hasMetafield } from "@/lib/shopify/product-mirror";
import type { ConnectorAdapter } from "@/lib/connectors/types";
import type { Prisma } from "@/lib/generated/prisma/client";

const emptyInputSchema = z.object({}).optional();
const graphqlReadInputSchema = z.object({
  query: z.string().min(1).max(8_000),
  variables: z.record(z.string(), z.unknown()).optional(),
});
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const optionalDateRangeSchema = z.object({
  from: dateSchema.optional(),
  to: dateSchema.optional(),
});
const financialStatusSchema = z.enum([
  "paid",
  "pending",
  "refunded",
  "voided",
  "partially_paid",
  "partially_refunded",
]);
const productStatusSchema = z.enum(["ACTIVE", "ARCHIVED", "DRAFT"]);
const metafieldOwnerTypeSchema = z.enum([
  "PRODUCT",
  "PRODUCTVARIANT",
  "CUSTOMER",
  "ORDER",
  "COLLECTION",
  "SHOP",
  "LOCATION",
]);
const searchProductsInputSchema = z.object({
  q: z.string().trim().min(1).max(240).optional(),
  status: productStatusSchema.optional(),
  vendor: z.string().trim().min(1).max(120).optional(),
  productType: z.string().trim().min(1).max(120).optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  inventoryRange: z
    .object({
      min: z.number().int().min(0).optional(),
      max: z.number().int().min(0).optional(),
    })
    .optional(),
  updatedSince: z.string().datetime().or(dateSchema).optional(),
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().trim().min(1).max(160).optional(),
});
const productDetailInputSchema = z
  .object({
    id: z.string().trim().min(1).max(160).optional(),
    handle: z.string().trim().min(1).max(240).optional(),
    search: z.string().trim().min(1).max(160).optional(),
    variantsLimit: z.number().int().min(1).max(100).default(50),
    metafieldNamespaces: z
      .array(z.string().trim().min(1).max(80))
      .max(8)
      .default(["custom"]),
  })
  .refine((value) => Boolean(value.id || value.handle || value.search), {
    message: "Provide id, handle, or search.",
  });
const ordersInputSchema = z.object({
  from: dateSchema.describe("Inclusive start date in YYYY-MM-DD."),
  to: dateSchema.describe("Inclusive end date in YYYY-MM-DD."),
  status: financialStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).default(25),
  lineItemsLimit: z.number().int().min(1).max(25).default(5),
});
const productSalesInputSchema = z.object({
  from: dateSchema.describe("Inclusive start date in YYYY-MM-DD."),
  to: dateSchema.describe("Inclusive end date in YYYY-MM-DD."),
  status: financialStatusSchema.default("paid"),
  orderLimit: z.number().int().min(1).max(250).default(250),
  cursor: z.string().trim().min(1).max(500).optional(),
  lineItemsLimit: z.number().int().min(1).max(100).default(50),
  sortBy: z
    .enum(["units_sold", "net_revenue", "order_count"])
    .default("units_sold"),
  limit: z.number().int().min(1).max(25).default(10),
});
const salesByPeriodInputSchema = z.object({
  from: dateSchema.describe("Inclusive start date in YYYY-MM-DD."),
  to: dateSchema.describe("Inclusive end date in YYYY-MM-DD."),
  granularity: z.enum(["day", "week", "month"]).default("day"),
  status: financialStatusSchema.default("paid"),
  pageSize: z.number().int().min(1).max(250).default(250),
  maxPages: z.number().int().min(1).max(20).default(6),
});
const inventoryLevelsInputSchema = z.object({
  search: z.string().trim().min(1).max(160).optional(),
  lowStockOnly: z.boolean().default(false),
  lowStockThreshold: z.number().int().min(0).default(5),
  limit: z.number().int().min(1).max(100).default(50),
});
const customersInputSchema = z.object({
  search: z.string().trim().min(1).max(160).optional(),
  limit: z.number().int().min(1).max(100).default(25),
});
const customerSegmentsInputSchema = z.object({
  limit: z.number().int().min(1).max(100).default(25),
});
const abandonedCheckoutsInputSchema = optionalDateRangeSchema.extend({
  limit: z.number().int().min(1).max(100).default(25),
});
const refundsInputSchema = z.object({
  from: dateSchema.describe("Inclusive start date in YYYY-MM-DD."),
  to: dateSchema.describe("Inclusive end date in YYYY-MM-DD."),
  limit: z.number().int().min(1).max(100).default(50),
});
const discountsInputSchema = z.object({
  query: z.string().trim().min(1).max(240).optional(),
  limit: z.number().int().min(1).max(100).default(25),
});
const metafieldDefinitionsInputSchema = z.object({
  ownerType: metafieldOwnerTypeSchema.default("PRODUCT"),
  limit: z.number().int().min(1).max(250).default(100),
});
const missingMetafieldInputSchema = z.object({
  namespace: z.string().trim().min(1).max(255),
  key: z.string().trim().min(1).max(255),
  status: productStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).default(25),
  scanLimit: z.number().int().min(1).max(1000).default(500),
});

type Edge<T> = { edges: Array<{ node: T }> };

type ProductSalesMoneySet = {
  shopMoney?: { amount?: string | null; currencyCode?: string | null } | null;
} | null;

type ProductSalesOrder = {
  id: string;
  name: string;
  createdAt: string;
  lineItems: {
    pageInfo: { hasNextPage: boolean };
    edges: Array<{
      node: {
        title: string;
        quantity: number;
        originalTotalSet: ProductSalesMoneySet;
        discountedTotalSet: ProductSalesMoneySet;
        product: {
          id: string;
          handle: string;
          title: string;
        } | null;
      };
    }>;
  };
};

type ProductSalesResponse = {
  orders: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: Array<{ node: ProductSalesOrder }>;
  };
};

type GraphqlConnection<T> = {
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  edges: Array<{ node: T }>;
};

export type ShopifyProductSalesRow = {
  productId: string | null;
  handle: string | null;
  title: string;
  orderCount: number;
  unitsSold: number;
  grossRevenue: number;
  netRevenue: number;
  currency: string | null;
  firstSoldAt: string | null;
  lastSoldAt: string | null;
  sampleOrders: string[];
};

export const shopifyConnector: ConnectorAdapter = {
  provider: "shopify",
  label: "Shopify",
  tools: [
    {
      name: "shopify_get_shop",
      description: "Read the connected Shopify shop profile.",
      inputSchema: emptyInputSchema,
      readOnly: true,
      async execute(_input, ctx) {
        const connection = await getConnectedShopifyConnection(ctx.companyId);
        const accessToken = await resolveShopifyAccessToken(connection);

        return fetchShopInfo({
          shopDomain: connection.shopDomain,
          accessToken,
          apiVersion: connection.apiVersion,
        });
      },
    },
    {
      name: "shopify_list_mirrored_products",
      description:
        "Read mirrored Shopify products from Ora without calling Shopify.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).default(10),
        status: z.string().optional(),
      }),
      readOnly: true,
      async execute(input, ctx) {
        const parsed = z
          .object({
            limit: z.number().int().min(1).max(50).default(10),
            status: z.string().optional(),
          })
          .parse(input ?? {});
        const connection = await getConnectedShopifyConnection(ctx.companyId);

        return prisma.productMirror.findMany({
          where: {
            shopifyConnectionId: connection.id,
            status: parsed.status,
          },
          orderBy: { mirroredAt: "desc" },
          take: parsed.limit,
          select: {
            shopifyProductId: true,
            handle: true,
            title: true,
            status: true,
            vendor: true,
            productType: true,
            tags: true,
            totalInventory: true,
            imageUrl: true,
            shopifyUpdatedAt: true,
            mirroredAt: true,
          },
        });
      },
    },
    {
      name: "shopify_count_mirrored_products",
      description: "Count mirrored Shopify products by status.",
      inputSchema: emptyInputSchema,
      readOnly: true,
      async execute(_input, ctx) {
        const connection = await getConnectedShopifyConnection(ctx.companyId);
        const grouped = await prisma.productMirror.groupBy({
          by: ["status"],
          where: { shopifyConnectionId: connection.id },
          _count: { _all: true },
        });

        return grouped.map((group) => ({
          status: group.status,
          count: group._count._all,
        }));
      },
    },
    {
      name: "shopify_get_orders",
      description:
        "List Shopify orders in a date range with totals, statuses, timestamps, and line items. Use for order, recent sales, AOV, fulfillment status, and revenue questions that need order-level evidence. Customer personal data is intentionally not requested.",
      inputSchema: ordersInputSchema,
      readOnly: true,
      async execute(input, ctx) {
        return getOrders(input, ctx.companyId);
      },
    },
    {
      name: "shopify_get_sales_by_period",
      description:
        "Aggregate Shopify order revenue and order count by day, week, or month for a date range. Use for revenue trend, sales trend, AOV, day/week/month comparisons, and commerce performance questions.",
      inputSchema: salesByPeriodInputSchema,
      readOnly: true,
      async execute(input, ctx) {
        return getSalesByPeriod(input, ctx.companyId);
      },
    },
    {
      name: "shopify_search_products",
      description:
        "Search Ora's mirrored Shopify catalog by original-language product text, handle, vendor, product type, tags, status, inventory range, update date, or a combination. Use this before generic GraphQL when the user asks about a product, product list, catalog cleanup, inventory, slow movers, or follow-up details about a named product.",
      inputSchema: searchProductsInputSchema,
      readOnly: true,
      async execute(input, ctx) {
        return searchMirroredProducts(input, ctx.companyId);
      },
    },
    {
      name: "shopify_get_product_detail",
      description:
        "Read one Shopify product in detail by id, handle, or search text. Resolves from Ora's mirror, then fetches live Shopify details: variants, SKUs, prices, inventory, images, SEO, collections, and metafields. Use this for follow-up questions like more data on that product, inventory/product-page/catalog details, tags, metafields, and product-page quality.",
      inputSchema: productDetailInputSchema,
      readOnly: true,
      async execute(input, ctx) {
        return getMirroredProductDetail(input, ctx.companyId);
      },
    },
    {
      name: "shopify_get_product_sales",
      description:
        "Aggregate Shopify order line items by product over a date range. Use this for best seller, top seller, product revenue, units sold, order count, demand, sell-through, and product ranking questions. This returns computed product metrics, so prefer it over raw GraphQL for sales questions.",
      inputSchema: productSalesInputSchema,
      readOnly: true,
      async execute(input, ctx) {
        return getProductSales(input, ctx.companyId);
      },
    },
    {
      name: "shopify_get_inventory_levels",
      description:
        "List Shopify product variants with inventory quantities. Use for low stock, out of stock, variant stock, SKU inventory, and inventory risk questions.",
      inputSchema: inventoryLevelsInputSchema,
      readOnly: true,
      async execute(input, ctx) {
        return getInventoryLevels(input, ctx.companyId);
      },
    },
    {
      name: "shopify_get_customers",
      description:
        "List Shopify customers with order count, amount spent, and last-order timing when the connected app has Shopify customer-data permission. Use for VIPs, repeat buyers, customer cohorts, and customer lookup questions. If Shopify rejects protected customer data, answer from the error and suggest connecting the needed scope.",
      inputSchema: customersInputSchema,
      readOnly: true,
      async execute(input, ctx) {
        return getCustomers(input, ctx.companyId);
      },
    },
    {
      name: "shopify_get_customer_segments",
      description:
        "Read Shopify's saved customer segments. Use for VIP, lapsed, repeat buyer, winback, and cohort questions before inventing ad-hoc filters.",
      inputSchema: customerSegmentsInputSchema,
      readOnly: true,
      async execute(input, ctx) {
        return getCustomerSegments(input, ctx.companyId);
      },
    },
    {
      name: "shopify_get_abandoned_checkouts",
      description:
        "List abandoned Shopify checkouts, optionally in a date range. Use for abandoned cart/recovery questions, checkout leakage, and lost revenue opportunities.",
      inputSchema: abandonedCheckoutsInputSchema,
      readOnly: true,
      async execute(input, ctx) {
        return getAbandonedCheckouts(input, ctx.companyId);
      },
    },
    {
      name: "shopify_get_refunds",
      description:
        "List refunds created in a date range by scanning refunded orders and flattening refund rows. Use for refund volume, returned products, refund revenue impact, and operations quality questions.",
      inputSchema: refundsInputSchema,
      readOnly: true,
      async execute(input, ctx) {
        return getRefunds(input, ctx.companyId);
      },
    },
    {
      name: "shopify_get_discounts",
      description:
        "List Shopify discounts and discount codes. Use for active discounts, promo code, sale, offer, coupon, and promotion-readiness questions.",
      inputSchema: discountsInputSchema,
      readOnly: true,
      async execute(input, ctx) {
        return getDiscounts(input, ctx.companyId);
      },
    },
    {
      name: "shopify_get_metafield_definitions",
      description:
        "Read Shopify metafield definitions by owner type. Use for metafield discovery, product specs, merchant catalog schema, complementary product definitions, and before deciding whether a field is missing.",
      inputSchema: metafieldDefinitionsInputSchema,
      readOnly: true,
      async execute(input, ctx) {
        return getMetafieldDefinitions(input, ctx.companyId);
      },
    },
    {
      name: "shopify_find_products_missing_metafield",
      description:
        "Scan Ora's product mirror for products missing a specific Shopify metafield namespace/key. Use for catalog hygiene and metafield completeness questions. This is read-only; setting metafields must go through ActionPlan, Approval, and Execution.",
      inputSchema: missingMetafieldInputSchema,
      readOnly: true,
      async execute(input, ctx) {
        return findProductsMissingMetafield(input, ctx.companyId);
      },
    },
    {
      name: "shopify_admin_graphql_read",
      description:
        [
          "Run a read-only Shopify Admin GraphQL query against the connected store.",
          "Use this only when the structured Shopify read tools do not cover the question.",
          "Query only; mutations and subscriptions are rejected.",
          "Important: Shopify Admin ProductSortKeys does not support BEST_SELLING. For best seller / top product / product revenue questions, query paid orders sorted by CREATED_AT and inspect lineItems(first: N) with title, quantity, discountedTotalSet/originalTotalSet, and product { id handle title }; then aggregate the returned line items yourself.",
          "Useful order query filter shape: created_at:>=YYYY-MM-DDT00:00:00Z created_at:<=YYYY-MM-DDT23:59:59Z financial_status:paid.",
        ].join(" "),
      inputSchema: graphqlReadInputSchema,
      readOnly: true,
      async execute(input, ctx) {
        const parsed = graphqlReadInputSchema.parse(input ?? {});
        assertReadOnlyShopifyGraphqlQuery(parsed.query);

        const connection = await getConnectedShopifyConnection(ctx.companyId);
        const accessToken = await resolveShopifyAccessToken(connection);

        return shopifyGraphql<unknown>({
          shopDomain: connection.shopDomain,
          accessToken,
          apiVersion: connection.apiVersion,
          query: parsed.query,
          variables: parsed.variables,
        });
      },
    },
  ],
  async testConnection(ctx) {
    const checkedAt = new Date();

    try {
      const connection = await getConnectedShopifyConnection(ctx.companyId);
      const accessToken = await resolveShopifyAccessToken(connection);
      const shop = await fetchShopInfo({
        shopDomain: connection.shopDomain,
        accessToken,
        apiVersion: connection.apiVersion,
      });

      return {
        ok: true,
        checkedAt,
        message: "Shopify connected.",
        metadata: {
          shopDomain: connection.shopDomain,
          shopName: shop.name,
        },
      };
    } catch (error) {
      return {
        ok: false,
        checkedAt,
        message:
          error instanceof Error ? error.message : "Shopify connection failed.",
      };
    }
  },
};

async function getConnectedShopifyConnection(companyId: string) {
  const connection = await prisma.shopifyConnection.findFirst({
    where: { companyId, status: "connected" },
    orderBy: { connectedAt: "desc" },
  });

  if (!connection) {
    throw new Error("Shopify is not connected.");
  }

  return connection;
}

async function runShopifyGraphql<T>(
  companyId: string,
  query: string,
  variables?: Record<string, unknown>,
) {
  const connection = await getConnectedShopifyConnection(companyId);
  const accessToken = await resolveShopifyAccessToken(connection);

  return shopifyGraphql<T>({
    shopDomain: connection.shopDomain,
    accessToken,
    apiVersion: connection.apiVersion,
    query,
    variables,
  });
}

async function getOrders(input: unknown, companyId: string) {
  const args = ordersInputSchema.parse(input ?? {});
  assertDateRange(args.from, args.to);
  const data = await runShopifyGraphql<{
    orders: GraphqlConnection<{
      id: string;
      name: string;
      createdAt: string;
      updatedAt: string;
      displayFinancialStatus: string | null;
      displayFulfillmentStatus: string | null;
      currentTotalPriceSet: ProductSalesMoneySet;
      subtotalPriceSet: ProductSalesMoneySet;
      totalShippingPriceSet: ProductSalesMoneySet;
      totalTaxSet: ProductSalesMoneySet;
      lineItems: Edge<{
        title: string;
        quantity: number;
        discountedTotalSet: ProductSalesMoneySet;
        product: { id: string; handle: string; title: string } | null;
        variant: { id: string; title: string; sku: string | null } | null;
      }>;
    }>;
  }>(companyId, ORDERS_QUERY, {
    query: buildOrderQuery(args.from, args.to, args.status),
    first: args.limit,
    lineItemsFirst: args.lineItemsLimit,
  });
  const orders = data.orders.edges.map(({ node }) => ({
    id: node.id,
    name: node.name,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    financialStatus: node.displayFinancialStatus,
    fulfillmentStatus: node.displayFulfillmentStatus,
    total: moneyAmount(node.currentTotalPriceSet),
    subtotal: moneyAmount(node.subtotalPriceSet),
    shipping: moneyAmount(node.totalShippingPriceSet),
    tax: moneyAmount(node.totalTaxSet),
    currency:
      node.currentTotalPriceSet?.shopMoney?.currencyCode ??
      node.subtotalPriceSet?.shopMoney?.currencyCode ??
      null,
    items: node.lineItems.edges.map(({ node: item }) => ({
      title: item.title,
      quantity: item.quantity,
      total: moneyAmount(item.discountedTotalSet),
      productId: item.product?.id ?? null,
      productHandle: item.product?.handle ?? null,
      variantId: item.variant?.id ?? null,
      variantTitle: item.variant?.title ?? null,
      sku: item.variant?.sku ?? null,
    })),
  }));
  const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);

  return {
    source: "shopify_admin_graphql",
    window: { from: args.from, to: args.to },
    status: args.status ?? "any",
    count: orders.length,
    hasMore: data.orders.pageInfo.hasNextPage,
    nextCursor: data.orders.pageInfo.endCursor,
    totalRevenue: roundMoney(totalRevenue),
    currency: orders.find((order) => order.currency)?.currency ?? null,
    orders,
  };
}

async function searchMirroredProducts(input: unknown, companyId: string) {
  const args = searchProductsInputSchema.parse(input ?? {});
  const connection = await getConnectedShopifyConnection(companyId);
  const where: Prisma.ProductMirrorWhereInput = {
    shopifyConnectionId: connection.id,
    status: args.status,
    vendor: args.vendor
      ? { contains: args.vendor, mode: "insensitive" }
      : undefined,
    productType: args.productType
      ? { contains: args.productType, mode: "insensitive" }
      : undefined,
    tags: args.tags?.length ? { hasSome: args.tags } : undefined,
    totalInventory: args.inventoryRange
      ? {
          gte: args.inventoryRange.min,
          lte: args.inventoryRange.max,
        }
      : undefined,
    shopifyUpdatedAt: args.updatedSince
      ? { gte: new Date(args.updatedSince) }
      : undefined,
    ...(args.q ? { OR: productSearchConditions(args.q) } : {}),
  };
  const products = await prisma.productMirror.findMany({
    where,
    orderBy: [{ status: "asc" }, { title: "asc" }, { id: "asc" }],
    take: args.limit + 1,
    skip: args.cursor ? 1 : 0,
    cursor: args.cursor ? { id: args.cursor } : undefined,
    select: {
      id: true,
      shopifyProductId: true,
      handle: true,
      title: true,
      status: true,
      vendor: true,
      productType: true,
      tags: true,
      totalInventory: true,
      imageUrl: true,
      shopifyUpdatedAt: true,
      mirroredAt: true,
    },
  });
  const hasMore = products.length > args.limit;
  const page = hasMore ? products.slice(0, args.limit) : products;

  return {
    source: "product_mirror",
    count: page.length,
    hasMore,
    nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
    products: page.map((product) => ({
      shopifyProductId: product.shopifyProductId,
      handle: product.handle,
      title: product.title,
      status: product.status,
      vendor: product.vendor,
      productType: product.productType,
      tags: product.tags,
      totalInventory: product.totalInventory,
      imageUrl: product.imageUrl,
      shopifyUpdatedAt: product.shopifyUpdatedAt,
      mirroredAt: product.mirroredAt,
    })),
  };
}

async function getMirroredProductDetail(input: unknown, companyId: string) {
  const args = productDetailInputSchema.parse(input ?? {});
  const connection = await getConnectedShopifyConnection(companyId);
  const or: Prisma.ProductMirrorWhereInput[] = [];

  if (args.id) {
    or.push({ id: args.id }, { shopifyProductId: args.id });
  }

  if (args.handle) {
    or.push({ handle: { equals: args.handle, mode: "insensitive" } });
  }

  if (args.search) {
    or.push(
      { title: { contains: args.search, mode: "insensitive" } },
      { handle: { contains: args.search, mode: "insensitive" } },
    );
  }

  const product = await prisma.productMirror.findFirst({
    where: {
      shopifyConnectionId: connection.id,
      OR: or,
    },
    orderBy: { mirroredAt: "desc" },
  });

  if (!product) {
    throw new Error("No mirrored Shopify product matched that lookup.");
  }

  const mirrorProduct = {
    id: product.id,
    shopifyProductId: product.shopifyProductId,
    handle: product.handle,
    title: product.title,
    status: product.status,
    vendor: product.vendor,
    productType: product.productType,
    tags: product.tags,
    totalInventory: product.totalInventory,
    imageUrl: product.imageUrl,
    descriptionPlain: product.descriptionPlain,
    metafieldsJson: product.metafieldsJson,
    rawJson: product.rawJson,
    shopifyUpdatedAt: product.shopifyUpdatedAt,
    mirroredAt: product.mirroredAt,
  };

  try {
    const live = await getLiveProductDetail(companyId, {
      id: product.shopifyProductId,
      handle: product.handle,
      variantsLimit: args.variantsLimit,
      metafieldNamespaces: args.metafieldNamespaces,
    });

    return {
      source: "shopify_admin_graphql",
      mirrorProduct,
      liveProduct: live.product,
    };
  } catch (error) {
    return {
      source: "product_mirror",
      product: mirrorProduct,
      liveError:
        error instanceof Error
          ? error.message
          : "Live Shopify product lookup failed.",
    };
  }
}

async function getLiveProductDetail(
  companyId: string,
  args: z.infer<typeof productDetailInputSchema>,
) {
  type MoneyV2 = { amount: string; currencyCode: string };
  type ProductFields = {
    id: string;
    title: string;
    handle: string;
    status: string;
    vendor: string | null;
    productType: string | null;
    tags: string[];
    description: string | null;
    descriptionHtml: string | null;
    createdAt: string;
    updatedAt: string;
    publishedAt: string | null;
    onlineStoreUrl: string | null;
    onlineStorePreviewUrl: string | null;
    totalInventory: number | null;
    totalVariants: number | null;
    tracksInventory: boolean;
    priceRangeV2: {
      minVariantPrice: MoneyV2;
      maxVariantPrice: MoneyV2;
    };
    compareAtPriceRange: {
      minVariantCompareAtPrice: MoneyV2 | null;
      maxVariantCompareAtPrice: MoneyV2 | null;
    } | null;
    seo: { title: string | null; description: string | null } | null;
    featuredImage: { url: string; altText: string | null } | null;
    images: Edge<{ url: string; altText: string | null }>;
    collections: Edge<{ id: string; title: string; handle: string }>;
    variants: Edge<{
      id: string;
      sku: string | null;
      title: string;
      barcode: string | null;
      price: string;
      compareAtPrice: string | null;
      inventoryQuantity: number | null;
      availableForSale: boolean;
      selectedOptions: Array<{ name: string; value: string }>;
    }>;
    metafields: Edge<{
      id: string;
      namespace: string;
      key: string;
      type: string;
      value: string | null;
      description: string | null;
    }>;
  };

  let product: ProductFields | null = null;

  if (args.id?.startsWith("gid://shopify/Product/")) {
    const data = await runShopifyGraphql<{ product: ProductFields | null }>(
      companyId,
      PRODUCT_DETAIL_BY_ID_QUERY,
      { id: args.id, variantsLimit: args.variantsLimit },
    );
    product = data.product;
  } else {
    const handle = args.handle ?? args.search;
    if (!handle) throw new Error("Product handle or id is required.");
    const data = await runShopifyGraphql<{
      products: Edge<ProductFields>;
    }>(companyId, PRODUCT_DETAIL_BY_HANDLE_QUERY, {
      handleQuery: `handle:${handle.replace(/"/g, "")}`,
      variantsLimit: args.variantsLimit,
    });
    product = data.products.edges[0]?.node ?? null;
  }

  if (!product) {
    throw new Error("No live Shopify product matched that lookup.");
  }

  const namespaceSet = new Set(args.metafieldNamespaces);

  return {
    product: {
      id: product.id,
      handle: product.handle,
      title: product.title,
      status: product.status,
      vendor: product.vendor,
      productType: product.productType,
      tags: product.tags,
      description: product.description,
      descriptionHtml: product.descriptionHtml,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      publishedAt: product.publishedAt,
      onlineStoreUrl: product.onlineStoreUrl,
      onlineStorePreviewUrl: product.onlineStorePreviewUrl,
      tracksInventory: product.tracksInventory,
      totalInventory: product.totalInventory,
      totalVariants: product.totalVariants,
      priceRange: {
        min: product.priceRangeV2.minVariantPrice,
        max: product.priceRangeV2.maxVariantPrice,
      },
      compareAtPriceRange: product.compareAtPriceRange
        ? {
            min: product.compareAtPriceRange.minVariantCompareAtPrice,
            max: product.compareAtPriceRange.maxVariantCompareAtPrice,
          }
        : null,
      seo: product.seo,
      featuredImageUrl: product.featuredImage?.url ?? null,
      imageUrls: product.images.edges.map((edge) => edge.node.url),
      collections: product.collections.edges.map((edge) => edge.node),
      variants: product.variants.edges.map(({ node }) => ({
        id: node.id,
        sku: node.sku,
        title: node.title,
        barcode: node.barcode,
        price: node.price,
        compareAtPrice: node.compareAtPrice,
        inventoryQuantity: node.inventoryQuantity,
        availableForSale: node.availableForSale,
        options: node.selectedOptions,
      })),
      metafieldNamespacesQueried: args.metafieldNamespaces,
      metafields: product.metafields.edges
        .map((edge) => edge.node)
        .filter((metafield) => namespaceSet.has(metafield.namespace))
        .map((metafield) => ({
          namespace: metafield.namespace,
          key: metafield.key,
          type: metafield.type,
          value: metafield.value,
          description: metafield.description,
        })),
    },
  };
}

async function getProductSales(input: unknown, companyId: string) {
  const args = productSalesInputSchema.parse(input ?? {});
  assertDateRange(args.from, args.to);
  const connection = await getConnectedShopifyConnection(companyId);
  const accessToken = await resolveShopifyAccessToken(connection);
  const data = await shopifyGraphql<ProductSalesResponse>({
    shopDomain: connection.shopDomain,
    accessToken,
    apiVersion: connection.apiVersion,
    query: PRODUCT_SALES_QUERY,
    variables: {
      query: buildOrderQuery(args.from, args.to, args.status),
      first: args.orderLimit,
      after: args.cursor ?? null,
      lineItemsFirst: args.lineItemsLimit,
    },
  });
  const aggregated = aggregateShopifyProductSales(
    data.orders.edges.map((edge) => edge.node),
  );
  const products = sortProductSales(aggregated, args.sortBy).slice(0, args.limit);

  return {
    source: "shopify_admin_graphql",
    window: { from: args.from, to: args.to },
    status: args.status,
    orderLimit: args.orderLimit,
    scannedOrders: data.orders.edges.length,
    hasMoreOrders: data.orders.pageInfo.hasNextPage,
    nextCursor: data.orders.pageInfo.endCursor,
    lineItemsLimit: args.lineItemsLimit,
    truncatedLineItemOrders: data.orders.edges.filter(
      (edge) => edge.node.lineItems.pageInfo.hasNextPage,
    ).length,
    sortBy: args.sortBy,
    productCount: aggregated.length,
    products,
  };
}

async function getSalesByPeriod(input: unknown, companyId: string) {
  const args = salesByPeriodInputSchema.parse(input ?? {});
  assertDateRange(args.from, args.to);
  type SalesByPeriodResponse = {
    orders: GraphqlConnection<{
      createdAt: string;
      currentTotalPriceSet: ProductSalesMoneySet;
    }>;
  };
  let cursor: string | null = null;
  let pagesFetched = 0;
  let scannedOrders = 0;
  const orders: Array<{
    createdAt: string;
    currentTotalPriceSet: ProductSalesMoneySet;
  }> = [];

  do {
    const data: SalesByPeriodResponse =
      await runShopifyGraphql<SalesByPeriodResponse>(companyId, SALES_BY_PERIOD_QUERY, {
      query: buildOrderQuery(args.from, args.to, args.status),
      first: args.pageSize,
      after: cursor,
    });

    pagesFetched += 1;
    scannedOrders += data.orders.edges.length;
    orders.push(...data.orders.edges.map((edge) => edge.node));
    cursor = data.orders.pageInfo.hasNextPage
      ? data.orders.pageInfo.endCursor
      : null;
  } while (cursor && pagesFetched < args.maxPages);

  const series = aggregateSalesByPeriod(orders, args.granularity);
  const totalSales = series.reduce((sum, row) => sum + row.sales, 0);
  const totalOrders = series.reduce((sum, row) => sum + row.orderCount, 0);

  return {
    source: "shopify_admin_graphql",
    window: { from: args.from, to: args.to },
    status: args.status,
    granularity: args.granularity,
    scannedOrders,
    pagesFetched,
    pageSize: args.pageSize,
    maxPages: args.maxPages,
    hasMore: Boolean(cursor),
    nextCursor: cursor,
    truncated: Boolean(cursor),
    totalSales: roundMoney(totalSales),
    totalOrders,
    averageOrderValue: totalOrders ? roundMoney(totalSales / totalOrders) : 0,
    currency: series.find((row) => row.currency)?.currency ?? null,
    series,
  };
}

async function getInventoryLevels(input: unknown, companyId: string) {
  const args = inventoryLevelsInputSchema.parse(input ?? {});
  const data = await runShopifyGraphql<{
    productVariants: GraphqlConnection<{
      id: string;
      title: string;
      sku: string | null;
      inventoryQuantity: number | null;
      product: {
        id: string;
        title: string;
        handle: string;
        status: string;
      };
    }>;
  }>(companyId, INVENTORY_LEVELS_QUERY, {
    query: args.search ?? null,
    first: args.limit,
  });
  let variants = data.productVariants.edges.map(({ node }) => ({
    variantId: node.id,
    variantTitle: node.title,
    sku: node.sku,
    quantity: node.inventoryQuantity ?? 0,
    productId: node.product.id,
    productTitle: node.product.title,
    productHandle: node.product.handle,
    productStatus: node.product.status,
  }));

  if (args.lowStockOnly) {
    variants = variants.filter(
      (variant) => variant.quantity <= args.lowStockThreshold,
    );
  }

  return {
    source: "shopify_admin_graphql",
    query: args.search ?? null,
    lowStockOnly: args.lowStockOnly,
    lowStockThreshold: args.lowStockThreshold,
    count: variants.length,
    hasMore: data.productVariants.pageInfo.hasNextPage,
    nextCursor: data.productVariants.pageInfo.endCursor,
    variants,
  };
}

async function getCustomers(input: unknown, companyId: string) {
  const args = customersInputSchema.parse(input ?? {});
  const data = await runShopifyGraphql<{
    customers: GraphqlConnection<{
      id: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
      numberOfOrders: string | number;
      amountSpent: { amount: string; currencyCode: string };
      createdAt: string;
      updatedAt: string;
      lastOrder: { id: string; name: string; createdAt: string } | null;
    }>;
  }>(companyId, CUSTOMERS_QUERY, {
    query: args.search ?? null,
    first: args.limit,
  });

  return {
    source: "shopify_admin_graphql",
    query: args.search ?? null,
    count: data.customers.edges.length,
    hasMore: data.customers.pageInfo.hasNextPage,
    nextCursor: data.customers.pageInfo.endCursor,
    protectedDataNote:
      "This tool may require Shopify protected customer-data approval on some stores.",
    customers: data.customers.edges.map(({ node }) => ({
      id: node.id,
      email: node.email,
      name: [node.firstName, node.lastName].filter(Boolean).join(" ") || null,
      orderCount: Number(node.numberOfOrders),
      spent: Number(node.amountSpent.amount),
      currency: node.amountSpent.currencyCode,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      lastOrderName: node.lastOrder?.name ?? null,
      lastOrderAt: node.lastOrder?.createdAt ?? null,
    })),
  };
}

async function getCustomerSegments(input: unknown, companyId: string) {
  const args = customerSegmentsInputSchema.parse(input ?? {});
  const data = await runShopifyGraphql<{
    segments: GraphqlConnection<{
      id: string;
      name: string;
      query: string;
      creationDate: string;
      lastEditDate: string;
    }>;
  }>(companyId, CUSTOMER_SEGMENTS_QUERY, { first: args.limit });

  return {
    source: "shopify_admin_graphql",
    count: data.segments.edges.length,
    hasMore: data.segments.pageInfo.hasNextPage,
    nextCursor: data.segments.pageInfo.endCursor,
    segments: data.segments.edges.map(({ node }) => ({
      id: node.id,
      name: node.name,
      query: node.query,
      createdAt: node.creationDate,
      updatedAt: node.lastEditDate,
    })),
  };
}

async function getAbandonedCheckouts(input: unknown, companyId: string) {
  const args = abandonedCheckoutsInputSchema.parse(input ?? {});
  if (args.from && args.to) assertDateRange(args.from, args.to);
  const query = [
    args.from ? `created_at:>=${args.from}T00:00:00Z` : null,
    args.to ? `created_at:<=${args.to}T23:59:59Z` : null,
  ]
    .filter(Boolean)
    .join(" ");
  const data = await runShopifyGraphql<{
    abandonedCheckouts: GraphqlConnection<{
      id: string;
      name: string;
      createdAt: string;
      updatedAt: string;
      abandonedCheckoutUrl: string | null;
      totalPriceSet: ProductSalesMoneySet;
      lineItems: Edge<{ title: string; quantity: number }>;
    }>;
  }>(companyId, ABANDONED_CHECKOUTS_QUERY, {
    query: query || null,
    first: args.limit,
  });

  return {
    source: "shopify_admin_graphql",
    window: { from: args.from ?? null, to: args.to ?? null },
    count: data.abandonedCheckouts.edges.length,
    hasMore: data.abandonedCheckouts.pageInfo.hasNextPage,
    nextCursor: data.abandonedCheckouts.pageInfo.endCursor,
    totalValue: roundMoney(
      data.abandonedCheckouts.edges.reduce(
        (sum, edge) => sum + moneyAmount(edge.node.totalPriceSet),
        0,
      ),
    ),
    currency:
      data.abandonedCheckouts.edges.find(
        (edge) => edge.node.totalPriceSet?.shopMoney?.currencyCode,
      )?.node.totalPriceSet?.shopMoney?.currencyCode ?? null,
    checkouts: data.abandonedCheckouts.edges.map(({ node }) => ({
      id: node.id,
      name: node.name,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      recoveryUrl: node.abandonedCheckoutUrl,
      total: moneyAmount(node.totalPriceSet),
      currency: node.totalPriceSet?.shopMoney?.currencyCode ?? null,
      items: node.lineItems.edges.map((edge) => edge.node),
    })),
  };
}

async function getRefunds(input: unknown, companyId: string) {
  const args = refundsInputSchema.parse(input ?? {});
  assertDateRange(args.from, args.to);
  const data = await runShopifyGraphql<{
    orders: GraphqlConnection<{
      id: string;
      name: string;
      displayFinancialStatus: string | null;
      refunds: Array<{
        id: string;
        createdAt: string;
        note: string | null;
        totalRefundedSet: ProductSalesMoneySet;
        refundLineItems: Edge<{
          quantity: number;
          subtotalSet: ProductSalesMoneySet;
          lineItem: { title: string } | null;
        }>;
      }>;
    }>;
  }>(companyId, REFUNDS_QUERY, {
    query: buildRefundOrderQuery(args.from, args.to),
    first: args.limit,
  });
  const fromTime = new Date(`${args.from}T00:00:00Z`).getTime();
  const toTime = new Date(`${args.to}T23:59:59Z`).getTime();
  const refunds = data.orders.edges.flatMap(({ node: order }) =>
    order.refunds
      .filter((refund) => {
        const time = new Date(refund.createdAt).getTime();
        return time >= fromTime && time <= toTime;
      })
      .map((refund) => ({
        orderId: order.id,
        orderName: order.name,
        orderFinancialStatus: order.displayFinancialStatus,
        refundId: refund.id,
        createdAt: refund.createdAt,
        note: refund.note,
        amount: moneyAmount(refund.totalRefundedSet),
        currency: refund.totalRefundedSet?.shopMoney?.currencyCode ?? null,
        items: refund.refundLineItems.edges.map(({ node }) => ({
          title: node.lineItem?.title ?? "Refunded item",
          quantity: node.quantity,
          subtotal: moneyAmount(node.subtotalSet),
          currency: node.subtotalSet?.shopMoney?.currencyCode ?? null,
        })),
      })),
  );

  return {
    source: "shopify_admin_graphql",
    window: { from: args.from, to: args.to },
    count: refunds.length,
    scannedOrders: data.orders.edges.length,
    totalRefunded: roundMoney(
      refunds.reduce((sum, refund) => sum + refund.amount, 0),
    ),
    currency: refunds.find((refund) => refund.currency)?.currency ?? null,
    refunds,
  };
}

async function getDiscounts(input: unknown, companyId: string) {
  const args = discountsInputSchema.parse(input ?? {});
  const data = await runShopifyGraphql<{
    discountNodes: GraphqlConnection<{
      id: string;
      discount: {
        __typename: string;
        title?: string | null;
        summary?: string | null;
        status?: string | null;
        startsAt?: string | null;
        endsAt?: string | null;
        usageLimit?: number | null;
        asyncUsageCount?: number | null;
        codes?: { nodes: Array<{ code: string }> } | null;
        combinesWith?: {
          orderDiscounts: boolean;
          productDiscounts: boolean;
          shippingDiscounts: boolean;
        } | null;
      };
    }>;
  }>(companyId, DISCOUNTS_QUERY, {
    first: args.limit,
    query: args.query ?? null,
  });

  return {
    source: "shopify_admin_graphql",
    query: args.query ?? null,
    count: data.discountNodes.edges.length,
    hasMore: data.discountNodes.pageInfo.hasNextPage,
    nextCursor: data.discountNodes.pageInfo.endCursor,
    discounts: data.discountNodes.edges.map(({ node }) => ({
      id: node.id,
      type: node.discount.__typename,
      title: node.discount.title ?? null,
      summary: node.discount.summary ?? null,
      status: node.discount.status ?? null,
      startsAt: node.discount.startsAt ?? null,
      endsAt: node.discount.endsAt ?? null,
      usageLimit: node.discount.usageLimit ?? null,
      usageCount: node.discount.asyncUsageCount ?? null,
      codes: node.discount.codes?.nodes.map((code) => code.code) ?? [],
      combinesWith: node.discount.combinesWith ?? null,
    })),
    scopeNote:
      "Requires Shopify discount scopes. Shopify discount usage counts can lag actual orders.",
  };
}

async function getMetafieldDefinitions(input: unknown, companyId: string) {
  const args = metafieldDefinitionsInputSchema.parse(input ?? {});
  const data = await runShopifyGraphql<{
    metafieldDefinitions: GraphqlConnection<{
      id: string;
      name: string;
      namespace: string;
      key: string;
      description: string | null;
      ownerType: string;
      pinnedPosition: number | null;
      type: { name: string; category: string };
      validations: Array<{ name: string; type: string; value: string | null }>;
    }>;
  }>(companyId, METAFIELD_DEFINITIONS_QUERY, {
    ownerType: args.ownerType,
    first: args.limit,
  });
  const definitions = data.metafieldDefinitions.edges
    .map(({ node }) => ({
      id: node.id,
      name: node.name,
      namespace: node.namespace,
      key: node.key,
      fullKey: `${node.namespace}.${node.key}`,
      description: node.description,
      ownerType: node.ownerType,
      pinnedPosition: node.pinnedPosition,
      type: node.type.name,
      category: node.type.category,
      validations: node.validations ?? [],
    }))
    .sort((a, b) => {
      const pinnedA = a.pinnedPosition ?? Number.MAX_SAFE_INTEGER;
      const pinnedB = b.pinnedPosition ?? Number.MAX_SAFE_INTEGER;
      if (pinnedA !== pinnedB) return pinnedA - pinnedB;
      return a.fullKey.localeCompare(b.fullKey);
    });

  return {
    source: "shopify_admin_graphql",
    ownerType: args.ownerType,
    count: definitions.length,
    hasMore: data.metafieldDefinitions.pageInfo.hasNextPage,
    nextCursor: data.metafieldDefinitions.pageInfo.endCursor,
    namespaces: [...new Set(definitions.map((item) => item.namespace))],
    definitions,
  };
}

async function findProductsMissingMetafield(input: unknown, companyId: string) {
  const args = missingMetafieldInputSchema.parse(input ?? {});
  const connection = await getConnectedShopifyConnection(companyId);
  const products = await prisma.productMirror.findMany({
    where: {
      shopifyConnectionId: connection.id,
      status: args.status,
    },
    orderBy: [{ status: "asc" }, { title: "asc" }],
    take: args.scanLimit,
  });
  const missing = products
    .filter((product) => !hasMetafield(product, args.namespace, args.key))
    .slice(0, args.limit);

  return {
    source: "product_mirror",
    namespace: args.namespace,
    key: args.key,
    status: args.status ?? "any",
    scanned: products.length,
    count: missing.length,
    hasMoreMatches: missing.length === args.limit,
    products: missing.map((product) => ({
      shopifyProductId: product.shopifyProductId,
      handle: product.handle,
      title: product.title,
      status: product.status,
      vendor: product.vendor,
      productType: product.productType,
      totalInventory: product.totalInventory,
      imageUrl: product.imageUrl,
    })),
  };
}

export function aggregateShopifyProductSalesForTest(
  orders: ProductSalesOrder[],
) {
  return aggregateShopifyProductSales(orders);
}

export function aggregateShopifySalesByPeriodForTest(
  orders: Array<{ createdAt: string; currentTotalPriceSet: ProductSalesMoneySet }>,
  granularity: z.infer<typeof salesByPeriodInputSchema>["granularity"],
) {
  return aggregateSalesByPeriod(orders, granularity);
}

export function buildShopifyOrderQueryForTest(
  from: string,
  to: string,
  status?: z.infer<typeof financialStatusSchema>,
) {
  return buildOrderQuery(from, to, status);
}

function aggregateShopifyProductSales(orders: ProductSalesOrder[]) {
  const aggregates = new Map<string, ShopifyProductSalesRow>();

  for (const order of orders) {
    const seenInOrder = new Set<string>();

    for (const { node: item } of order.lineItems.edges) {
      if (item.quantity <= 0) continue;

      const key =
        item.product?.id ??
        (item.product?.handle
          ? `handle:${item.product.handle}`
          : `title:${item.title}`);
      const currency =
        item.discountedTotalSet?.shopMoney?.currencyCode ??
        item.originalTotalSet?.shopMoney?.currencyCode ??
        null;
      const aggregate = aggregates.get(key) ?? {
        productId: item.product?.id ?? null,
        handle: item.product?.handle ?? null,
        title: item.product?.title ?? item.title,
        orderCount: 0,
        unitsSold: 0,
        grossRevenue: 0,
        netRevenue: 0,
        currency,
        firstSoldAt: null,
        lastSoldAt: null,
        sampleOrders: [],
      };

      aggregate.unitsSold += item.quantity;
      aggregate.grossRevenue += moneyAmount(item.originalTotalSet);
      aggregate.netRevenue += moneyAmount(item.discountedTotalSet);
      if (!aggregate.currency && currency) aggregate.currency = currency;
      if (!aggregate.firstSoldAt || order.createdAt < aggregate.firstSoldAt) {
        aggregate.firstSoldAt = order.createdAt;
      }
      if (!aggregate.lastSoldAt || order.createdAt > aggregate.lastSoldAt) {
        aggregate.lastSoldAt = order.createdAt;
      }
      if (!seenInOrder.has(key)) {
        aggregate.orderCount += 1;
        seenInOrder.add(key);
        if (aggregate.sampleOrders.length < 3) {
          aggregate.sampleOrders.push(order.name);
        }
      }

      aggregates.set(key, aggregate);
    }
  }

  return Array.from(aggregates.values()).map((row) => ({
    ...row,
    grossRevenue: roundMoney(row.grossRevenue),
    netRevenue: roundMoney(row.netRevenue),
  }));
}

function sortProductSales(
  rows: ShopifyProductSalesRow[],
  sortBy: z.infer<typeof productSalesInputSchema>["sortBy"],
) {
  return [...rows].sort((a, b) => {
    if (sortBy === "net_revenue" && b.netRevenue !== a.netRevenue) {
      return b.netRevenue - a.netRevenue;
    }

    if (sortBy === "order_count" && b.orderCount !== a.orderCount) {
      return b.orderCount - a.orderCount;
    }

    if (b.unitsSold !== a.unitsSold) return b.unitsSold - a.unitsSold;
    if (b.netRevenue !== a.netRevenue) return b.netRevenue - a.netRevenue;

    return a.title.localeCompare(b.title);
  });
}

function aggregateSalesByPeriod(
  orders: Array<{ createdAt: string; currentTotalPriceSet: ProductSalesMoneySet }>,
  granularity: z.infer<typeof salesByPeriodInputSchema>["granularity"],
) {
  const buckets = new Map<
    string,
    { orderCount: number; sales: number; currency: string | null }
  >();

  for (const order of orders) {
    const period = bucketKey(new Date(order.createdAt), granularity);
    const previous = buckets.get(period) ?? {
      orderCount: 0,
      sales: 0,
      currency: order.currentTotalPriceSet?.shopMoney?.currencyCode ?? null,
    };
    previous.orderCount += 1;
    previous.sales += moneyAmount(order.currentTotalPriceSet);
    if (!previous.currency) {
      previous.currency =
        order.currentTotalPriceSet?.shopMoney?.currencyCode ?? null;
    }
    buckets.set(period, previous);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, value]) => ({
      period,
      orderCount: value.orderCount,
      sales: roundMoney(value.sales),
      averageOrderValue: value.orderCount
        ? roundMoney(value.sales / value.orderCount)
        : 0,
      currency: value.currency,
    }));
}

function bucketKey(
  date: Date,
  granularity: z.infer<typeof salesByPeriodInputSchema>["granularity"],
) {
  if (granularity === "day") return date.toISOString().slice(0, 10);
  if (granularity === "month") return date.toISOString().slice(0, 7);

  const utc = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayNumber = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(
    ((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );

  return `${utc.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

function productSearchConditions(query: string) {
  const q = query.trim();

  return [
    { title: { contains: q, mode: "insensitive" as const } },
    { handle: { contains: q, mode: "insensitive" as const } },
    { vendor: { contains: q, mode: "insensitive" as const } },
    { productType: { contains: q, mode: "insensitive" as const } },
    { descriptionPlain: { contains: q, mode: "insensitive" as const } },
    { tags: { has: q } },
  ];
}

function buildOrderQuery(
  from: string,
  to: string,
  status?: z.infer<typeof financialStatusSchema>,
) {
  return [
    `created_at:>=${from}T00:00:00Z`,
    `created_at:<=${to}T23:59:59Z`,
    status ? `financial_status:${status}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildRefundOrderQuery(from: string, to: string) {
  return [
    "(financial_status:refunded OR financial_status:partially_refunded)",
    `updated_at:>=${from}T00:00:00Z`,
    `updated_at:<=${to}T23:59:59Z`,
  ].join(" ");
}

function moneyAmount(moneySet: ProductSalesMoneySet) {
  return Number(moneySet?.shopMoney?.amount ?? 0) || 0;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function assertDateRange(from: string, to: string) {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T23:59:59Z`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Invalid Shopify date range.");
  }

  if (start > end) {
    throw new Error("Shopify start date must be before end date.");
  }

  const days = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
  if (days > 370) {
    throw new Error("Shopify product sales queries should stay within one year.");
  }
}

export function assertReadOnlyShopifyGraphqlQuery(query: string) {
  const compact = query.replace(/#[^\n\r]*/g, " ").trim();

  if (!compact) {
    throw new Error("GraphQL query is required.");
  }

  if (/\b(mutation|subscription)\b/i.test(compact)) {
    throw new Error("Chat can only run read-only Shopify GraphQL queries.");
  }

  if (!compact.startsWith("{") && !/^\s*query\b/i.test(compact)) {
    throw new Error("Shopify GraphQL read tool requires a query operation.");
  }
}

const ORDERS_QUERY = /* GraphQL */ `
  query Orders($query: String!, $first: Int!, $lineItemsFirst: Int!) {
    orders(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          name
          createdAt
          updatedAt
          displayFinancialStatus
          displayFulfillmentStatus
          currentTotalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          subtotalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          totalShippingPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          totalTaxSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          lineItems(first: $lineItemsFirst) {
            edges {
              node {
                title
                quantity
                discountedTotalSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                product {
                  id
                  handle
                  title
                }
                variant {
                  id
                  title
                  sku
                }
              }
            }
          }
        }
      }
    }
  }
`;

const PRODUCT_SALES_QUERY = /* GraphQL */ `
  query ProductSales($query: String!, $first: Int!, $after: String, $lineItemsFirst: Int!) {
    orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          name
          createdAt
          lineItems(first: $lineItemsFirst) {
            pageInfo {
              hasNextPage
            }
            edges {
              node {
                title
                quantity
                originalTotalSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                discountedTotalSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                product {
                  id
                  handle
                  title
                }
              }
            }
          }
        }
      }
    }
  }
`;

const SALES_BY_PERIOD_QUERY = /* GraphQL */ `
  query SalesByPeriod($query: String!, $first: Int!, $after: String) {
    orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: false) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          createdAt
          currentTotalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
        }
      }
    }
  }
`;

const PRODUCT_DETAIL_FRAGMENT = /* GraphQL */ `
  fragment OraProductDetailFields on Product {
    id
    title
    handle
    status
    vendor
    productType
    tags
    description
    descriptionHtml
    createdAt
    updatedAt
    publishedAt
    onlineStoreUrl
    onlineStorePreviewUrl
    totalInventory
    totalVariants
    tracksInventory
    priceRangeV2 {
      minVariantPrice {
        amount
        currencyCode
      }
      maxVariantPrice {
        amount
        currencyCode
      }
    }
    compareAtPriceRange {
      minVariantCompareAtPrice {
        amount
        currencyCode
      }
      maxVariantCompareAtPrice {
        amount
        currencyCode
      }
    }
    seo {
      title
      description
    }
    featuredImage {
      url
      altText
    }
    images(first: 10) {
      edges {
        node {
          url
          altText
        }
      }
    }
    collections(first: 20) {
      edges {
        node {
          id
          title
          handle
        }
      }
    }
    variants(first: $variantsLimit) {
      edges {
        node {
          id
          sku
          title
          barcode
          price
          compareAtPrice
          inventoryQuantity
          availableForSale
          selectedOptions {
            name
            value
          }
        }
      }
    }
    metafields(first: 250) {
      edges {
        node {
          id
          namespace
          key
          type
          value
          description
        }
      }
    }
  }
`;

const PRODUCT_DETAIL_BY_ID_QUERY = /* GraphQL */ `
  ${PRODUCT_DETAIL_FRAGMENT}
  query ProductDetailById($id: ID!, $variantsLimit: Int!) {
    product(id: $id) {
      ...OraProductDetailFields
    }
  }
`;

const PRODUCT_DETAIL_BY_HANDLE_QUERY = /* GraphQL */ `
  ${PRODUCT_DETAIL_FRAGMENT}
  query ProductDetailByHandle($handleQuery: String!, $variantsLimit: Int!) {
    products(first: 1, query: $handleQuery) {
      edges {
        node {
          ...OraProductDetailFields
        }
      }
    }
  }
`;

const INVENTORY_LEVELS_QUERY = /* GraphQL */ `
  query InventoryLevels($query: String, $first: Int!) {
    productVariants(first: $first, query: $query) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          sku
          inventoryQuantity
          product {
            id
            title
            handle
            status
          }
        }
      }
    }
  }
`;

const CUSTOMERS_QUERY = /* GraphQL */ `
  query Customers($query: String, $first: Int!) {
    customers(first: $first, query: $query, sortKey: UPDATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          email
          firstName
          lastName
          numberOfOrders
          amountSpent {
            amount
            currencyCode
          }
          createdAt
          updatedAt
          lastOrder {
            id
            name
            createdAt
          }
        }
      }
    }
  }
`;

const CUSTOMER_SEGMENTS_QUERY = /* GraphQL */ `
  query CustomerSegments($first: Int!) {
    segments(first: $first, sortKey: LAST_EDIT_DATE, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          name
          query
          creationDate
          lastEditDate
        }
      }
    }
  }
`;

const ABANDONED_CHECKOUTS_QUERY = /* GraphQL */ `
  query AbandonedCheckouts($query: String, $first: Int!) {
    abandonedCheckouts(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          name
          createdAt
          updatedAt
          abandonedCheckoutUrl
          totalPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          lineItems(first: 10) {
            edges {
              node {
                title
                quantity
              }
            }
          }
        }
      }
    }
  }
`;

const REFUNDS_QUERY = /* GraphQL */ `
  query Refunds($query: String!, $first: Int!) {
    orders(first: $first, query: $query, sortKey: UPDATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          name
          displayFinancialStatus
          refunds {
            id
            createdAt
            note
            totalRefundedSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            refundLineItems(first: 20) {
              edges {
                node {
                  quantity
                  subtotalSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  lineItem {
                    title
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const DISCOUNTS_QUERY = /* GraphQL */ `
  query Discounts($first: Int!, $query: String) {
    discountNodes(first: $first, query: $query, sortKey: UPDATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          discount {
            __typename
            ... on DiscountCodeBasic {
              title
              summary
              status
              startsAt
              endsAt
              usageLimit
              asyncUsageCount
              codes(first: 5) {
                nodes {
                  code
                }
              }
              combinesWith {
                orderDiscounts
                productDiscounts
                shippingDiscounts
              }
            }
            ... on DiscountAutomaticBasic {
              title
              summary
              status
              startsAt
              endsAt
              asyncUsageCount
              combinesWith {
                orderDiscounts
                productDiscounts
                shippingDiscounts
              }
            }
            ... on DiscountCodeBxgy {
              title
              summary
              status
              startsAt
              endsAt
              usageLimit
              asyncUsageCount
              codes(first: 5) {
                nodes {
                  code
                }
              }
              combinesWith {
                orderDiscounts
                productDiscounts
                shippingDiscounts
              }
            }
            ... on DiscountAutomaticBxgy {
              title
              summary
              status
              startsAt
              endsAt
              asyncUsageCount
              combinesWith {
                orderDiscounts
                productDiscounts
                shippingDiscounts
              }
            }
            ... on DiscountCodeFreeShipping {
              title
              summary
              status
              startsAt
              endsAt
              usageLimit
              asyncUsageCount
              codes(first: 5) {
                nodes {
                  code
                }
              }
              combinesWith {
                orderDiscounts
                productDiscounts
                shippingDiscounts
              }
            }
            ... on DiscountCodeApp {
              title
              status
              usageLimit
              codes(first: 5) {
                nodes {
                  code
                }
              }
              combinesWith {
                orderDiscounts
                productDiscounts
                shippingDiscounts
              }
            }
            ... on DiscountAutomaticApp {
              title
              status
              combinesWith {
                orderDiscounts
                productDiscounts
                shippingDiscounts
              }
            }
          }
        }
      }
    }
  }
`;

const METAFIELD_DEFINITIONS_QUERY = /* GraphQL */ `
  query MetafieldDefinitions($ownerType: MetafieldOwnerType!, $first: Int!) {
    metafieldDefinitions(ownerType: $ownerType, first: $first) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          name
          namespace
          key
          description
          ownerType
          pinnedPosition
          type {
            name
            category
          }
          validations {
            name
            type
            value
          }
        }
      }
    }
  }
`;
