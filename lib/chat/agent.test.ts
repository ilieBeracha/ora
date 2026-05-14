import { describe, expect, it } from "vitest";

import {
  buildInitialMessagesForTest,
  parseConnectorAgentFinal,
} from "@/lib/chat/agent";

describe("connector agent response parsing", () => {
  it("does not leak raw JSON when widgets use legacy data shape", () => {
    const parsed = parseConnectorAgentFinal(
      JSON.stringify({
        reply: "The top seller is Paint.",
        widgets: [
          {
            type: "stat_list",
            data: [{ label: "Top seller", value: "Paint" }],
          },
        ],
      }),
    );

    expect(parsed.reply).toBe("The top seller is Paint.");
    expect(parsed.widgets).toEqual([
      {
        type: "stat_list",
        props: {
          items: [{ label: "Top seller", value: "Paint" }],
        },
      },
    ]);
  });

  it("falls back to the reply when widget validation fails", () => {
    const parsed = parseConnectorAgentFinal(
      JSON.stringify({
        reply: "I found a top seller.",
        widgets: [{ type: "stat_list", data: [] }],
      }),
    );

    expect(parsed).toEqual({
      reply: "I found a top seller.",
      widgets: [],
    });
  });

  it("includes recent conversation history before the next user message", () => {
    const messages = buildInitialMessagesForTest("give me more data on him", [
      { role: "user", content: "whats the best seller" },
      {
        role: "assistant",
        content:
          "The best-selling product is קושלוייך - מרכך כביסה מפנק - רוח קיץ.\nWidget \"Top Selling Product\": Product: קושלוייך - מרכך כביסה מפנק - רוח קיץ",
      },
    ]);

    expect(messages.map((message) => message.role)).toEqual([
      "system",
      "user",
      "assistant",
      "user",
    ]);
    expect(messages[0]?.content).toContain("resolve references like him");
    expect(messages[2]?.content).toContain(
      "קושלוייך - מרכך כביסה מפנק - רוח קיץ",
    );
    expect(messages.at(-1)?.content).toBe("give me more data on him");
  });
});
