import { describe, expect, it } from "vitest";

import {
  buildDirectSuggestions,
  buildFocusBriefContent,
  resolveChatContextKind,
  type ChatOpenContext,
} from "@/lib/chat/context";

describe("chat context intent", () => {
  it("tailors direct questions to product widgets", () => {
    const context: ChatOpenContext = {
      source: "chat-widget",
      title: "Summer Breeze Softener",
      widgetType: "product_card",
      dataSummary:
        "Product: Summer Breeze Softener; Stock: 4; Units sold: 18",
    };

    expect(resolveChatContextKind(context)).toBe("product_widget");
    expect(buildFocusBriefContent(context)).toMatchObject({
      sourceLabel: "Product",
      actionTitle: "Inspect product evidence",
      flow: ["Product", "Sales", "Inventory"],
    });
    expect(buildDirectSuggestions(context).map((item) => item.label)).toEqual([
      "Product read",
      "Sales evidence",
      "Inventory risk",
    ]);
  });

  it("keeps ActionPlan questions on approval and execution state", () => {
    const context: ChatOpenContext = {
      source: "signal-section",
      title: "Action plan",
      objectType: "action_plan",
      actionPlanId: "plan_123",
    };

    expect(resolveChatContextKind(context)).toBe("action_plan");
    expect(buildDirectSuggestions(context).map((item) => item.label)).toEqual([
      "Review plan",
      "Approval",
      "Execution",
    ]);
  });

  it("uses table-specific questions for selected table widgets", () => {
    const context: ChatOpenContext = {
      source: "chat-widget",
      title: "Recent paid orders",
      widgetType: "data_table",
      dataSummary: "Table: Recent paid orders; Row 1: Order: 1001, Total: 92",
    };

    expect(resolveChatContextKind(context)).toBe("data_table_widget");
    expect(buildDirectSuggestions(context).map((item) => item.label)).toEqual([
      "Key rows",
      "Pattern",
      "Validate",
    ]);
  });
});
