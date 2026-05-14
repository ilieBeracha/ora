import { describe, expect, it } from "vitest";

import { enrichChatWidgets } from "@/lib/chat/widget-enrichment";

describe("enrichChatWidgets", () => {
  it("adds product sales widgets from Shopify product-sales results", () => {
    const widgets = enrichChatWidgets([], [
      {
        toolName: "shopify_get_product_sales",
        status: "success",
        result: {
          scannedOrders: 20,
          productCount: 2,
          sortBy: "unitsSold",
          products: [
            {
              title: "Summer Breeze Softener",
              unitsSold: 12,
              orderCount: 8,
              netRevenue: 120,
              currency: "ILS",
            },
            {
              title: "Miracle Bleach",
              unitsSold: 7,
              orderCount: 5,
              netRevenue: 80,
              currency: "ILS",
            },
          ],
        },
      },
    ]);

    expect(widgets.map((widget) => widget.type)).toEqual([
      "product_card",
      "scorecard_grid",
      "bar_chart",
      "data_table",
    ]);
  });

  it("keeps existing widgets and backfills product tables", () => {
    const widgets = enrichChatWidgets(
      [
        {
          type: "alert_card",
          props: {
            tone: "info",
            title: "Found active products",
          },
        },
      ],
      [
        {
          toolName: "shopify_list_mirrored_products",
          status: "success",
          result: [
            {
              title: "A",
              status: "ACTIVE",
              totalInventory: 4,
              productType: "Paint",
              vendor: "Ora",
            },
            {
              title: "B",
              status: "DRAFT",
              totalInventory: 0,
              productType: null,
              vendor: null,
            },
          ],
        },
      ],
    );

    expect(widgets[0]?.type).toBe("alert_card");
    expect(widgets.some((widget) => widget.type === "scorecard_grid")).toBe(
      true,
    );
    expect(widgets.some((widget) => widget.type === "data_table")).toBe(true);
  });

  it("builds Klaviyo campaign widgets from collection results", () => {
    const widgets = enrichChatWidgets([], [
      {
        toolName: "klaviyo_get_campaigns",
        status: "success",
        result: {
          count: 2,
          campaigns: [
            {
              name: "Winback",
              status: "Sent",
              channel: "email",
              sendTime: "2026-05-01T10:00:00Z",
            },
            {
              name: "Launch",
              status: "Sent",
              channel: "email",
              sendTime: "2026-05-04T10:00:00Z",
            },
          ],
        },
      },
    ]);

    expect(widgets.map((widget) => widget.type)).toEqual([
      "scorecard_grid",
      "data_table",
    ]);
  });
});
