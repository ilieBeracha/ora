import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  executeChatTool,
  getAvailableToolsFromConnectors,
  getReadOnlyToolForChat,
} from "@/lib/chat/connector-tools";
import * as connectorStore from "@/lib/connectors/store";
import type { ConnectorAdapter } from "@/lib/connectors/types";

vi.mock("@/lib/connectors/store", () => ({
  getConnectedProviders: vi.fn(),
  isConnectorConnected: vi.fn(),
}));

const testConnector: ConnectorAdapter = {
  provider: "shopify",
  label: "Shopify",
  tools: [
    {
      name: "shopify_read",
      description: "Read from Shopify.",
      inputSchema: z.object({}),
      readOnly: true,
      execute: async () => ({}),
    },
    {
      name: "shopify_write",
      description: "Write to Shopify.",
      inputSchema: z.object({}),
      readOnly: false,
      execute: async () => ({}),
    },
  ],
  testConnection: async () => ({ ok: true, checkedAt: new Date() }),
};

describe("connector chat tools", () => {
  it("only exposes read-only tools from connected providers", () => {
    const tools = getAvailableToolsFromConnectors(
      [testConnector],
      new Set(["shopify"]),
    );

    expect(tools.map((tool) => tool.name)).toEqual(["shopify_read"]);
  });

  it("exposes no tools for disconnected providers", () => {
    const tools = getAvailableToolsFromConnectors([testConnector], new Set());

    expect(tools).toEqual([]);
  });

  it("rejects mutating tools for chat execution", () => {
    expect(() => getReadOnlyToolForChat(testConnector, "shopify_write")).toThrow(
      "Chat can only run read-only tools",
    );
  });

  it("re-checks connector status at runtime before executing", async () => {
    vi.mocked(connectorStore.isConnectorConnected).mockResolvedValue(false);

    await expect(
      executeChatTool("shopify_get_shop", {}, { companyId: "company_1" }),
    ).rejects.toThrow("Shopify is not connected");
  });
});
