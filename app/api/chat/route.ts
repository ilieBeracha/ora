import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/session";
import { ConnectorAgentCancelledError, isConnectorAgentCancelledError } from "@/lib/chat/agent";
import { answerConnectorChat } from "@/lib/chat/responder";
import {
  getLatestChatSnapshot,
  getConversationHistory,
  getOrCreateChatSession,
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

const chatHistoryTurnSchema = z.object({
  role: z.enum(["assistant", "user"]),
  content: z.string().min(1).max(2000),
});

const chatRequestSchema = z.object({
  message: z.string().min(1).max(1000),
  sessionId: z.string().uuid().nullable().optional(),
  history: z.array(chatHistoryTurnSchema).max(10).default([]),
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
      return NextResponse.json({ sessionId: null, messages: [] });
    }

    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    const snapshot = await getLatestChatSnapshot(
      {
        userId: user.id,
        companyId: user.companyId,
      },
      sessionId,
    );

    return NextResponse.json(snapshot);
  } catch {
    return NextResponse.json({ sessionId: null, messages: [] });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user.companyId) {
      throw new Error("Create a company before using connected tools.");
    }
    const parsed = chatRequestSchema.parse(await request.json());
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

  const persistedHistory = await getConversationHistory(session.id);
  const history =
    persistedHistory.length > 0 ? persistedHistory : parsed.history;

  throwIfCancelled(options.signal);
  await recordUserChatMessage(session.id, parsed.message);

  const response = await answerConnectorChat(
    parsed.message,
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
    widgets: enrichChatWidgets(response.widgets, response.tools),
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

function formatSseEvent(type: string, data: unknown) {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new ConnectorAgentCancelledError();
  }
}
