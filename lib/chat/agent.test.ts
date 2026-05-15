import { describe, expect, it } from "vitest";

import {
  buildInitialMessagesForTest,
  extractUserAuthoredMessage,
  hasLocalOraSignalRecord,
  parseConnectorAgentFinal,
  shouldUseConnectorToolsForMessage,
  wantsConnectedDataRead,
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

  it("separates the user request from appended Ora context", () => {
    const message = [
      "Explain this Signal in plain language.",
      "",
      "Current Ora context:",
      "Local Ora Signal record.",
      "Signal: Inventory risk",
    ].join("\n");

    expect(extractUserAuthoredMessage(message)).toBe(
      "Explain this Signal in plain language.",
    );
    expect(hasLocalOraSignalRecord(message)).toBe(true);
    expect(wantsConnectedDataRead(extractUserAuthoredMessage(message))).toBe(
      false,
    );
  });

  it("requires explicit connected-data intent before reading tools for Signal context", () => {
    const signalContext = [
      "",
      "",
      "Current Ora context:",
      "Local Ora Signal record.",
      "Signal: Inventory risk",
    ].join("\n");

    expect(wantsConnectedDataRead("Explain this Signal.")).toBe(false);
    expect(shouldUseConnectorToolsForMessage(`Explain this.${signalContext}`))
      .toBe(false);
    expect(wantsConnectedDataRead("What is the next safe step?")).toBe(false);
    expect(
      shouldUseConnectorToolsForMessage(
        `What is the next safe step?${signalContext}`,
      ),
    ).toBe(false);
    expect(
      wantsConnectedDataRead(
        "Show the connected data behind 55 active products are unavailable.",
      ),
    ).toBe(true);
    expect(
      shouldUseConnectorToolsForMessage(
        `Show the connected data behind this Signal.${signalContext}`,
      ),
    ).toBe(true);
    expect(
      wantsConnectedDataRead("Validate this Signal against Shopify inventory."),
    ).toBe(true);
  });

  it("keeps general store chat on connector tools", () => {
    expect(shouldUseConnectorToolsForMessage("Show top sellers.")).toBe(true);
  });
});
