import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/session";
import { ConnectorAgentCancelledError, isConnectorAgentCancelledError } from "@/lib/chat/agent";
import {
  buildDirectSuggestions,
  resolveChatContextKind,
} from "@/lib/chat/context";
import {
  getPersistedHistoryLimit,
  resolveChatTurnHistory,
  type ChatRequestScope,
} from "@/lib/chat/history-policy";
import { answerConnectorChat } from "@/lib/chat/responder";
import {
  getLatestChatSnapshot,
  getConversationHistory,
  getOrCreateChatSession,
  listChatSessions,
  recordAssistantChatMessage,
  recordUserChatMessage,
} from "@/lib/chat/persistence";
import {
  cancelChatRun,
  createChatRun,
  emitChatRunEvent,
  type ChatRunEventType,
} from "@/lib/chat/runs";
import { enrichChatWidgets } from "@/lib/chat/widget-enrichment";
import { ChatWidgetSchema, type ChatWidget } from "@/lib/chat/widgets";
import {
  buildSignalContextBlock,
  buildSignalStatusWidgets,
  getSignalChatRecord,
  type SignalChatRecord,
} from "@/lib/chat/signal-context";

const chatHistoryTurnSchema = z.object({
  role: z.enum(["assistant", "user"]),
  content: z.string().min(1).max(2000),
});

const chatContextSchema = z.object({
  source: z.string().max(80).optional(),
  title: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
  defaultPrompt: z.string().max(1000).optional(),
  href: z.string().max(300).optional(),
  signalId: z.string().max(80).optional(),
  actionPlanId: z.string().max(80).optional(),
  objectType: z.string().max(80).optional(),
  objectId: z.string().max(160).optional(),
  widgetType: z
    .enum([
      "kpi_card",
      "scorecard_grid",
      "stat_list",
      "data_table",
      "bar_chart",
      "product_card",
      "alert_card",
    ])
    .optional(),
  dataSummary: z.string().max(2600).optional(),
});

const chatRequestSchema = z.object({
  message: z.string().min(1).max(1000),
  sessionId: z.string().uuid().nullable().optional(),
  history: z.array(chatHistoryTurnSchema).max(10).default([]),
  scope: z.enum(["general", "direct"]).default("general"),
  contextMode: z.enum(["focused", "clean", "thread"]).default("focused"),
  context: chatContextSchema.nullable().optional(),
});

type ChatRequest = z.infer<typeof chatRequestSchema>;
type ChatUser = {
  id: string;
  companyId: string;
};

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user.companyId) {
      return NextResponse.json({ sessionId: null, messages: [], sessions: [] });
    }

    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    const includeSessions = url.searchParams.get("includeSessions") === "1";
    const scope = {
      userId: user.id,
      companyId: user.companyId,
    };
    const [snapshot, sessions] = await Promise.all([
      getLatestChatSnapshot(scope, sessionId),
      includeSessions ? listChatSessions(scope) : Promise.resolve(undefined),
    ]);

    return NextResponse.json(
      includeSessions ? { ...snapshot, sessions } : snapshot,
    );
  } catch {
    return NextResponse.json({ sessionId: null, messages: [], sessions: [] });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user.companyId) {
      throw new Error("Create a company before using connected tools.");
    }
    const parsed = addRefererSignalContext(
      chatRequestSchema.parse(await request.json()),
      request,
    );
    const chatUser = {
      id: user.id,
      companyId: user.companyId,
    };

    if (wantsStream(request)) {
      return streamChatTurn(parsed, chatUser);
    }

    return NextResponse.json(await runChatTurn(parsed, chatUser));
  } catch (error) {
    return NextResponse.json(
      {
        sessionId: null,
        reply:
          error instanceof Error
            ? error.message
            : "Ora could not answer from connected tools.",
        tools: [],
        widgets: [],
      },
      { status: 200 },
    );
  }
}

function addRefererSignalContext(parsed: ChatRequest, request: Request): ChatRequest {
  const refererPath = getSameOriginPath(request.headers.get("referer"));
  if (!refererPath) return parsed;

  const signalId = getSignalIdFromPath(refererPath);
  if (!signalId) return parsed;
  if (parsed.context?.signalId || parsed.context?.href?.startsWith("/signals/")) {
    return parsed;
  }

  return {
    ...parsed,
    context: {
      ...(parsed.context ?? {}),
      source: parsed.context?.source ?? "signal-page",
      title: parsed.context?.title ?? "Signal detail",
      href: refererPath,
      signalId,
      objectType: parsed.context?.objectType ?? "signal",
      objectId: parsed.context?.objectId ?? signalId,
    },
  };
}

function getSameOriginPath(referer: string | null) {
  if (!referer) return null;

  try {
    const url = new URL(referer);

    return `${url.pathname}${url.search}`;
  } catch {
    return null;
  }
}

function getSignalIdFromPath(path: string) {
  const match = path.match(/^\/signals\/([^/?#]+)/);

  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function runChatTurn(
  parsed: ChatRequest,
  user: ChatUser,
  options: {
    signal?: AbortSignal;
    emit?: (type: ChatRunEventType, data: unknown) => void;
  } = {},
) {
  throwIfCancelled(options.signal);
  const session = await getOrCreateChatSession(
    {
      userId: user.id,
      companyId: user.companyId,
    },
    parsed.sessionId,
  );
  options.emit?.("session", { sessionId: session.id });

  const historyLimit = getPersistedHistoryLimit(parsed.contextMode);
  const persistedHistory =
    parsed.scope === "general"
      ? await getConversationHistory(session.id, {
          limit: historyLimit,
        })
      : [];
  const history = resolveChatTurnHistory({
    scope: parsed.scope,
    contextMode: parsed.contextMode,
    persistedHistory,
    clientHistory: parsed.history,
  });
  const signalContext = await getSignalChatRecord(
    user.companyId,
    parsed.context,
  );

  throwIfCancelled(options.signal);
  await recordUserChatMessage(session.id, parsed.message);

  const message = addUiContextToMessage(
    parsed.message,
    parsed.context,
    signalContext,
  );
  const response = await answerConnectorChat(
    message,
    {
      userId: user.id,
      companyId: user.companyId,
    },
    history,
    {
      signal: options.signal,
      onStatus: (message) => options.emit?.("status", { message }),
      onToolStart: (toolName) =>
        options.emit?.("tool", { toolName, status: "running" }),
      onToolFinish: (toolName, status) =>
        options.emit?.("tool", {
          toolName,
          status: status === "success" ? "complete" : "failed",
        }),
    },
  );
  const enrichedResponse = {
    ...response,
    widgets: ensureContextAnswerWidgets(
      enrichChatWidgets(response.widgets, response.tools),
      parsed.context,
      response.reply,
      signalContext,
      parsed.message,
      parsed.scope,
    ),
  };

  throwIfCancelled(options.signal);
  await recordAssistantChatMessage(session.id, enrichedResponse);

  return {
    ...enrichedResponse,
    sessionId: session.id,
  };
}

function streamChatTurn(parsed: ChatRequest, user: ChatUser) {
  const run = createChatRun({
    companyId: user.companyId,
    userId: user.id,
  });
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (type: ChatRunEventType, data: unknown) => {
        if (closed) return;

        emitChatRunEvent(run.id, type, data);
        controller.enqueue(encoder.encode(formatSseEvent(type, data)));
      };

      emit("run", { runId: run.id });

      void (async () => {
        try {
          const response = await runChatTurn(parsed, user, {
            signal: run.controller.signal,
            emit,
          });
          throwIfCancelled(run.controller.signal);
          emit("complete", response);
        } catch (error) {
          if (
            run.controller.signal.aborted ||
            isConnectorAgentCancelledError(error)
          ) {
            emit("cancelled", { message: "Stopped." });
          } else {
            emit("error", {
              message:
                error instanceof Error
                  ? error.message
                  : "Ora could not answer from connected tools.",
            });
          }
        } finally {
          closed = true;
          try {
            controller.close();
          } catch {
            // The browser may have already closed the stream after cancellation.
          }
        }
      })();
    },
    cancel() {
      closed = true;
      cancelChatRun(run.id, {
        companyId: user.companyId,
        userId: user.id,
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}

function wantsStream(request: Request) {
  return (
    request.headers.get("accept")?.includes("text/event-stream") ||
    request.headers.get("x-ora-chat-stream") === "1"
  );
}

function addUiContextToMessage(
  message: string,
  context: ChatRequest["context"],
  signalContext?: SignalChatRecord | null,
) {
  if (!context && !signalContext) return message;

  const contextKind = context ? resolveChatContextKind(context) : null;
  const details = [
    contextKind ? `Focus intent: ${contextKind}` : "",
    context?.source ? `Source: ${context.source}` : "",
    context?.title ? `Title: ${context.title}` : "",
    context?.description ? `Description: ${context.description}` : "",
    context?.defaultPrompt ? `Default question: ${context.defaultPrompt}` : "",
    context?.href ? `Path: ${context.href}` : "",
    context?.signalId ? `Signal ID: ${context.signalId}` : "",
    context?.actionPlanId ? `ActionPlan ID: ${context.actionPlanId}` : "",
    context?.objectType ? `Object type: ${context.objectType}` : "",
    context?.objectId ? `Object ID: ${context.objectId}` : "",
    context?.widgetType ? `Widget type: ${context.widgetType}` : "",
    context?.dataSummary ? `Selected data summary: ${context.dataSummary}` : "",
  ].filter(Boolean);
  const signalDetails = signalContext
    ? `\n\n${buildSignalContextBlock(signalContext)}`
    : "";

  if (details.length === 0 && !signalDetails) return message;

  return `${message}\n\nCurrent Ora context:\n${details.join(
    "\n",
  )}${signalDetails}\n\nUse this context silently to understand the current page, object, widget, or Signal. If a selected data summary is present, treat it as the starting fact set for the focused question. Do not mention clicks, UI context, or that the user selected something. Tailor follow-up suggestions to this specific context, not to generic store chat. For questions about status, approval, execution, or outcome of this Signal, answer from the local Ora Signal record first. Chat remains read-only.`;
}

function ensureContextAnswerWidgets(
  widgets: ChatWidget[],
  context: ChatRequest["context"],
  reply: string,
  signalContext?: SignalChatRecord | null,
  userMessage = "",
  scope: ChatRequestScope = "general",
) {
  if (!context) return widgets;
  let nextWidgets = widgets;

  if (shouldShowSignalStatusWidget(signalContext, userMessage, widgets)) {
    nextWidgets = [...buildSignalStatusWidgets(signalContext), ...nextWidgets];
  } else if (!nextWidgets.some((widget) => widget.type !== "followup_chips")) {
    nextWidgets = [
      ...(signalContext
        ? buildSignalStatusWidgets(signalContext)
        : [
            ChatWidgetSchema.parse({
              type: "alert_card",
              props: {
                tone: "info",
                title: context.title
                  ? `${context.title} takeaway`
                  : "Current context",
                body: summarizeReply(reply),
              },
            }),
          ]),
      ...nextWidgets,
    ];
  }

  if (scope === "direct") {
    return ensureDirectFollowupWidget(nextWidgets, context);
  }

  return nextWidgets.slice(0, 5);
}

function ensureDirectFollowupWidget(
  widgets: ChatWidget[],
  context: NonNullable<ChatRequest["context"]>,
) {
  if (widgets.some((widget) => widget.type === "followup_chips")) {
    return widgets.slice(0, 5);
  }

  const prompts = buildDirectSuggestions(context)
    .slice(0, 2)
    .map((suggestion) => ({
      label: suggestion.label,
      prompt: suggestion.prompt,
    }));

  if (prompts.length < 2) return widgets.slice(0, 5);

  const followups = ChatWidgetSchema.parse({
    type: "followup_chips",
    props: {
      title: "Suggested next reads",
      prompts,
    },
  });

  return [
    ...widgets.filter((widget) => widget.type !== "followup_chips").slice(0, 4),
    followups,
  ];
}

function shouldShowSignalStatusWidget(
  signalContext: SignalChatRecord | null | undefined,
  userMessage: string,
  widgets: ChatWidget[],
): signalContext is SignalChatRecord {
  if (!signalContext) return false;
  if (widgets.some((widget) => widget.type === "scorecard_grid")) return false;

  return /\b(action\s*plan|approval|approved|execution|executed|outcome|status|this signal|signal status)\b/i.test(
    userMessage,
  );
}

function summarizeReply(reply: string) {
  const sentence = reply
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)[0]
    ?.trim();

  return (sentence || reply).slice(0, 360);
}

function formatSseEvent(type: string, data: unknown) {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new ConnectorAgentCancelledError();
  }
}
