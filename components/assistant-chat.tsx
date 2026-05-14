"use client";

import { FormEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  LoaderCircle,
  MessageSquareText,
  Search,
  Sparkles,
  X,
} from "lucide-react";

import { WidgetList } from "@/components/widgets/widget-renderer";
import type { ChatWidget } from "@/lib/chat/widgets";

type AssistantMessage = {
  id: string;
  role: "assistant" | "user";
  body: string;
  toolName?: string;
  widgets?: ChatWidget[];
};

type ChatResponse = {
  sessionId: string | null;
  reply: string;
  tools: Array<{
    toolName: string;
    status?: "success" | "error";
    result: unknown;
  }>;
  widgets: ChatWidget[];
};

type ChatSnapshot = {
  sessionId: string | null;
  messages: Array<AssistantMessage & { createdAt?: string }>;
};

type ChatHistoryTurn = {
  role: "assistant" | "user";
  content: string;
};

type AssistantSuggestion = {
  label: string;
  prompt: string;
};

const chatSessionStorageKey = "ora-chat-session-id";

const initialMessages: AssistantMessage[] = [
  {
    id: "intro",
    role: "assistant",
    body: "Ask about your connected store ecosystem. Chat only reads from approved connector tools.",
  },
];

export function AssistantChat() {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [pendingLabel, setPendingLabel] = useState("Reading connected tools");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const streamAbortRef = useRef<AbortController | null>(null);
  const cancelledRef = useRef(false);
  const suggestions = useMemo(
    () => buildContextualSuggestions(messages),
    [messages],
  );
  const suggestionTitle = useMemo(
    () => buildSuggestionTitle(messages),
    [messages],
  );

  useEffect(() => {
    let ignore = false;
    const storedSessionId = window.localStorage.getItem(chatSessionStorageKey);
    const url = storedSessionId
      ? `/api/chat?sessionId=${encodeURIComponent(storedSessionId)}`
      : "/api/chat";

    fetch(url)
      .then((response) => response.json() as Promise<ChatSnapshot>)
      .then((snapshot) => {
        if (ignore) return;

        setSessionId(snapshot.sessionId);

        if (snapshot.sessionId) {
          window.localStorage.setItem(chatSessionStorageKey, snapshot.sessionId);
        } else {
          window.localStorage.removeItem(chatSessionStorageKey);
        }

        if (snapshot.messages.length > 0) {
          setMessages(snapshot.messages);
        }
      })
      .catch(() => {
        if (!ignore) {
          window.localStorage.removeItem(chatSessionStorageKey);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    function targetIsInsidePanel(target: EventTarget | null) {
      return target instanceof Node && panelRef.current?.contains(target);
    }

    function handlePointerDown(event: PointerEvent) {
      setIsOpen(Boolean(targetIsInsidePanel(event.target)));
    }

    function handleFocusIn(event: FocusEvent) {
      setIsOpen(Boolean(targetIsInsidePanel(event.target)));
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("focusin", handleFocusIn);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, []);

  useEffect(() => {
    threadRef.current?.scrollTo({
      top: threadRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, pending]);

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = input.trim();
    if (!message || pending) return;

    const userMessage: AssistantMessage = {
      id: crypto.randomUUID(),
      role: "user",
      body: message,
    };
    const history = buildConversationHistory(messages);

    setMessages((current) => [...current, userMessage]);
    setInput("");
    setPending(true);
    setPendingLabel("Starting");
    cancelledRef.current = false;

    const abortController = new AbortController();
    streamAbortRef.current = abortController;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          Accept: "text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message, history, sessionId }),
        signal: abortController.signal,
      });
      const contentType = response.headers.get("content-type") ?? "";

      if (contentType.includes("text/event-stream")) {
        await readChatEventStream(response, (event, data) => {
          handleChatStreamEvent(event, data);
        });
        return;
      }

      if (!contentType.includes("application/json")) {
        throw new Error("The chat route returned an unreadable response.");
      }

      addAssistantResponse((await response.json()) as ChatResponse);
    } catch (error) {
      if (cancelledRef.current || isAbortError(error)) {
        return;
      }

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          body:
            error instanceof Error
              ? error.message
              : "Ora could not reach the chat route. Try again.",
        },
      ]);
    } finally {
      setPending(false);
      setPendingLabel("Reading connected tools");
      activeRunIdRef.current = null;
      streamAbortRef.current = null;
    }
  }

  async function cancelPendingRun() {
    cancelledRef.current = true;
    setPendingLabel("Stopping");

    const runId = activeRunIdRef.current;

    if (runId) {
      await fetch(`/api/chat/runs/${runId}/cancel`, {
        method: "POST",
      }).catch(() => undefined);
    }

    streamAbortRef.current?.abort();
    setPending(false);
    activeRunIdRef.current = null;
    streamAbortRef.current = null;

    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        body: "Stopped.",
      },
    ]);
  }

  function handleSuggestion(
    message: string,
    event?: MouseEvent<HTMLButtonElement>,
  ) {
    event?.currentTarget.blur();
    setIsOpen(true);
    setInput(message);
    requestAnimationFrame(() => formRef.current?.requestSubmit());
  }

  function handleChatStreamEvent(event: string, data: unknown) {
    if (event === "run" && isRecord(data) && typeof data.runId === "string") {
      activeRunIdRef.current = data.runId;
      return;
    }

    if (
      event === "session" &&
      isRecord(data) &&
      typeof data.sessionId === "string"
    ) {
      setSessionId(data.sessionId);
      window.localStorage.setItem(chatSessionStorageKey, data.sessionId);
      return;
    }

    if (
      event === "status" &&
      isRecord(data) &&
      typeof data.message === "string"
    ) {
      setPendingLabel(data.message);
      return;
    }

    if (event === "tool" && isRecord(data) && typeof data.toolName === "string") {
      setPendingLabel(
        data.status === "failed"
          ? `Retrying after ${data.toolName} failed`
          : data.status === "complete"
          ? `Read ${data.toolName}`
          : `Using ${data.toolName}`,
      );
      return;
    }

    if (event === "complete" && isChatResponse(data)) {
      addAssistantResponse(data);
      return;
    }

    if (
      event === "cancelled" &&
      isRecord(data) &&
      typeof data.message === "string" &&
      !cancelledRef.current
    ) {
      const message = data.message;

      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          body: message,
        },
      ]);
      return;
    }

    if (event === "error") {
      throw new Error(
        isRecord(data) && typeof data.message === "string"
          ? data.message
          : "Ora could not answer from connected tools.",
      );
    }
  }

  function addAssistantResponse(data: ChatResponse) {
    setSessionId(data.sessionId);

    if (data.sessionId) {
      window.localStorage.setItem(chatSessionStorageKey, data.sessionId);
    }

    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        body: data.reply,
        toolName: data.tools[0]?.toolName,
        widgets: data.widgets ?? [],
      },
    ]);
  }

  return (
    <aside
      aria-label="Signal assistant"
      className={`assistant-panel${isOpen ? " assistant-panel-active" : ""}`}
      onFocusCapture={() => setIsOpen(true)}
      onPointerDownCapture={() => setIsOpen(true)}
      ref={panelRef}
    >
      <div className="assistant-handle" />

      <div className="assistant-thread" aria-live="polite" ref={threadRef}>
        {messages.map((message) =>
          message.role === "user" ? (
            <div className="assistant-message-user" key={message.id}>
              <div className="assistant-name">You</div>
              <p>{message.body}</p>
            </div>
          ) : (
            <div
              className="assistant-message assistant-message-system"
              key={message.id}
            >
              <MessageSquareText size={18} aria-hidden="true" />
              <div>
                <div className="assistant-name">
                  Signal assistant
                  {message.toolName ? (
                    <span className="assistant-tool">{message.toolName}</span>
                  ) : null}
                </div>
                <p>{message.body}</p>
                <WidgetList
                  onPrompt={handleSuggestion}
                  widgets={message.widgets ?? []}
                />
              </div>
            </div>
          ),
        )}

        <div className="assistant-card">
          <Sparkles size={18} aria-hidden="true" />
          <div>
            <div className="assistant-name">{suggestionTitle}</div>
            <div className="assistant-suggestions">
              {suggestions.map((suggestion) => (
                <button
                  disabled={pending}
                  key={`${suggestion.label}:${suggestion.prompt}`}
                  onClick={(event) =>
                    handleSuggestion(suggestion.prompt, event)
                  }
                  type="button"
                >
                  {suggestion.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {pending ? (
          <div className="assistant-message assistant-message-system assistant-loading">
            <LoaderCircle
              className="assistant-loader-icon"
              size={18}
              aria-hidden="true"
            />
            <div>
              <div className="assistant-name">Signal assistant</div>
              <p>{pendingLabel}</p>
            </div>
          </div>
        ) : null}
      </div>

      <form
        action="/api/chat"
        className="assistant-input"
        onSubmit={submitMessage}
        ref={formRef}
      >
        <input
          aria-label="Ask about connected data"
          disabled={pending}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            pending ? "Reading connected data..." : "Ask about your store ecosystem"
          }
          value={input}
        />
        <button
          data-pending={pending ? "true" : undefined}
          disabled={!pending && !input.trim()}
          onClick={pending ? cancelPendingRun : undefined}
          type={pending ? "button" : "submit"}
          aria-label={pending ? "Stop response" : "Send message"}
        >
          {pending ? (
            <X size={17} aria-hidden="true" />
          ) : (
            <Search size={17} aria-hidden="true" />
          )}
        </button>
      </form>
    </aside>
  );
}

function buildSuggestionTitle(messages: AssistantMessage[]) {
  const context = getSuggestionContext(messages);

  if (context.productName) return "Suggested reads for this product";
  if (context.mode === "marketing") return "Suggested marketing reads";
  if (context.mode === "customers") return "Suggested customer reads";
  if (context.mode === "sales") return "Suggested sales reads";
  if (context.mode === "inventory") return "Suggested inventory reads";

  return "Suggested connected reads";
}

function buildContextualSuggestions(
  messages: AssistantMessage[],
): AssistantSuggestion[] {
  const context = getSuggestionContext(messages);
  const productName = context.productName;

  if (productName) {
    return uniqueSuggestions([
      {
        label: "Product detail",
        prompt: `Give me the full product detail for "${productName}"`,
      },
      {
        label: "Sales evidence",
        prompt: `Show sales, orders, and revenue for "${productName}" over the last 90 days`,
      },
      {
        label: "Inventory",
        prompt: `Show inventory and variant stock for "${productName}"`,
      },
      {
        label: "Selling basics",
        prompt: `What catalog, product-page, or metafield risks do you see for "${productName}"?`,
      },
      {
        label: "Campaign fit",
        prompt: `Are there recent campaigns, flows, or audiences that mention or relate to "${productName}"?`,
      },
    ]);
  }

  if (context.mode === "marketing") {
    return uniqueSuggestions([
      {
        label: "Campaign performance",
        prompt: "Show recent campaign performance and the most important metric to watch",
      },
      {
        label: "Revenue metric",
        prompt: "Find the Klaviyo revenue metric and summarize the last 30 days",
      },
      {
        label: "Live flows",
        prompt: "Show live flows and what each one is responsible for",
      },
      {
        label: "Audience segments",
        prompt: "Show active customer segments and what they are for",
      },
      {
        label: "Recent events",
        prompt: "Show recent marketing events that matter for store performance",
      },
    ]);
  }

  if (context.mode === "customers") {
    return uniqueSuggestions([
      {
        label: "Best customers",
        prompt: "Show the highest value customers or profiles available from connected data",
      },
      {
        label: "Segments",
        prompt: "Show customer segments and explain which ones are most actionable",
      },
      {
        label: "Recent activity",
        prompt: "Show recent customer or profile events from connected systems",
      },
      {
        label: "Repeat buyers",
        prompt: "Find repeat-buyer evidence from Shopify and Klaviyo data",
      },
      {
        label: "At-risk customers",
        prompt: "Look for signs of customer segments becoming at-risk",
      },
    ]);
  }

  if (context.mode === "sales") {
    return uniqueSuggestions([
      {
        label: "Top sellers",
        prompt: "Show top-selling products over the last 90 days with revenue and units",
      },
      {
        label: "Sales trend",
        prompt: "Show revenue, order count, and average order value by week for the last 90 days",
      },
      {
        label: "Recent orders",
        prompt: "Show recent paid orders and the products driving them",
      },
      {
        label: "Low stock sellers",
        prompt: "Which products with sales momentum have low or zero inventory?",
      },
      {
        label: "Refund pressure",
        prompt: "Show recent refunds and whether any product stands out",
      },
    ]);
  }

  if (context.mode === "inventory") {
    return uniqueSuggestions([
      {
        label: "Zero stock",
        prompt: "Show active products or variants with zero available inventory",
      },
      {
        label: "Low stock",
        prompt: "Show low-stock variants and the product they belong to",
      },
      {
        label: "Demand risk",
        prompt: "Cross-check top sellers against inventory risk",
      },
      {
        label: "SKU view",
        prompt: "Show variant inventory with SKUs for the most urgent items",
      },
      {
        label: "Catalog impact",
        prompt: "Which unavailable active products are most visible in the catalog?",
      },
    ]);
  }

  return uniqueSuggestions([
    {
      label: "Store snapshot",
      prompt: "Give me a store snapshot from connected systems",
    },
    {
      label: "Top sellers",
      prompt: "Show top-selling products over the last 90 days",
    },
    {
      label: "Inventory risk",
      prompt: "Show active products or variants with inventory risk",
    },
    {
      label: "Recent campaigns",
      prompt: "Show recent campaigns and flows from connected marketing tools",
    },
    {
      label: "Customer metrics",
      prompt: "Show customer, profile, and segment metrics from connected systems",
    },
  ]);
}

function getSuggestionContext(messages: AssistantMessage[]) {
  const recent = messages.filter((message) => message.id !== "intro").slice(-6);
  const lastAssistant = [...recent]
    .reverse()
    .find((message) => message.role === "assistant");
  const text = recent
    .map((message) => `${message.body} ${message.toolName ?? ""}`)
    .join(" ")
    .toLowerCase();
  const lastTool = lastAssistant?.toolName ?? "";
  const productName = extractProductName(lastAssistant?.widgets ?? []);

  if (
    lastTool.includes("campaign") ||
    lastTool.includes("flow") ||
    lastTool.includes("metric") ||
    lastTool.includes("event") ||
    /\b(campaign|flow|klaviyo|email|sms|metric|marketing)\b/.test(text)
  ) {
    return { mode: "marketing", productName };
  }

  if (
    lastTool.includes("customer") ||
    lastTool.includes("profile") ||
    lastTool.includes("segment") ||
    /\b(customer|profile|segment|audience|vip|repeat|lapsed)\b/.test(text)
  ) {
    return { mode: "customers", productName };
  }

  if (
    lastTool.includes("inventory") ||
    /\b(inventory|stock|sku|variant|unavailable|out of stock|low stock)\b/.test(
      text,
    )
  ) {
    return { mode: "inventory", productName };
  }

  if (
    lastTool.includes("sales") ||
    lastTool.includes("orders") ||
    /\b(sales|seller|revenue|order|aov|refund|checkout)\b/.test(text)
  ) {
    return { mode: "sales", productName };
  }

  if (productName) return { mode: "product", productName };

  return { mode: "default", productName: null };
}

function extractProductName(widgets: ChatWidget[]) {
  for (const widget of [...widgets].reverse()) {
    if (widget.type === "product_card") return widget.props.name;

    if (widget.type === "data_table") {
      const row = widget.props.rows[0];
      const value =
        row?.product ??
        row?.title ??
        row?.productTitle ??
        row?.name ??
        row?.Product;

      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }

  return null;
}

function uniqueSuggestions(suggestions: AssistantSuggestion[]) {
  const seen = new Set<string>();
  const unique: AssistantSuggestion[] = [];

  for (const suggestion of suggestions) {
    const key = `${suggestion.label}:${suggestion.prompt}`;
    if (seen.has(key)) continue;

    seen.add(key);
    unique.push(suggestion);
  }

  return unique.slice(0, 5);
}

async function readChatEventStream(
  response: Response,
  onEvent: (event: string, data: unknown) => void,
) {
  if (!response.body) {
    throw new Error("The chat stream did not open.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const parsed = parseSseChunk(chunk);

      if (parsed) {
        onEvent(parsed.event, parsed.data);
      }
    }
  }

  const parsed = parseSseChunk(buffer);

  if (parsed) {
    onEvent(parsed.event, parsed.data);
  }
}

function parseSseChunk(chunk: string) {
  const lines = chunk.split(/\r?\n/);
  let event = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    }

    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (dataLines.length === 0) return null;

  return {
    event,
    data: JSON.parse(dataLines.join("\n")) as unknown,
  };
}

function isChatResponse(value: unknown): value is ChatResponse {
  return (
    isRecord(value) &&
    typeof value.sessionId !== "undefined" &&
    typeof value.reply === "string" &&
    Array.isArray(value.tools) &&
    Array.isArray(value.widgets)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function buildConversationHistory(messages: AssistantMessage[]): ChatHistoryTurn[] {
  return messages
    .filter((message) => message.id !== "intro")
    .slice(-8)
    .map((message) => ({
      role: message.role,
      content: summarizeMessageForHistory(message),
    }))
    .filter((turn) => turn.content.trim().length > 0);
}

function summarizeMessageForHistory(message: AssistantMessage) {
  const parts = [
    message.toolName ? `Tool used: ${message.toolName}` : "",
    message.body,
    summarizeWidgetsForHistory(message.widgets ?? []),
  ].filter(Boolean);

  return parts.join("\n").slice(0, 2000);
}

function summarizeWidgetsForHistory(widgets: ChatWidget[]) {
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
