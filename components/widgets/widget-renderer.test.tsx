import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WidgetList } from "@/components/widgets/widget-renderer";
import type { ChatWidget } from "@/lib/chat/widgets";

const widgets: ChatWidget[] = [
  {
    type: "product_card",
    props: {
      name: "Summer Breeze Softener",
      stock: 4,
      metrics: [{ label: "Units sold", value: 18 }],
    },
  },
  {
    type: "followup_chips",
    props: {
      prompts: [
        { label: "Sales", prompt: "Show sales" },
        { label: "Inventory", prompt: "Show inventory" },
      ],
    },
  },
];

describe("chat widget rendering", () => {
  it("keeps answer widgets static inside assistant chat", () => {
    const html = renderToStaticMarkup(
      <WidgetList allowChatOpen={false} widgets={widgets} />,
    );

    expect(html).not.toContain("data-chat-open");
    expect(html).not.toContain("data-chat-explain");
    expect(html).toContain("chat-widget-static");
    expect(html).toContain("Summer Breeze Softener");
  });

  it("keeps widget context available when widgets are rendered as page triggers", () => {
    const html = renderToStaticMarkup(<WidgetList widgets={widgets} />);

    expect(html).toContain("data-chat-open");
    expect(html).toContain('data-chat-widget-type="product_card"');
    expect(html).toContain("Product: Summer Breeze Softener");
  });
});
