import { describe, expect, it } from "vitest";

import {
  aggregateShopifyProductSalesForTest,
  aggregateShopifySalesByPeriodForTest,
  assertReadOnlyShopifyGraphqlQuery,
  buildShopifyOrderQueryForTest,
  shopifyConnector,
} from "@/lib/connectors/shopify";

describe("Shopify connector read tools", () => {
  it("exposes the broad Shopify read surface without chat mutations", () => {
    expect(shopifyConnector.tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "shopify_get_shop",
        "shopify_get_orders",
        "shopify_get_sales_by_period",
        "shopify_search_products",
        "shopify_get_product_detail",
        "shopify_get_product_sales",
        "shopify_get_inventory_levels",
        "shopify_get_customers",
        "shopify_get_customer_segments",
        "shopify_get_abandoned_checkouts",
        "shopify_get_refunds",
        "shopify_get_discounts",
        "shopify_get_metafield_definitions",
        "shopify_find_products_missing_metafield",
        "shopify_admin_graphql_read",
      ]),
    );
    expect(shopifyConnector.tools.every((tool) => tool.readOnly)).toBe(true);
  });

  it("allows read-only query operations", () => {
    expect(() =>
      assertReadOnlyShopifyGraphqlQuery(`
        query Orders {
          orders(first: 5) {
            edges { node { id name } }
          }
        }
      `),
    ).not.toThrow();
  });

  it("allows GraphQL shorthand read queries", () => {
    expect(() =>
      assertReadOnlyShopifyGraphqlQuery(`{ shop { name } }`),
    ).not.toThrow();
  });

  it("rejects mutations", () => {
    expect(() =>
      assertReadOnlyShopifyGraphqlQuery(`
        mutation SetProduct {
          productUpdate(input: { id: "gid://shopify/Product/1" }) {
            product { id }
          }
        }
      `),
    ).toThrow("read-only Shopify GraphQL");
  });

  it("aggregates product sales by units, revenue, and order count", () => {
    const rows = aggregateShopifyProductSalesForTest([
      {
        id: "order_1",
        name: "#1001",
        createdAt: "2026-05-10T12:00:00Z",
        lineItems: {
          pageInfo: { hasNextPage: false },
          edges: [
            {
              node: {
                title: "Paint",
                quantity: 2,
                originalTotalSet: {
                  shopMoney: { amount: "30.00", currencyCode: "ILS" },
                },
                discountedTotalSet: {
                  shopMoney: { amount: "24.00", currencyCode: "ILS" },
                },
                product: {
                  id: "gid://shopify/Product/1",
                  handle: "paint",
                  title: "Paint",
                },
              },
            },
          ],
        },
      },
      {
        id: "order_2",
        name: "#1002",
        createdAt: "2026-05-11T12:00:00Z",
        lineItems: {
          pageInfo: { hasNextPage: false },
          edges: [
            {
              node: {
                title: "Paint",
                quantity: 3,
                originalTotalSet: {
                  shopMoney: { amount: "45.00", currencyCode: "ILS" },
                },
                discountedTotalSet: {
                  shopMoney: { amount: "45.00", currencyCode: "ILS" },
                },
                product: {
                  id: "gid://shopify/Product/1",
                  handle: "paint",
                  title: "Paint",
                },
              },
            },
          ],
        },
      },
    ]);

    expect(rows).toEqual([
      {
        productId: "gid://shopify/Product/1",
        handle: "paint",
        title: "Paint",
        orderCount: 2,
        unitsSold: 5,
        grossRevenue: 75,
        netRevenue: 69,
        currency: "ILS",
        firstSoldAt: "2026-05-10T12:00:00Z",
        lastSoldAt: "2026-05-11T12:00:00Z",
        sampleOrders: ["#1001", "#1002"],
      },
    ]);
  });

  it("builds Shopify order search queries with optional status", () => {
    expect(
      buildShopifyOrderQueryForTest("2026-05-01", "2026-05-14", "paid"),
    ).toBe(
      "created_at:>=2026-05-01T00:00:00Z created_at:<=2026-05-14T23:59:59Z financial_status:paid",
    );
    expect(buildShopifyOrderQueryForTest("2026-05-01", "2026-05-14")).toBe(
      "created_at:>=2026-05-01T00:00:00Z created_at:<=2026-05-14T23:59:59Z",
    );
  });

  it("aggregates sales into dated buckets", () => {
    const rows = aggregateShopifySalesByPeriodForTest(
      [
        {
          createdAt: "2026-05-10T12:00:00Z",
          currentTotalPriceSet: {
            shopMoney: { amount: "100.00", currencyCode: "ILS" },
          },
        },
        {
          createdAt: "2026-05-10T16:00:00Z",
          currentTotalPriceSet: {
            shopMoney: { amount: "40.50", currencyCode: "ILS" },
          },
        },
        {
          createdAt: "2026-05-11T09:00:00Z",
          currentTotalPriceSet: {
            shopMoney: { amount: "20.00", currencyCode: "ILS" },
          },
        },
      ],
      "day",
    );

    expect(rows).toEqual([
      {
        period: "2026-05-10",
        orderCount: 2,
        sales: 140.5,
        averageOrderValue: 70.25,
        currency: "ILS",
      },
      {
        period: "2026-05-11",
        orderCount: 1,
        sales: 20,
        averageOrderValue: 20,
        currency: "ILS",
      },
    ]);
  });
});
