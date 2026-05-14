import { prisma } from "@/lib/db";
import { ChatWidgetSchema, type ChatWidget } from "@/lib/chat/widgets";
import type { ConversationTurn, ConnectorAgentResponse } from "@/lib/chat/agent";
import type { Prisma } from "@/lib/generated/prisma/client";

export type ChatClientMessage = {
  id: string;
  role: "assistant" | "user";
  body: string;
  toolName?: string;
  widgets: ChatWidget[];
  createdAt: string;
};

export type ChatSessionSnapshot = {
  sessionId: string | null;
  messages: ChatClientMessage[];
};

type ChatSessionScope = {
  companyId: string;
  userId: string;
};

export async function getOrCreateChatSession(
  scope: ChatSessionScope,
  sessionId?: string | null,
) {
  if (sessionId) {
    const existing = await prisma.chatSession.findFirst({
      where: {
        id: sessionId,
        companyId: scope.companyId,
        userId: scope.userId,
      },
      select: { id: true },
    });

    if (existing) return existing;
  }

  return prisma.chatSession.create({
    data: {
      companyId: scope.companyId,
      userId: scope.userId,
    },
    select: { id: true },
  });
}

export async function getLatestChatSnapshot(
  scope: ChatSessionScope,
  sessionId?: string | null,
): Promise<ChatSessionSnapshot> {
  const session = sessionId
    ? await prisma.chatSession.findFirst({
        where: {
          id: sessionId,
          companyId: scope.companyId,
          userId: scope.userId,
        },
        select: { id: true },
      })
    : await prisma.chatSession.findFirst({
        where: {
          companyId: scope.companyId,
          userId: scope.userId,
        },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      });

  if (!session) {
    return {
      sessionId: null,
      messages: [],
    };
  }

  return {
    sessionId: session.id,
    messages: await getClientMessages(session.id),
  };
}

export async function getConversationHistory(
  sessionId: string,
): Promise<ConversationTurn[]> {
  const messages = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take: 24,
  });

  return messages
    .reverse()
    .map((message) => ({
      role: message.role,
      content: summarizeStoredMessageForHistory({
        body: message.body,
        toolName: message.toolName,
        widgets: parseWidgets(message.widgetsJson),
      }),
    }))
    .filter((turn) => turn.content.trim().length > 0)
    .slice(-12);
}

export async function recordUserChatMessage(
  sessionId: string,
  body: string,
) {
  await prisma.$transaction([
    prisma.chatSession.updateMany({
      where: { id: sessionId, title: null },
      data: {
        title: makeSessionTitle(body),
      },
    }),
    prisma.chatMessage.create({
      data: {
        sessionId,
        role: "user",
        body,
      },
    }),
  ]);
}

export async function recordAssistantChatMessage(
  sessionId: string,
  response: ConnectorAgentResponse,
) {
  await prisma.chatMessage.create({
    data: {
      sessionId,
      role: "assistant",
      body: response.reply,
      toolName: response.tools[0]?.toolName,
      toolsJson: toJson(response.tools),
      widgetsJson: toJson(response.widgets),
    },
  });
}

async function getClientMessages(sessionId: string) {
  const messages = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    take: 80,
  });

  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    body: message.body,
    toolName: message.toolName ?? undefined,
    widgets: parseWidgets(message.widgetsJson),
    createdAt: message.createdAt.toISOString(),
  }));
}

export function summarizeStoredMessageForHistory(message: {
  body: string;
  toolName?: string | null;
  widgets?: ChatWidget[];
}) {
  const parts = [
    message.toolName ? `Tool used: ${message.toolName}` : "",
    message.body,
    summarizeWidgetsForHistory(message.widgets ?? []),
  ].filter(Boolean);

  return parts.join("\n").slice(0, 3000);
}

export function summarizeWidgetsForHistory(widgets: ChatWidget[]) {
  return widgets
    .map((widget) => {
      if (widget.type === "kpi_card") {
        const unit = widget.props.unit ? ` ${widget.props.unit}` : "";
        return `Widget KPI: ${widget.props.label}: ${widget.props.value}${unit}`;
      }

      if (widget.type === "scorecard_grid") {
        const cards = widget.props.cards
          .map((card) => `${card.label}: ${card.value}${card.unit ? ` ${card.unit}` : ""}`)
          .join("; ");
        return `Widget${widget.props.title ? ` "${widget.props.title}"` : ""}: ${cards}`;
      }

      if (widget.type === "stat_list") {
        const items = widget.props.items
          .map((item) => `${item.label}: ${item.value}`)
          .join("; ");
        return `Widget${widget.props.title ? ` "${widget.props.title}"` : ""}: ${items}`;
      }

      if (widget.type === "bar_chart") {
        const rows = widget.props.data
          .slice(0, 5)
          .map(
            (row) =>
              `${String(row[widget.props.xKey] ?? "Unknown")}: ${String(
                row[widget.props.yKey] ?? "",
              )}`,
          )
          .join("; ");
        return `Widget${widget.props.title ? ` "${widget.props.title}"` : ""}: ${rows}`;
      }

      if (widget.type === "product_card") {
        const metrics = widget.props.metrics
          ?.map((metric) => `${metric.label}: ${metric.value}`)
          .join("; ");
        return `Widget product: ${widget.props.name}${
          metrics ? `; ${metrics}` : ""
        }`;
      }

      if (widget.type === "alert_card") {
        return `Widget alert: ${widget.props.title}${
          widget.props.body ? `; ${widget.props.body}` : ""
        }`;
      }

      if (widget.type === "followup_chips") {
        return `Widget follow-ups: ${widget.props.prompts
          .map((prompt) => prompt.label)
          .join("; ")}`;
      }

      const columns = widget.props.columns.map((column) => column.key);
      const rows = widget.props.rows
        .slice(0, 5)
        .map((row) =>
          columns
            .map((key) => `${key}: ${String(row[key] ?? "")}`)
            .join(", "),
        )
        .join(" | ");

      return `Widget${widget.props.title ? ` "${widget.props.title}"` : ""}: ${rows}`;
    })
    .filter(Boolean)
    .join("\n");
}

function parseWidgets(value: Prisma.JsonValue | null | undefined) {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => ChatWidgetSchema.safeParse(item))
    .filter((result) => result.success)
    .map((result) => result.data);
}

function makeSessionTitle(body: string) {
  return body.trim().replace(/\s+/g, " ").slice(0, 80);
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
