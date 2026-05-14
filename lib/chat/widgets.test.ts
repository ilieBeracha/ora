import { describe, expect, it } from "vitest";

import {
  buildProductCountsWidget,
  buildProductListWidget,
  buildShopWidget,
  ChatWidgetSchema,
} from "@/lib/chat/widgets";

describe("chat widgets", () => {
  it("renders connected shop data as a stat widget", () => {
    const widget = buildShopWidget({
      name: "TAMU PANTS",
      email: "ops@example.com",
      myshopify_domain: "tamu.myshopify.com",
    });

    expect(widget).toMatchObject({
      type: "stat_list",
      props: {
        title: "Connected Shopify store",
        items: [
          { label: "Store", value: "TAMU PANTS" },
          { label: "Domain", value: "tamu.myshopify.com" },
          { label: "Email", value: "ops@example.com" },
        ],
      },
    });
  });

  it("renders mirrored product counts with a total row", () => {
    const widget = buildProductCountsWidget([
      { status: "ACTIVE", count: 450 },
      { status: "DRAFT", count: 35 },
    ]);

    expect(widget.type).toBe("stat_list");
    if (widget.type !== "stat_list") {
      throw new Error("Expected stat_list widget.");
    }

    expect(widget.props.items).toEqual([
      { label: "Total", value: 485 },
      { label: "Active", value: 450 },
      { label: "Draft", value: 35 },
    ]);
  });

  it("renders product lists as a compact table widget", () => {
    const widget = buildProductListWidget(
      [
        {
          title: "Hydro Paint",
          status: "ACTIVE",
          productType: "Paint",
          totalInventory: 12,
        },
      ],
      "ACTIVE",
    );

    expect(widget).toMatchObject({
      type: "data_table",
      props: {
        title: "Active products",
        rows: [
          {
            title: "Hydro Paint",
            status: "Active",
            inventory: 12,
            type: "Paint",
          },
        ],
      },
    });
  });

  it("accepts the core assistant widget vocabulary", () => {
    const widgets = [
      {
        type: "kpi_card",
        props: { label: "Paid orders", value: 42, unit: "orders" },
      },
      {
        type: "scorecard_grid",
        props: {
          title: "Product snapshot",
          cards: [
            { label: "Units sold", value: 18 },
            { label: "Revenue", value: 460, unit: "ILS" },
          ],
        },
      },
      {
        type: "bar_chart",
        props: {
          title: "Top sellers",
          data: [{ product: "Cleaner", quantity: 12 }],
          xKey: "product",
          yKey: "quantity",
          valueFormat: "number",
        },
      },
      {
        type: "product_card",
        props: {
          name: "Cleaner",
          metrics: [{ label: "Units sold", value: 12 }],
        },
      },
      {
        type: "alert_card",
        props: { tone: "info", title: "Sampled recent paid orders" },
      },
      {
        type: "followup_chips",
        props: {
          prompts: [
            { label: "Show orders", prompt: "Show recent orders for Cleaner" },
            { label: "Compare products", prompt: "Compare top 5 products" },
          ],
        },
      },
    ];

    for (const widget of widgets) {
      expect(ChatWidgetSchema.parse(widget)).toMatchObject(widget);
    }
  });
});
