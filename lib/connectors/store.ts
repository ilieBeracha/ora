import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";
import type {
  ConnectorConnection,
  ConnectorProvider,
  ConnectorStatus,
} from "@/lib/connectors/types";

export async function getConnector(
  companyId: string,
  provider: ConnectorProvider,
) {
  return prisma.connectorConnection.findUnique({
    where: { companyId_provider: { companyId, provider } },
  }) as Promise<ConnectorConnection | null>;
}

export async function saveConnectorConfig(
  companyId: string,
  provider: ConnectorProvider,
  config: unknown,
) {
  const configEnc = encryptSecret(JSON.stringify(config));

  return prisma.connectorConnection.upsert({
    where: { companyId_provider: { companyId, provider } },
    update: {
      configEnc,
      status: "connected",
      lastError: null,
      lastCheckedAt: new Date(),
    },
    create: {
      companyId,
      provider,
      configEnc,
      status: "connected",
      lastCheckedAt: new Date(),
    },
  }) as Promise<ConnectorConnection>;
}

export async function getConnectorConfig<TConfig>(
  companyId: string,
  provider: ConnectorProvider,
) {
  const connector = await getConnector(companyId, provider);

  if (!connector?.configEnc) return null;

  return JSON.parse(decryptSecret(connector.configEnc)) as TConfig;
}

export async function markConnectorStatus(
  companyId: string,
  provider: ConnectorProvider,
  status: ConnectorStatus,
  error?: string | null,
) {
  return prisma.connectorConnection.upsert({
    where: { companyId_provider: { companyId, provider } },
    update: {
      status,
      lastError: error ?? null,
      lastCheckedAt: new Date(),
    },
    create: {
      companyId,
      provider,
      status,
      lastError: error ?? null,
      lastCheckedAt: new Date(),
    },
  }) as Promise<ConnectorConnection>;
}

export async function deleteConnector(
  companyId: string,
  provider: ConnectorProvider,
) {
  await prisma.connectorConnection.deleteMany({
    where: { companyId, provider },
  });
}

export async function getConnectedProviders(companyId: string) {
  const connectors = await prisma.connectorConnection.findMany({
    where: { companyId, status: "connected" },
    select: { provider: true },
  });

  return new Set(connectors.map((connector) => connector.provider));
}

export async function isConnectorConnected(
  companyId: string,
  provider: ConnectorProvider,
) {
  const connector = await getConnector(companyId, provider);

  return connector?.status === "connected" && Boolean(connector.configEnc);
}
