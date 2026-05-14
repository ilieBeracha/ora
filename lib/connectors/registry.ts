import type {
  ConnectorAdapter,
  ConnectorProvider,
} from "@/lib/connectors/types";
import { klaviyoConnector } from "@/lib/connectors/klaviyo";
import { shopifyConnector } from "@/lib/connectors/shopify";

export const CONNECTORS: Partial<Record<ConnectorProvider, ConnectorAdapter>> = {
  klaviyo: klaviyoConnector,
  shopify: shopifyConnector,
};

export function getConnectorAdapter(provider: ConnectorProvider) {
  return CONNECTORS[provider] ?? null;
}

export function findConnectorThatOwnsTool(toolName: string) {
  return (
    Object.values(CONNECTORS).find((connector) =>
      connector.tools.some((tool) => tool.name === toolName),
    ) ?? null
  );
}

export function listRegisteredConnectors() {
  return Object.values(CONNECTORS);
}
