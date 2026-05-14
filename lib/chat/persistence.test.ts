import { describe, expect, it } from "vitest";

import { summarizeStoredMessageForHistory } from "@/lib/chat/persistence";
import type { ChatWidget } from "@/lib/chat/widgets";

describe("chat persistence history", () => {
  it("keeps assistant body, tool, and widget facts for follow-up references", () => {
    const widgets: ChatWidget[] = [
      {
        type: "product_card",
        props: {
          name: "Summer Breeze Softener",
          metrics: [{ label: "Quantity sold", value: 18 }],
        },
      },
      {
        type: "followup_chips",
        props: {
          prompts: [
            { label: "Inventory", prompt: "Check inventory" },
            { label: "Orders", prompt: "Show orders" },
          ],
        },
      },
    ];

    const summary = summarizeStoredMessageForHistory({
      body: "The best-selling product is Summer Breeze Softener.",
      toolName: "shopify_admin_graphql_read",
      widgets,
    });

    expect(summary).toContain("Tool used: shopify_admin_graphql_read");
    expect(summary).toContain("The best-selling product is Summer Breeze Softener.");
    expect(summary).toContain("Widget product: Summer Breeze Softener");
    expect(summary).toContain("Quantity sold: 18");
    expect(summary).toContain("Widget follow-ups: Inventory; Orders");
  });
});
