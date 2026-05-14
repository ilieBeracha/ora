import type { z } from "zod";

export type ConnectorProvider =
  | "shopify"
  | "klaviyo"
  | "meta"
  | "google_analytics"
  | "google_search_console";

export type ConnectorStatus = "disconnected" | "connected" | "error";

export type ConnectorConnection = {
  id: string;
  companyId: string;
  provider: ConnectorProvider;
  status: ConnectorStatus;
  configEnc: string | null;
  lastError: string | null;
  lastCheckedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ConnectorContext = {
  userId?: string;
  companyId: string;
};

export type ConnectorTestResult = {
  ok: boolean;
  message?: string;
  checkedAt: Date;
  metadata?: Record<string, unknown>;
};

export type ConnectorTool = {
  name: string;
  description: string;
  inputSchema: z.ZodSchema;
  readOnly: boolean;
  execute(input: unknown, ctx: ConnectorContext): Promise<unknown>;
};

export type ConnectorAdapter = {
  provider: ConnectorProvider;
  label: string;
  tools: ConnectorTool[];
  testConnection(ctx: ConnectorContext): Promise<ConnectorTestResult>;
};
