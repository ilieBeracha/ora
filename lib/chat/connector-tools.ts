import {
  getConnectedProviders,
  isConnectorConnected,
} from "@/lib/connectors/store";
import {
  findConnectorThatOwnsTool,
  listRegisteredConnectors,
} from "@/lib/connectors/registry";
import type {
  ConnectorAdapter,
  ConnectorContext,
  ConnectorProvider,
} from "@/lib/connectors/types";

export async function getAvailableChatTools(ctx: ConnectorContext) {
  const connected = await getConnectedProviders(ctx.companyId);

  return getAvailableToolsFromConnectors(listRegisteredConnectors(), connected);
}

export function getAvailableToolsFromConnectors(
  connectors: ConnectorAdapter[],
  connected: Set<ConnectorProvider>,
) {
  return connectors
    .filter((connector) => connected.has(connector.provider))
    .flatMap((connector) => connector.tools)
    .filter((tool) => tool.readOnly);
}

export async function executeChatTool(
  toolName: string,
  input: unknown,
  ctx: ConnectorContext,
) {
  const connector = findConnectorThatOwnsTool(toolName);

  if (!connector) {
    throw new Error("Unknown tool");
  }

  const connected = await isConnectorConnected(ctx.companyId, connector.provider);

  if (!connected) {
    throw new Error(`${connector.label} is not connected`);
  }

  const tool = getReadOnlyToolForChat(connector, toolName);

  return tool.execute(tool.inputSchema.parse(input), ctx);
}

export function getReadOnlyToolForChat(
  connector: ConnectorAdapter,
  toolName: string,
) {
  const tool = connector.tools.find((candidate) => candidate.name === toolName);

  if (!tool?.readOnly) {
    throw new Error("Chat can only run read-only tools");
  }

  return tool;
}
