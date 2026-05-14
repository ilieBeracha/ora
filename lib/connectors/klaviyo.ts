import { z } from "zod";

import {
  getConnectorConfig,
  markConnectorStatus,
} from "@/lib/connectors/store";
import type {
  ConnectorAdapter,
  ConnectorContext,
  ConnectorTestResult,
} from "@/lib/connectors/types";

export type KlaviyoConfig = {
  apiKey: string;
  apiRevision?: string;
  accountId?: string;
  accountName?: string | null;
  currency?: string | null;
  timezone?: string | null;
};

export const KLAVIYO_DEFAULT_REVISION = "2026-04-15";

const API_BASE = "https://a.klaviyo.com/api";
const PROVIDER = "klaviyo";

const jsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean()]);
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

const emptyInputSchema = z.object({}).optional();
const genericGetInputSchema = z.object({
  path: z
    .string()
    .min(1)
    .max(160)
    .describe(
      "Relative Klaviyo /api path, e.g. profiles, events, metrics, campaigns, flows, lists, segments, templates, or accounts.",
    ),
  params: z.record(z.string(), jsonPrimitiveSchema).optional(),
});
const listInputSchema = z.object({
  limit: z.number().int().min(1).max(100).default(10),
});
const campaignsInputSchema = z.object({
  channel: z.enum(["email", "sms", "mobile_push"]).default("email"),
  status: z
    .enum(["Draft", "Queued", "Sending", "Sent", "Cancelled", "ALL"])
    .default("Sent"),
  limit: z.number().int().min(1).max(25).default(10),
});
const flowsInputSchema = z.object({
  status: z.enum(["live", "manual", "draft", "ALL"]).default("live"),
  limit: z.number().int().min(1).max(25).default(10),
});
const templatesInputSchema = z.object({
  templateId: z.string().min(1).optional(),
  search: z.string().min(1).max(120).optional(),
  includeContent: z.boolean().default(false),
  limit: z.number().int().min(1).max(25).default(10),
});
const metricsInputSchema = z.object({
  integrationName: z.string().min(1).max(80).optional(),
  integrationCategory: z.string().min(1).max(80).optional(),
  limit: z.number().int().min(1).max(200).default(50),
});
const profilesInputSchema = z.object({
  limit: z.number().int().min(1).max(100).default(10),
  filter: z.string().min(1).max(500).optional(),
  sort: z
    .enum([
      "created",
      "-created",
      "updated",
      "-updated",
      "email",
      "-email",
      "id",
      "-id",
    ])
    .default("-updated"),
});
const eventsInputSchema = z.object({
  limit: z.number().int().min(1).max(100).default(10),
  filter: z.string().min(1).max(500).optional(),
  sort: z.enum(["datetime", "-datetime", "timestamp", "-timestamp"]).default(
    "-datetime",
  ),
});
const metricAggregateInputSchema = z.object({
  metricId: z.string().min(1),
  from: dateSchema,
  to: dateSchema,
  measurement: z.enum(["count", "sum_value", "unique"]).default("count"),
  interval: z.enum(["hour", "day", "week", "month"]).default("day"),
  timezone: z.string().min(1).max(80).default("UTC"),
  by: z.array(z.string().min(1).max(80)).max(3).optional(),
  filter: z
    .string()
    .min(1)
    .max(500)
    .optional()
    .describe("Optional one extra Klaviyo filter, e.g. equals($flow,\"abc\")."),
});

type JsonApiList<TAttrs> = {
  data: Array<JsonApiResourceData<TAttrs>>;
  included?: Array<JsonApiResourceData<Record<string, unknown>>>;
  links?: { next?: string | null };
};

type JsonApiResource<TAttrs> = {
  data: JsonApiResourceData<TAttrs>;
  included?: Array<JsonApiResourceData<Record<string, unknown>>>;
};

type JsonApiResourceData<TAttrs> = {
  id: string;
  type: string;
  attributes: TAttrs;
  relationships?: Record<
    string,
    { data?: { id: string; type: string } | Array<{ id: string; type: string }> }
  >;
};

type AccountAttrs = {
  contact_information?: {
    organization_name?: string;
    default_sender_name?: string;
    default_sender_email?: string;
  };
  preferred_currency?: string;
  timezone?: string;
};

type ListAttrs = {
  name?: string;
  created?: string;
  updated?: string;
};

type SegmentAttrs = ListAttrs & {
  is_active?: boolean;
};

type CampaignAttrs = {
  name?: string;
  status?: string;
  archived?: boolean;
  created_at?: string;
  scheduled_at?: string | null;
  send_time?: string | null;
  updated_at?: string;
  channel?: string;
};

type FlowAttrs = {
  name?: string;
  status?: string;
  trigger_type?: string;
  created?: string;
  updated?: string;
};

type TemplateAttrs = {
  name?: string;
  editor_type?: string;
  html?: string | null;
  text?: string | null;
  amp?: string | null;
  created?: string;
  updated?: string;
};

type MetricAttrs = {
  name?: string;
  created?: string;
  updated?: string;
  integration?: { id?: string; name?: string; category?: string };
};

type ProfileAttrs = {
  email?: string | null;
  phone_number?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  created?: string;
  updated?: string;
  last_event_date?: string | null;
  location?: {
    city?: string | null;
    region?: string | null;
    country?: string | null;
  } | null;
  properties?: Record<string, unknown>;
};

type EventAttrs = {
  datetime?: string;
  timestamp?: number;
  event_properties?: Record<string, unknown>;
  value?: number | null;
  value_currency?: string | null;
};

type AggregateResponse = {
  data: {
    type: string;
    attributes: {
      dates: string[];
      data: Array<{
        dimensions: string[];
        measurements: Record<string, number[]>;
      }>;
    };
  };
};

type JsonApiError = {
  errors?: Array<{
    status?: string;
    code?: string;
    title?: string;
    detail?: string;
  }>;
};

export class KlaviyoError extends Error {
  constructor(
    public code:
      | "not_configured"
      | "invalid_key"
      | "permission_denied"
      | "rate_limited"
      | "api_error"
      | "http_error",
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "KlaviyoError";
  }
}

export const klaviyoConnector: ConnectorAdapter = {
  provider: PROVIDER,
  label: "Klaviyo",
  tools: [
    {
      name: "klaviyo_get_account",
      description:
        "Read the connected Klaviyo account profile, currency, timezone, and sender hints.",
      inputSchema: emptyInputSchema,
      readOnly: true,
      async execute(_input, ctx) {
        return getAccount(ctx);
      },
    },
    {
      name: "klaviyo_api_get",
      description:
        "Run a generic read-only GET request against the connected Klaviyo /api endpoint. Use this when the narrower Klaviyo tools do not cover the user's question. Allowed resource families include accounts, profiles, events, metrics, campaigns, flows, lists, segments, templates, forms, catalog, coupons, images, and tags. No writes.",
      inputSchema: genericGetInputSchema,
      readOnly: true,
      async execute(input, ctx) {
        const parsed = genericGetInputSchema.parse(input ?? {});
        return klaviyoFetch(ctx.companyId, parsed.path, parsed.params ?? {});
      },
    },
    {
      name: "klaviyo_get_lists",
      description:
        "List Klaviyo subscriber lists/static audiences. Returns ids, names, and timestamps.",
      inputSchema: listInputSchema,
      readOnly: true,
      async execute(input, ctx) {
        return getLists(input, ctx);
      },
    },
    {
      name: "klaviyo_get_segments",
      description:
        "List Klaviyo dynamic segments/rule-based audiences. Use for customer segment and audience questions.",
      inputSchema: listInputSchema,
      readOnly: true,
      async execute(input, ctx) {
        return getSegments(input, ctx);
      },
    },
    {
      name: "klaviyo_get_campaigns",
      description:
        "List Klaviyo campaigns by channel and status. Use for recent email/SMS campaign questions and lifecycle marketing review.",
      inputSchema: campaignsInputSchema,
      readOnly: true,
      async execute(input, ctx) {
        return getCampaigns(input, ctx);
      },
    },
    {
      name: "klaviyo_get_flows",
      description:
        "List Klaviyo automated flows such as welcome series, abandoned cart, post-purchase, and winback flows.",
      inputSchema: flowsInputSchema,
      readOnly: true,
      async execute(input, ctx) {
        return getFlows(input, ctx);
      },
    },
    {
      name: "klaviyo_get_templates",
      description:
        "List or fetch Klaviyo email templates. Include content only when the user needs body/html details.",
      inputSchema: templatesInputSchema,
      readOnly: true,
      async execute(input, ctx) {
        return getTemplates(input, ctx);
      },
    },
    {
      name: "klaviyo_get_metrics",
      description:
        "List Klaviyo metrics such as Placed Order, Opened Email, Clicked Email, and Active on Site. Use the returned id with klaviyo_query_metric_aggregates for revenue, count, and unique-person questions.",
      inputSchema: metricsInputSchema,
      readOnly: true,
      async execute(input, ctx) {
        return getMetrics(input, ctx);
      },
    },
    {
      name: "klaviyo_get_profiles",
      description:
        "Read Klaviyo profiles/customers with optional filter and sort. Useful for customer, subscriber, suppression, and profile-property questions.",
      inputSchema: profilesInputSchema,
      readOnly: true,
      async execute(input, ctx) {
        return getProfiles(input, ctx);
      },
    },
    {
      name: "klaviyo_get_events",
      description:
        "Read Klaviyo events with optional filter and sort. Useful for recent profile activity, placed orders, email engagement, and event-property exploration.",
      inputSchema: eventsInputSchema,
      readOnly: true,
      async execute(input, ctx) {
        return getEvents(input, ctx);
      },
    },
    {
      name: "klaviyo_query_metric_aggregates",
      description:
        "Aggregate a Klaviyo metric over a date range. Use measurement=sum_value for revenue-style metrics such as Placed Order, count for event counts, and unique for people counts. Use by=[\"$attributed_message\"] for campaign/flow-attributed revenue when appropriate.",
      inputSchema: metricAggregateInputSchema,
      readOnly: true,
      async execute(input, ctx) {
        return getMetricAggregate(input, ctx);
      },
    },
  ],
  async testConnection(ctx) {
    const checkedAt = new Date();

    try {
      const account = await getAccount(ctx);

      if (!account) {
        return {
          ok: false,
          checkedAt,
          message: "Klaviyo did not return an account for this private key.",
        };
      }

      return {
        ok: true,
        checkedAt,
        message: "Klaviyo connected.",
        metadata: account,
      };
    } catch (error) {
      return {
        ok: false,
        checkedAt,
        message:
          error instanceof Error ? error.message : "Klaviyo connection failed.",
      };
    }
  },
};

export async function testKlaviyoConfig(
  config: KlaviyoConfig,
): Promise<ConnectorTestResult> {
  const checkedAt = new Date();

  try {
    const data = await requestWithConfig<JsonApiList<AccountAttrs>>(
      normalizeKlaviyoConfig(config),
      "GET",
      "accounts",
    );
    const account = summarizeAccount(data);

    if (!account) {
      return {
        ok: false,
        checkedAt,
        message: "Klaviyo did not return an account for this private key.",
      };
    }

    return {
      ok: true,
      checkedAt,
      message: "Klaviyo connected.",
      metadata: account,
    };
  } catch (error) {
    return {
      ok: false,
      checkedAt,
      message:
        error instanceof Error ? error.message : "Klaviyo connection failed.",
    };
  }
}

export async function klaviyoFetch<T = unknown>(
  companyId: string,
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
) {
  return klaviyoRequest<T>(companyId, "GET", path, { params });
}

async function klaviyoPost<T = unknown>(
  companyId: string,
  path: string,
  body: unknown,
  params: Record<string, string | number | boolean | undefined> = {},
) {
  return klaviyoRequest<T>(companyId, "POST", path, { body, params });
}

async function klaviyoRequest<T>(
  companyId: string,
  method: "GET" | "POST",
  path: string,
  options: {
    params?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
  } = {},
) {
  const config = await loadKlaviyoConfig(companyId);

  try {
    const result = await requestWithConfig<T>(config, method, path, options);
    await markConnectorStatus(companyId, PROVIDER, "connected", null);
    return result;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Klaviyo request failed.";

    if (
      error instanceof KlaviyoError &&
      (error.code === "invalid_key" || error.code === "permission_denied")
    ) {
      await markConnectorStatus(companyId, PROVIDER, "error", message);
    }

    throw error;
  }
}

async function requestWithConfig<T>(
  config: KlaviyoConfig,
  method: "GET" | "POST",
  path: string,
  options: {
    params?: Record<string, string | number | boolean | undefined>;
    body?: unknown;
  } = {},
) {
  const normalizedPath = normalizeKlaviyoApiPath(path);
  const url = new URL(`${API_BASE}/${normalizedPath}`);

  for (const [key, value] of Object.entries(options.params ?? {})) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = {
    Accept: "application/vnd.api+json",
    Authorization: `Klaviyo-API-Key ${config.apiKey}`,
    revision: config.apiRevision ?? KLAVIYO_DEFAULT_REVISION,
  };

  if (method === "POST") {
    headers["Content-Type"] = "application/vnd.api+json";
  }

  const response = await fetch(url, {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(options.body ?? {}) : undefined,
  });
  const text = await response.text();

  if (!response.ok) {
    throw parseKlaviyoError(response.status, text);
  }

  if (!text.trim()) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new KlaviyoError(
      "api_error",
      `Klaviyo returned malformed JSON: ${text.slice(0, 200)}`,
    );
  }
}

async function loadKlaviyoConfig(companyId: string) {
  const config = await getConnectorConfig<KlaviyoConfig>(companyId, PROVIDER);

  if (!config?.apiKey) {
    throw new KlaviyoError("not_configured", "Klaviyo is not connected.");
  }

  return normalizeKlaviyoConfig(config);
}

function normalizeKlaviyoConfig(config: KlaviyoConfig): KlaviyoConfig {
  return {
    ...config,
    apiKey: config.apiKey.trim(),
    apiRevision: normalizeKlaviyoRevision(config.apiRevision),
  };
}

export function normalizeKlaviyoRevision(revision?: string | null) {
  const trimmed = revision?.trim();

  return trimmed && /^\d{4}-\d{2}-\d{2}(?:\.[A-Za-z0-9_-]+)?$/.test(trimmed)
    ? trimmed
    : KLAVIYO_DEFAULT_REVISION;
}

export function normalizeKlaviyoApiPath(path: string) {
  const trimmed = path.trim();

  if (!trimmed) {
    throw new KlaviyoError("api_error", "Klaviyo API path is required.");
  }

  if (/^https?:\/\//i.test(trimmed) || trimmed.includes("?")) {
    throw new KlaviyoError(
      "api_error",
      "Use a relative Klaviyo /api path and pass query values in params.",
    );
  }

  const pathWithoutApiPrefix = trimmed
    .replace(/^\/+/, "")
    .replace(/^api\/+/i, "")
    .replace(/\/+$/, "");
  const resource = pathWithoutApiPrefix.split("/")[0]?.toLowerCase() ?? "";
  const allowedResources = new Set([
    "accounts",
    "campaigns",
    "catalog-categories",
    "catalog-items",
    "catalog-variants",
    "coupons",
    "events",
    "flows",
    "forms",
    "images",
    "lists",
    "metrics",
    "profiles",
    "segments",
    "tags",
    "templates",
    "web-feeds",
  ]);

  if (!allowedResources.has(resource)) {
    throw new KlaviyoError(
      "api_error",
      `Klaviyo GET path "${resource}" is not in the read-only allowlist.`,
    );
  }

  if (
    pathWithoutApiPrefix
      .split("/")
      .some((part) => part === "." || part === "..")
  ) {
    throw new KlaviyoError("api_error", "Klaviyo API path is invalid.");
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9._~/-]*$/.test(pathWithoutApiPrefix)) {
    throw new KlaviyoError("api_error", "Klaviyo API path is invalid.");
  }

  return pathWithoutApiPrefix;
}

function parseKlaviyoError(status: number, text: string) {
  let parsed: JsonApiError = {};

  try {
    parsed = JSON.parse(text) as JsonApiError;
  } catch {
    parsed = {};
  }

  const first = parsed.errors?.[0];
  const message = first?.detail ?? first?.title ?? text.slice(0, 240);
  let code: KlaviyoError["code"] = "http_error";

  const authErrorText = [first?.code, first?.title, first?.detail, text]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    status === 401 ||
    (status === 400 && /api key|auth|credential|private key/.test(authErrorText))
  ) {
    code = "invalid_key";
  } else if (status === 403) code = "permission_denied";
  else if (status === 429) code = "rate_limited";
  else if (parsed.errors?.length) code = "api_error";

  return new KlaviyoError(
    code,
    `Klaviyo ${code}: ${message || `HTTP ${status}`}`,
    status,
  );
}

async function getAccount(ctx: ConnectorContext) {
  const data = await klaviyoFetch<JsonApiList<AccountAttrs>>(
    ctx.companyId,
    "accounts",
  );

  return summarizeAccount(data);
}

function summarizeAccount(data: JsonApiList<AccountAttrs>) {
  const account = data.data[0];
  if (!account) return null;
  const contact = account.attributes.contact_information;

  return {
    accountId: account.id,
    accountName:
      contact?.organization_name ??
      contact?.default_sender_name ??
      "Klaviyo account",
    defaultSenderName: contact?.default_sender_name ?? null,
    defaultSenderEmail: contact?.default_sender_email ?? null,
    currency: account.attributes.preferred_currency ?? null,
    timezone: account.attributes.timezone ?? null,
  };
}

async function getLists(input: unknown, ctx: ConnectorContext) {
  const args = listInputSchema.parse(input ?? {});
  const data = await klaviyoFetch<JsonApiList<ListAttrs>>(ctx.companyId, "lists", {
    "page[size]": args.limit,
  });

  return {
    count: data.data.length,
    lists: data.data.map((list) => ({
      id: list.id,
      name: list.attributes.name ?? "Untitled list",
      created: list.attributes.created ?? null,
      updated: list.attributes.updated ?? null,
    })),
    next: data.links?.next ?? null,
  };
}

async function getSegments(input: unknown, ctx: ConnectorContext) {
  const args = listInputSchema.parse(input ?? {});
  const data = await klaviyoFetch<JsonApiList<SegmentAttrs>>(
    ctx.companyId,
    "segments",
    {
      "page[size]": args.limit,
    },
  );

  return {
    count: data.data.length,
    segments: data.data.map((segment) => ({
      id: segment.id,
      name: segment.attributes.name ?? "Untitled segment",
      isActive: segment.attributes.is_active ?? null,
      created: segment.attributes.created ?? null,
      updated: segment.attributes.updated ?? null,
    })),
    next: data.links?.next ?? null,
  };
}

async function getCampaigns(input: unknown, ctx: ConnectorContext) {
  const args = campaignsInputSchema.parse(input ?? {});
  const filters = [`equals(messages.channel,"${args.channel}")`];
  if (args.status !== "ALL") filters.push(`equals(status,"${args.status}")`);
  const data = await klaviyoFetch<JsonApiList<CampaignAttrs>>(
    ctx.companyId,
    "campaigns",
    {
      filter: filters.length > 1 ? `and(${filters.join(",")})` : filters[0],
      sort: "-scheduled_at",
    },
  );
  const rows = data.data.slice(0, args.limit);

  return {
    count: rows.length,
    campaigns: rows.map((campaign) => ({
      id: campaign.id,
      name: campaign.attributes.name ?? "Untitled campaign",
      status: campaign.attributes.status ?? null,
      channel: campaign.attributes.channel ?? args.channel,
      archived: campaign.attributes.archived ?? null,
      sendTime: campaign.attributes.send_time ?? null,
      scheduledAt: campaign.attributes.scheduled_at ?? null,
      createdAt: campaign.attributes.created_at ?? null,
      updatedAt: campaign.attributes.updated_at ?? null,
    })),
    next: data.links?.next ?? null,
  };
}

async function getFlows(input: unknown, ctx: ConnectorContext) {
  const args = flowsInputSchema.parse(input ?? {});
  const params: Record<string, string | number> = {
    "page[size]": args.limit,
    sort: "-updated",
  };
  if (args.status !== "ALL") {
    params.filter = `equals(status,"${args.status}")`;
  }
  const data = await klaviyoFetch<JsonApiList<FlowAttrs>>(
    ctx.companyId,
    "flows",
    params,
  );

  return {
    count: data.data.length,
    flows: data.data.map((flow) => ({
      id: flow.id,
      name: flow.attributes.name ?? "Untitled flow",
      status: flow.attributes.status ?? null,
      triggerType: flow.attributes.trigger_type ?? null,
      created: flow.attributes.created ?? null,
      updated: flow.attributes.updated ?? null,
    })),
    next: data.links?.next ?? null,
  };
}

async function getTemplates(input: unknown, ctx: ConnectorContext) {
  const args = templatesInputSchema.parse(input ?? {});

  if (args.templateId) {
    const data = await klaviyoFetch<JsonApiResource<TemplateAttrs>>(
      ctx.companyId,
      `templates/${encodeURIComponent(args.templateId)}`,
      args.includeContent
        ? {}
        : { "fields[template]": "name,editor_type,created,updated" },
    );

    return {
      count: 1,
      template: summarizeTemplate(data.data, args.includeContent),
    };
  }

  const params: Record<string, string | number> = {
    "page[size]": args.limit,
    sort: "-updated",
  };
  if (!args.includeContent) {
    params["fields[template]"] = "name,editor_type,created,updated";
  }
  if (args.search) {
    params.filter = `contains(name,"${escapeKlaviyoFilterString(
      args.search,
    )}")`;
  }
  const data = await klaviyoFetch<JsonApiList<TemplateAttrs>>(
    ctx.companyId,
    "templates",
    params,
  );

  return {
    count: data.data.length,
    templates: data.data.map((template) =>
      summarizeTemplate(template, args.includeContent),
    ),
    next: data.links?.next ?? null,
  };
}

async function getMetrics(input: unknown, ctx: ConnectorContext) {
  const args = metricsInputSchema.parse(input ?? {});
  const filters = [
    args.integrationName
      ? `equals(integration.name,"${escapeKlaviyoFilterString(
          args.integrationName,
        )}")`
      : null,
    args.integrationCategory
      ? `equals(integration.category,"${escapeKlaviyoFilterString(
          args.integrationCategory,
        )}")`
      : null,
  ].filter(Boolean);
  const data = await klaviyoFetch<JsonApiList<MetricAttrs>>(
    ctx.companyId,
    "metrics",
    filters.length
      ? {
          filter:
            filters.length > 1
              ? `and(${filters.join(",")})`
              : String(filters[0]),
        }
      : {},
  );
  const rows = data.data.slice(0, args.limit);

  return {
    count: rows.length,
    metrics: rows.map((metric) => ({
      id: metric.id,
      name: metric.attributes.name ?? "Untitled metric",
      integration: metric.attributes.integration?.name ?? null,
      category: metric.attributes.integration?.category ?? null,
      created: metric.attributes.created ?? null,
      updated: metric.attributes.updated ?? null,
    })),
    next: data.links?.next ?? null,
  };
}

async function getProfiles(input: unknown, ctx: ConnectorContext) {
  const args = profilesInputSchema.parse(input ?? {});
  const params: Record<string, string | number> = {
    "page[size]": args.limit,
    sort: args.sort,
  };
  if (args.filter) params.filter = args.filter;
  const data = await klaviyoFetch<JsonApiList<ProfileAttrs>>(
    ctx.companyId,
    "profiles",
    params,
  );

  return {
    count: data.data.length,
    profiles: data.data.map((profile) => {
      const attrs = profile.attributes;
      return {
        id: profile.id,
        email: attrs.email ?? null,
        phoneNumber: attrs.phone_number ?? null,
        name: [attrs.first_name, attrs.last_name].filter(Boolean).join(" "),
        created: attrs.created ?? null,
        updated: attrs.updated ?? null,
        lastEventDate: attrs.last_event_date ?? null,
        location: attrs.location
          ? {
              city: attrs.location.city ?? null,
              region: attrs.location.region ?? null,
              country: attrs.location.country ?? null,
            }
          : null,
        properties: attrs.properties ?? {},
      };
    }),
    next: data.links?.next ?? null,
  };
}

async function getEvents(input: unknown, ctx: ConnectorContext) {
  const args = eventsInputSchema.parse(input ?? {});
  const params: Record<string, string | number> = {
    "page[size]": args.limit,
    sort: args.sort,
    include: "metric,profile",
    "fields[metric]": "name",
    "fields[profile]": "email,first_name,last_name",
  };
  if (args.filter) params.filter = args.filter;
  const data = await klaviyoFetch<JsonApiList<EventAttrs>>(
    ctx.companyId,
    "events",
    params,
  );
  const included = new Map(
    (data.included ?? []).map((item) => [`${item.type}:${item.id}`, item]),
  );

  return {
    count: data.data.length,
    events: data.data.map((event) => {
      const metricRef = getRelationshipRef(event, "metric");
      const profileRef = getRelationshipRef(event, "profile");
      const metric = metricRef
        ? included.get(`${metricRef.type}:${metricRef.id}`)
        : null;
      const profile = profileRef
        ? included.get(`${profileRef.type}:${profileRef.id}`)
        : null;
      const profileAttrs = profile?.attributes as ProfileAttrs | undefined;
      const metricAttrs = metric?.attributes as MetricAttrs | undefined;

      return {
        id: event.id,
        datetime: event.attributes.datetime ?? null,
        timestamp: event.attributes.timestamp ?? null,
        metricId: metricRef?.id ?? null,
        metricName: metricAttrs?.name ?? null,
        profileId: profileRef?.id ?? null,
        profileEmail: profileAttrs?.email ?? null,
        profileName: [profileAttrs?.first_name, profileAttrs?.last_name]
          .filter(Boolean)
          .join(" "),
        value: event.attributes.value ?? null,
        currency: event.attributes.value_currency ?? null,
        properties: event.attributes.event_properties ?? {},
      };
    }),
    next: data.links?.next ?? null,
  };
}

async function getMetricAggregate(input: unknown, ctx: ConnectorContext) {
  const args = metricAggregateInputSchema.parse(input ?? {});
  assertDateRange(args.from, args.to);
  const body = buildKlaviyoMetricAggregateBody(args);
  const response = await klaviyoPost<AggregateResponse>(
    ctx.companyId,
    "metric-aggregates",
    body,
  );
  const attrs = response.data.attributes;
  const firstGroup = attrs.data[0];
  const series = firstGroup?.measurements[args.measurement] ?? [];
  const rows = attrs.dates.map((date, index) => ({
    period: date.slice(0, 10),
    value: series[index] ?? 0,
  }));
  const total = rows.reduce((sum, row) => sum + row.value, 0);

  return {
    metricId: args.metricId,
    measurement: args.measurement,
    interval: args.interval,
    timezone: args.timezone,
    total: Math.round(total * 100) / 100,
    series: rows,
    groups: attrs.data.map((group) => ({
      dimensions: group.dimensions,
      measurements: group.measurements,
    })),
  };
}

export function buildKlaviyoMetricAggregateBody(
  args: z.infer<typeof metricAggregateInputSchema>,
) {
  const dateFilter = `greater-or-equal(datetime,${args.from}T00:00:00),less-than(datetime,${args.to}T23:59:59)`;
  const filter = [dateFilter, args.filter].filter(Boolean);

  return {
    data: {
      type: "metric-aggregate",
      attributes: {
        metric_id: args.metricId,
        measurements: [args.measurement],
        interval: args.interval,
        timezone: args.timezone,
        filter,
        ...(args.by?.length ? { by: args.by } : {}),
      },
    },
  };
}

function summarizeTemplate(
  template: JsonApiResourceData<TemplateAttrs>,
  includeContent: boolean,
) {
  const attrs = template.attributes;
  const base = {
    id: template.id,
    name: attrs.name ?? "Untitled template",
    editorType: attrs.editor_type ?? null,
    created: attrs.created ?? null,
    updated: attrs.updated ?? null,
  };

  if (!includeContent) return base;

  return {
    ...base,
    hasHtml: typeof attrs.html === "string" && attrs.html.length > 0,
    htmlCharCount: typeof attrs.html === "string" ? attrs.html.length : 0,
    html: attrs.html ?? null,
    text: attrs.text ?? null,
    amp: attrs.amp ?? null,
  };
}

function getRelationshipRef(
  resource: JsonApiResourceData<unknown>,
  name: string,
) {
  const data = resource.relationships?.[name]?.data;
  if (!data || Array.isArray(data)) return null;
  return data;
}

function escapeKlaviyoFilterString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function assertDateRange(from: string, to: string) {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T23:59:59Z`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new KlaviyoError("api_error", "Invalid aggregate date range.");
  }

  if (start > end) {
    throw new KlaviyoError(
      "api_error",
      "Aggregate start date must be before end date.",
    );
  }

  const days = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
  if (days > 370) {
    throw new KlaviyoError(
      "api_error",
      "Klaviyo metric aggregate queries should stay within one year.",
    );
  }
}
