import { z } from "zod";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { executeChatTool, getAvailableChatTools } from "@/lib/chat/connector-tools";
import { ChatWidgetSchema, type ChatWidget } from "@/lib/chat/widgets";
import type { ConnectorContext, ConnectorTool } from "@/lib/connectors/types";

type ToolResult = {
  toolName: string;
  status: "success" | "error";
  result: unknown;
};

export type ConversationTurn = {
  role: "assistant" | "user";
  content: string;
};

export type ConnectorAgentResponse = {
  reply: string;
  tools: ToolResult[];
  widgets: ChatWidget[];
};

export type ConnectorAgentOptions = {
  signal?: AbortSignal;
  onStatus?: (message: string) => void;
  onToolStart?: (toolName: string) => void;
  onToolFinish?: (toolName: string, status: "success" | "error") => void;
};

export class ConnectorAgentCancelledError extends Error {
  code = "CONNECTOR_AGENT_CANCELLED";

  constructor() {
    super("Chat run was cancelled.");
    this.name = "ConnectorAgentCancelledError";
  }
}

export function isConnectorAgentCancelledError(
  error: unknown,
): error is ConnectorAgentCancelledError {
  if (error instanceof ConnectorAgentCancelledError) return true;
  if (!error || typeof error !== "object" || !("code" in error)) return false;

  return error.code === "CONNECTOR_AGENT_CANCELLED";
}

export function parseConnectorAgentFinal(content: string) {
  return parseAgentFinal(content);
}

type OpenAIMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

type OpenAIChatResponse = {
  choices?: Array<{
    message?: OpenAIMessage;
  }>;
};

const agentOutputSchema = z.object({
  reply: z.string().min(1),
  widgets: z.array(ChatWidgetSchema).default([]),
});
const looseAgentOutputSchema = z.object({
  reply: z.string().min(1).optional(),
  widgets: z.array(z.unknown()).optional(),
});

const mutationPattern =
  /\b(update|edit|set|create|delete|remove|publish|hide|archive|sync|refresh|detect|execute|approve|disconnect|fix|apply)\b/i;
const currentOraContextMarker = "\n\nCurrent Ora context:";

export async function answerWithConnectorAgent(
  message: string,
  ctx: ConnectorContext,
  history: ConversationTurn[] = [],
  options: ConnectorAgentOptions = {},
): Promise<ConnectorAgentResponse> {
  const trimmed = message.trim();
  const userMessage = extractUserAuthoredMessage(trimmed);
  const hasLocalOraRecord = hasLocalOraSignalRecord(trimmed);
  const shouldUseConnectorTools = shouldUseConnectorToolsForMessage(trimmed);
  throwIfCancelled(options.signal);
  options.onStatus?.(
    shouldUseConnectorTools
      ? "Checking connected read tools"
      : "Reading Signal record",
  );
  const availableTools = shouldUseConnectorTools
    ? await getAvailableChatTools(ctx)
    : [];

  if (!trimmed) {
    return {
      reply:
        "Ask about your connected store ecosystem, orders, products, customers, campaigns, flows, or Signals.",
      tools: [],
      widgets: [],
    };
  }

  if (availableTools.length === 0 && !hasLocalOraRecord) {
    return {
      reply:
        "No connected read-only tools are available yet. Connect your commerce or marketing systems first, then Ora can answer from connector data.",
      tools: [],
      widgets: [],
    };
  }

  if (mutationPattern.test(userMessage)) {
    return {
      reply:
        "Chat can only inspect connector data. Store changes must go through ActionPlan, Approval, Execution, and verification.",
      tools: [],
      widgets: [],
    };
  }

  if (!runtimeEnv("OPENAI_API_KEY")) {
    return {
      reply:
        "The connector agent needs OPENAI_API_KEY to choose tools from the connected API catalog.",
      tools: [],
      widgets: [],
    };
  }

  return runOpenAIToolLoop(
    trimmed,
    availableTools,
    ctx,
    sanitizeConversationHistory(history),
    options,
  );
}

export function extractUserAuthoredMessage(message: string) {
  return message.split(currentOraContextMarker)[0]?.trim() ?? message.trim();
}

export function hasLocalOraSignalRecord(message: string) {
  return message.includes("Local Ora Signal record.");
}

export function shouldUseConnectorToolsForMessage(message: string) {
  const userMessage = extractUserAuthoredMessage(message);

  return (
    !hasLocalOraSignalRecord(message) || wantsConnectedDataRead(userMessage)
  );
}

export function wantsConnectedDataRead(message: string) {
  return /\b(connected|live|shopify|klaviyo|source|raw|api)\s+(data|record|records|facts|evidence|read|reads)\b/i.test(
    message,
  ) ||
    /\b(show|pull|fetch|read|inspect|check|validate|verify|compare|cross-check)\b[\s\S]{0,80}\b(data|records?|facts?|evidence|inventory|orders?|sales|customers?|products?|campaigns?|flows?)\b/i.test(
      message,
    ) ||
    /\b(data|records?|facts?|evidence)\b[\s\S]{0,80}\b(behind|from|in)\b[\s\S]{0,80}\b(shopify|klaviyo|connected|source)\b/i.test(
      message,
    );
}

async function runOpenAIToolLoop(
  userMessage: string,
  availableTools: ConnectorTool[],
  ctx: ConnectorContext,
  history: ConversationTurn[],
  options: ConnectorAgentOptions,
) {
  const tools = availableTools.map(toOpenAITool);
  const messages: OpenAIMessage[] = buildInitialMessages(userMessage, history);
  const executedTools: ToolResult[] = [];

  for (let iteration = 0; iteration < 5; iteration++) {
    throwIfCancelled(options.signal);
    options.onStatus?.(
      tools.length === 0
        ? "Reading Signal record"
        : iteration === 0
          ? "Choosing connector tools"
          : "Reading tool results",
    );
    const response = await callOpenAI(messages, tools, options.signal);
    const assistantMessage = response.choices?.[0]?.message;

    if (!assistantMessage) {
      throw new Error("Connector agent returned no message.");
    }

    messages.push(assistantMessage);

    if (assistantMessage.tool_calls?.length) {
      for (const call of assistantMessage.tool_calls) {
        throwIfCancelled(options.signal);
        const input = parseToolArguments(call.function.arguments);
        options.onToolStart?.(call.function.name);
        const result = await executeToolWithRecoverableError(
          call.function.name,
          input,
          ctx,
          options.signal,
        );
        const toolStatus = isRecoverableToolError(result) ? "error" : "success";
        throwIfCancelled(options.signal);
        options.onToolFinish?.(call.function.name, toolStatus);
        executedTools.push({
          toolName: call.function.name,
          status: toolStatus,
          result,
        });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: stringifyToolResult(result),
        });
      }
      continue;
    }

    const parsed = parseAgentFinal(assistantMessage.content ?? "");

    return {
      reply: parsed.reply,
      tools: executedTools,
      widgets: parsed.widgets,
    };
  }

  options.onStatus?.("Preparing answer");
  const final = await synthesizeFromToolResults(
    messages,
    executedTools,
    options.signal,
  );

  return {
    reply: final.reply,
    tools: executedTools,
    widgets: final.widgets,
  };
}

export function buildInitialMessagesForTest(
  userMessage: string,
  history: ConversationTurn[] = [],
) {
  return buildInitialMessages(userMessage, sanitizeConversationHistory(history));
}

function buildInitialMessages(userMessage: string, history: ConversationTurn[]) {
  return [
    {
      role: "system",
      content: [
        "You are Ora's connector agent for ecommerce operators.",
        `Today is ${new Date().toISOString().slice(0, 10)}.`,
        "Answer by choosing from the connected read-only tool catalog. Do not rely on fixed question mappings.",
        "If the message includes a Local Ora Signal record, treat it as authoritative local Ora data for the current Signal. For questions about this Signal's meaning, evidence, recommendation, action plan, approval, execution, status, or outcome, answer directly from that record. Do not ask for the Signal id when the record is present. Use connector tools for a Signal only when the user's own message explicitly asks for connected, live, source, Shopify, Klaviyo, or raw data.",
        "If the message includes Current Ora context, use it silently. Never say the user clicked, selected, opened, or is looking at a page unless the user asks about the UI itself.",
        "For Signal context, answer in operator language: what the Signal likely means, what evidence matters, what data to inspect, and what safe next step is appropriate.",
        "Keep the reply visually scannable. Do not write dense inline numbered paragraphs. Use short paragraphs plus widgets for lists, metrics, products, or next reads.",
        "Use prior conversation turns to resolve references like him, her, it, that product, those products, more data, or continue.",
        "You may call multiple tools if needed. Use broad API tools when a question needs data not covered by a narrow helper.",
        "Never mutate store data from chat. If the user asks to write/change/fix/apply anything, explain that approval is required.",
        "Prefer specific connector tools before generic raw API tools. Use raw API tools only when the specific tools do not cover the question.",
        "For Shopify order-level questions, use shopify_get_orders. For revenue or order trends over time, use shopify_get_sales_by_period.",
        "For Shopify best-seller, top product, product-sales, revenue, order count, units sold, or demand questions, use shopify_get_product_sales.",
        "For Shopify product follow-ups like more data on it/him/that product, use the prior turn to identify the product, then use shopify_get_product_detail or shopify_search_products.",
        "For Shopify inventory, low-stock, out-of-stock, SKU, or variant-stock questions, use shopify_get_inventory_levels.",
        "For Shopify customer and cohort questions, use shopify_get_customer_segments and shopify_get_customers when available.",
        "For Shopify discounts, refunds, abandoned checkouts, or metafields, use the matching structured read tool before falling back to raw GraphQL.",
        "Do not use products(sortKey: BEST_SELLING) in Shopify Admin GraphQL. Admin ProductSortKeys does not support BEST_SELLING; aggregate line items from orders instead.",
        "For Klaviyo questions, inspect accounts, profiles, events, metrics, campaigns, flows, lists, segments, and templates with the connected Klaviyo read-only tools.",
        "For Klaviyo revenue, engagement, campaign, or flow performance questions, first find the relevant metric id with klaviyo_get_metrics, then use klaviyo_query_metric_aggregates. Use measurement=sum_value for revenue-style Placed Order metrics, count for event counts, and unique for people counts.",
        "For Klaviyo endpoint data that is not covered by a narrow helper, use klaviyo_api_get with a relative /api path and params.",
        "If a tool returns a schema or validation error, revise the query and try again using the tool error as feedback.",
        "If a tool result has ok:false, treat it as a failed tool call, not as business data. Retry with corrected input when possible.",
        "If the user did not specify a date range, use a practical recent window and say which window you used.",
        "Do not paginate endlessly. For exploratory answers, one successful page of connector data is enough; state if the result is partial.",
        "After a successful tool result, answer the user directly instead of calling more tools unless the next tool is essential.",
        "Return JSON only with shape {\"reply\":\"...\",\"widgets\":[...]}",
        "Allowed widgets: kpi_card, scorecard_grid, stat_list, data_table, bar_chart, product_card, alert_card, followup_chips.",
        "Use product_card for one product, bar_chart for rankings like top sellers, scorecard_grid for 2-8 headline metrics, data_table for detailed rows, alert_card for the main conclusion, followup_chips for the two most useful next questions.",
        "For any successful connector answer with rows, rankings, totals, products, orders, campaigns, flows, customers, profiles, or metric series, include 2-4 widgets when the tool result supports it.",
        "For context-only Signal answers without connector tools, include an alert_card with the main takeaway and one followup_chips widget with exactly 2 next reads.",
        "Widget shape is strict: every widget must be {\"type\":\"...\",\"props\":{...}}. Never use a top-level data field inside a widget.",
        "Shape examples: kpi_card props {label,value,unit?,hint?}; scorecard_grid props {title?,cards:[{label,value,unit?,hint?}]}; stat_list props {title?,items:[{label,value}]}; data_table props {title?,columns:[{key,label,format?}],rows:[...]}; bar_chart props {title?,data:[...],xKey,yKey,valueFormat}; product_card props {name,subtitle?,price?,stock?,metrics?,hint?}; alert_card props {tone,title,body?}; followup_chips props {title?,prompts:[{label,prompt}]}.",
        "When using followup_chips, include exactly 2 prompts. Do not create more than one followup_chips widget in an answer.",
        "Keep widgets small, factual, and backed by the tool results. Do not fabricate data.",
      ].join(" "),
    },
    ...history.map((turn) => ({
      role: turn.role,
      content: turn.content,
    })),
    { role: "user", content: userMessage },
  ] satisfies OpenAIMessage[];
}

function sanitizeConversationHistory(history: ConversationTurn[]) {
  return history
    .filter(
      (turn) =>
        (turn.role === "assistant" || turn.role === "user") &&
        turn.content.trim().length > 0,
    )
    .slice(-8)
    .map((turn) => ({
      role: turn.role,
      content: removeUiLeakPhrases(turn.content.trim()).slice(0, 2000),
    }));
}

function removeUiLeakPhrases(content: string) {
  return content
    .replace(/\bYou clicked on a Signal detail page\b/gi, "This Signal detail")
    .replace(/\bYou clicked on\b/gi, "The current context is")
    .replace(/\bwhat the user clicked\b/gi, "the current context")
    .replace(/\bUI context\b/gi, "current context");
}

async function executeToolWithRecoverableError(
  toolName: string,
  input: unknown,
  ctx: ConnectorContext,
  signal?: AbortSignal,
) {
  try {
    throwIfCancelled(signal);
    return await executeChatTool(toolName, input, ctx);
  } catch (error) {
    if (isConnectorAgentCancelledError(error)) {
      throw error;
    }

    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "The connector tool failed with an unknown error.",
      instruction:
        "Revise the tool input and try another read-only query. Do not apologize unless no valid read path remains.",
    };
  }
}

function isRecoverableToolError(result: unknown) {
  return (
    result !== null &&
    typeof result === "object" &&
    "ok" in result &&
    (result as { ok?: unknown }).ok === false
  );
}

async function callOpenAI(
  messages: OpenAIMessage[],
  tools: Array<Record<string, unknown>>,
  signal?: AbortSignal,
) {
  throwIfCancelled(signal);
  const toolFields =
    tools.length > 0
      ? {
          tools,
          tool_choice: "auto",
        }
      : {};
  const response = await fetchOpenAI(
    {
      model: runtimeEnv("ORA_CHAT_MODEL") ?? "gpt-4.1-mini",
      messages,
      ...toolFields,
      temperature: 0.1,
      response_format: { type: "json_object" },
    },
    signal,
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Connector agent failed with ${response.status}: ${text}`);
  }

  return JSON.parse(text) as OpenAIChatResponse;
}

async function synthesizeFromToolResults(
  messages: OpenAIMessage[],
  executedTools: ToolResult[],
  signal?: AbortSignal,
) {
  if (!executedTools.length) {
    return {
      reply:
        "I could not find a connected read-only tool path for that question yet.",
      widgets: [],
    };
  }

  const response = await callOpenAIWithoutTools(
    [
      ...messages,
      {
        role: "system",
        content: [
          "Stop calling tools now.",
          "Use the tool results already present in the conversation to answer the user's question.",
          "If the data is partial, say that plainly and still give the best answer supported by the results.",
          "Return JSON only with shape {\"reply\":\"...\",\"widgets\":[...]}",
          "Widget shape is strict: use {type, props}; never {type, data}.",
        ].join(" "),
      },
    ],
    signal,
  );
  const assistantMessage = response.choices?.[0]?.message;

  if (!assistantMessage?.content) {
    return {
      reply: "I found connector data, but could not format the final answer.",
      widgets: [],
    };
  }

  return parseAgentFinal(assistantMessage.content);
}

async function callOpenAIWithoutTools(
  messages: OpenAIMessage[],
  signal?: AbortSignal,
) {
  const response = await fetchOpenAI(
    {
      model: runtimeEnv("ORA_CHAT_MODEL") ?? "gpt-4.1-mini",
      messages,
      temperature: 0.1,
      response_format: { type: "json_object" },
    },
    signal,
  );

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Connector agent failed with ${response.status}: ${text}`);
  }

  return JSON.parse(text) as OpenAIChatResponse;
}

async function fetchOpenAI(body: Record<string, unknown>, signal?: AbortSignal) {
  try {
    return await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtimeEnv("OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) {
      throw new ConnectorAgentCancelledError();
    }

    throw error;
  }
}

function throwIfCancelled(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new ConnectorAgentCancelledError();
  }
}

function isAbortError(error: unknown) {
  return (
    error instanceof DOMException && error.name === "AbortError"
  );
}

function runtimeEnv(key: string) {
  if (process.env[key]) return process.env[key];

  const path = join(process.cwd(), ".env");
  if (!existsSync(path)) return undefined;

  const line = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .find((candidate) => candidate.trim().startsWith(`${key}=`));

  if (!line) return undefined;

  return line
    .slice(line.indexOf("=") + 1)
    .trim()
    .replace(/^['"]|['"]$/g, "");
}

function toOpenAITool(tool: ConnectorTool) {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: z.toJSONSchema(tool.inputSchema),
    },
  };
}

function parseToolArguments(raw: string) {
  if (!raw.trim()) return {};

  return JSON.parse(raw) as unknown;
}

function stringifyToolResult(result: unknown) {
  const json = JSON.stringify(result);

  if (json.length <= 30_000) return json;

  return JSON.stringify({
    truncated: true,
    note: "Tool result was too large for chat context. Ask a narrower question or smaller date range.",
    preview: json.slice(0, 30_000),
  });
}

function parseAgentFinal(content: string) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    return {
      reply: content,
      widgets: [],
    };
  }

  const normalized = normalizeAgentOutput(parsed);
  const result = agentOutputSchema.safeParse(normalized);

  if (result.success) {
    return result.data;
  }

  const loose = looseAgentOutputSchema.safeParse(parsed);

  if (loose.success && loose.data.reply) {
    return {
      reply: loose.data.reply,
      widgets: [],
    };
  }

  return {
    reply:
      "I answered from connected data, but the visual widget format was invalid.",
    widgets: [],
  };
}

function normalizeAgentOutput(parsed: unknown) {
  if (!parsed || typeof parsed !== "object") return parsed;

  const record = parsed as Record<string, unknown>;
  const widgets = Array.isArray(record.widgets)
    ? record.widgets.map(normalizeWidget).filter(Boolean)
    : [];

  return {
    ...record,
    widgets,
  };
}

function normalizeWidget(widget: unknown) {
  if (!widget || typeof widget !== "object") return null;

  const record = widget as Record<string, unknown>;
  const type = record.type;
  const props = record.props ?? normalizeLegacyWidgetProps(type, record);

  return {
    type,
    props,
  };
}

function normalizeLegacyWidgetProps(type: unknown, record: Record<string, unknown>) {
  if (type === "stat_list") {
    const rawItems = Array.isArray(record.data)
      ? record.data
      : Array.isArray(record.items)
        ? record.items
        : [];
    const items = rawItems
      .filter((item): item is Record<string, unknown> =>
        Boolean(item && typeof item === "object"),
      )
      .map((item) => ({
        label: String(item.label ?? ""),
        value:
          typeof item.value === "number" || typeof item.value === "string"
            ? item.value
            : String(item.value ?? ""),
      }))
      .filter((item) => item.label && item.value !== "");

    return {
      title: typeof record.title === "string" ? record.title : undefined,
      items,
    };
  }

  if (type === "data_table") {
    return {
      title: typeof record.title === "string" ? record.title : undefined,
      columns: Array.isArray(record.columns) ? record.columns : [],
      rows: Array.isArray(record.rows)
        ? record.rows
        : Array.isArray(record.data)
          ? record.data
          : [],
    };
  }

  return record.props;
}
