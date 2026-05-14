import {
  answerWithConnectorAgent,
  type ConnectorAgentOptions,
  type ConversationTurn,
} from "@/lib/chat/agent";
import type { ConnectorContext } from "@/lib/connectors/types";

export async function answerConnectorChat(
  message: string,
  ctx: ConnectorContext,
  history: ConversationTurn[] = [],
  options: ConnectorAgentOptions = {},
) {
  return answerWithConnectorAgent(message, ctx, history, options);
}
