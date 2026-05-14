import { ChatOpenButton } from "@/components/chat-open-button";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { StatusBadge } from "@/components/status-badge";
import { canManageApp, requireCurrentUser } from "@/lib/auth/session";
import {
  KLAVIYO_DEFAULT_REVISION,
  type KlaviyoConfig,
} from "@/lib/connectors/klaviyo";
import { getConnector, getConnectorConfig } from "@/lib/connectors/store";
import { prisma } from "@/lib/db";
import { formatDate, formatMoneyFromCents } from "@/lib/format";
import {
  detectSignalsAction,
  disconnectKlaviyoAction,
  disconnectShopifyAction,
  saveKlaviyoApiKeyConnection,
  saveShopifyApiKeyConnection,
  syncProductsAction,
} from "./actions";

export default async function ConnectionsPage() {
  const user = await requireCurrentUser();
  if (!user.companyId) {
    return null;
  }
  const [connections, klaviyoConnection, klaviyoConfig] = await Promise.all([
    prisma.shopifyConnection.findMany({
      where: { companyId: user.companyId, status: "connected" },
      orderBy: { connectedAt: "desc" },
      include: {
        _count: {
          select: {
            customerLifecycleProfiles: true,
            products: true,
          },
        },
        customerLifecycleSnapshots: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    }),
    getConnector(user.companyId, "klaviyo"),
    getConnectorConfig<KlaviyoConfig>(user.companyId, "klaviyo"),
  ]);
  const canManage = canManageApp(user.role);
  const hasConnectedTools =
    connections.length > 0 || klaviyoConnection?.status === "connected";

  return (
    <>
      <PageHeader
        eyebrow="Connections"
        title="Connected tools"
        description="Ora stores connector config centrally, exposes connected read-only tools to chat, and reserves mutations for approved actions."
        marker="03"
      />

      {!hasConnectedTools ? (
        <EmptyState
          title="No tools connected"
          note="C0"
          body={
            canManage
              ? "Connect Shopify for Signals or Klaviyo for lifecycle data in chat."
              : "Ask an owner or admin to connect Shopify or Klaviyo."
          }
        />
      ) : (
        <div className="stack mb-5">
          {connections.map((connection) => (
            <section
              className="panel panel-pad signal-card connection-card"
              data-chat-explain="true"
              data-chat-source="connection-card"
              data-chat-title={connection.shopName ?? connection.shopDomain}
              data-chat-description={`${connection._count.products} mirrored products. Status: ${connection.status}.`}
              data-chat-prompt={`Explain this Shopify connection for "${
                connection.shopName ?? connection.shopDomain
              }" and what I should check next.`}
              key={connection.id}
            >
              <ChatOpenButton
                label={`Open ${connection.shopName ?? connection.shopDomain} in chat`}
              />
              <div className="connection-primary">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h2 className="section-title">
                      {connection.shopName ?? connection.shopDomain}
                    </h2>
                    <StatusBadge status={connection.status} />
                  </div>
                  <p className="muted text-sm">{connection.shopDomain}</p>

                  <div className="status-strip mt-4">
                    <div className="status-strip-item">
                      <span className="fact-label">Products</span>
                      <span>{connection._count.products} mirrored</span>
                    </div>
                    <div className="status-strip-item">
                      <span className="fact-label">Auth</span>
                      <span>
                        {connection.authMethod === "api_key" ? "API key" : "OAuth"}
                      </span>
                    </div>
                    <div className="status-strip-item">
                      <span className="fact-label">Last sync</span>
                      <span>{formatDate(connection.lastSyncAt)}</span>
                    </div>
                    <div className="status-strip-item">
                      <span className="fact-label">Signal detection</span>
                      {connection.lastSignalDetectionStatus ? (
                        <StatusBadge
                          status={connection.lastSignalDetectionStatus}
                        />
                      ) : (
                        <StatusBadge status="not run" />
                      )}
                    </div>
                    {connection.lastSignalDetectionAt ? (
                      <div className="status-strip-item">
                        <span className="fact-label">Detected</span>
                        <span>{formatDate(connection.lastSignalDetectionAt)}</span>
                      </div>
                    ) : null}
                    {typeof connection.lastSignalDetectionSignalCount ===
                    "number" ? (
                      <div className="status-strip-item">
                        <span className="fact-label">Signals</span>
                        <span>
                          {connection.lastSignalDetectionSignalCount} found
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-3 grid gap-2 text-sm">
                    {connection.lastSignalDetectionSummary ? (
                      <p className="muted">
                        {connection.lastSignalDetectionSummary}
                      </p>
                    ) : null}
                    {connection.lastSignalDetectionError ? (
                      <p className="text-red-800">
                        {connection.lastSignalDetectionError}
                      </p>
                    ) : null}
                  </div>
                  {connection.lastSyncError ? (
                    <p className="mt-2 text-sm text-red-800">
                      {connection.lastSyncError}
                    </p>
                  ) : null}

                  <LifecycleScanStatus
                    classifiedCount={
                      connection._count.customerLifecycleProfiles
                    }
                    snapshot={connection.customerLifecycleSnapshots[0] ?? null}
                  />
                </div>

                {canManage ? (
                  <div className="connection-actions">
                    <form action={syncProductsAction}>
                      <input
                        type="hidden"
                        name="connectionId"
                        value={connection.id}
                      />
                      <PendingSubmitButton
                        className="button button-quiet"
                        pendingLabel="Refreshing..."
                      >
                        Refresh products
                      </PendingSubmitButton>
                    </form>
                    <form action={detectSignalsAction}>
                      <input
                        type="hidden"
                        name="connectionId"
                        value={connection.id}
                      />
                      <PendingSubmitButton
                        className="button button-primary"
                        pendingLabel="Detecting..."
                      >
                        Detect Signals
                      </PendingSubmitButton>
                    </form>
                    <form action={disconnectShopifyAction}>
                      <input
                        type="hidden"
                        name="connectionId"
                        value={connection.id}
                      />
                      <PendingSubmitButton
                        className="button button-danger"
                        pendingLabel="Disconnecting..."
                      >
                        Disconnect
                      </PendingSubmitButton>
                    </form>
                  </div>
                ) : null}
              </div>
            </section>
          ))}
          {klaviyoConnection?.status === "connected" ? (
            <section
              className="panel panel-pad signal-card connection-card"
              data-chat-explain="true"
              data-chat-source="connection-card"
              data-chat-title={klaviyoConfig?.accountName ?? "Klaviyo"}
              data-chat-description="Read-only lifecycle and customer data for chat."
              data-chat-prompt={`Explain this Klaviyo connection for "${
                klaviyoConfig?.accountName ?? "Klaviyo"
              }" and what customer or lifecycle questions it can answer.`}
            >
              <ChatOpenButton
                label={`Open ${klaviyoConfig?.accountName ?? "Klaviyo"} in chat`}
              />
              <div className="connection-primary">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h2 className="section-title">
                      {klaviyoConfig?.accountName ?? "Klaviyo"}
                    </h2>
                    <StatusBadge status={klaviyoConnection.status} />
                  </div>
                  <p className="muted text-sm">
                    Read-only lifecycle and customer data for chat.
                  </p>

                  <div className="status-strip mt-4">
                    <div className="status-strip-item">
                      <span className="fact-label">Provider</span>
                      <span>Klaviyo</span>
                    </div>
                    <div className="status-strip-item">
                      <span className="fact-label">Account</span>
                      <span>{klaviyoConfig?.accountId ?? "Verified"}</span>
                    </div>
                    <div className="status-strip-item">
                      <span className="fact-label">Revision</span>
                      <span>
                        {klaviyoConfig?.apiRevision ?? KLAVIYO_DEFAULT_REVISION}
                      </span>
                    </div>
                    <div className="status-strip-item">
                      <span className="fact-label">Last checked</span>
                      <span>{formatDate(klaviyoConnection.lastCheckedAt)}</span>
                    </div>
                    {klaviyoConfig?.currency ? (
                      <div className="status-strip-item">
                        <span className="fact-label">Currency</span>
                        <span>{klaviyoConfig.currency}</span>
                      </div>
                    ) : null}
                    {klaviyoConfig?.timezone ? (
                      <div className="status-strip-item">
                        <span className="fact-label">Timezone</span>
                        <span>{klaviyoConfig.timezone}</span>
                      </div>
                    ) : null}
                  </div>

                  {klaviyoConnection.lastError ? (
                    <p className="mt-3 text-sm text-red-800">
                      {klaviyoConnection.lastError}
                    </p>
                  ) : null}
                </div>

                {canManage ? (
                  <div className="connection-actions">
                    <form action={disconnectKlaviyoAction}>
                      <PendingSubmitButton
                        className="button button-danger"
                        pendingLabel="Disconnecting..."
                      >
                        Disconnect
                      </PendingSubmitButton>
                    </form>
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      )}

      {canManage ? (
        <details
          className="panel panel-pad compact-form credential-details"
          open={connections.length === 0}
        >
          <summary className="credential-summary">
            <span>
              {connections.length === 0
                ? "Custom app credentials"
                : "Connection credentials"}
            </span>
            <span className="badge">API key</span>
          </summary>
          <form action={saveShopifyApiKeyConnection}>
            <p className="muted mt-2 max-w-2xl text-sm leading-6">
              Use the Shopify API key and secret from a custom app. Ora
              exchanges them server-side, stores secrets encrypted, and only
              mutates Shopify after approval.
            </p>

            <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_1fr_136px]">
              <label className="grid gap-1.5">
                <span className="text-xs font-bold">Shop domain</span>
                <input
                  className="input"
                  name="shop"
                  placeholder="your-store.myshopify.com"
                  required
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-bold">API key</span>
                <input
                  autoComplete="off"
                  className="input"
                  name="clientId"
                  placeholder="Shopify API key"
                  required
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-bold">API version</span>
                <input
                  className="input"
                  name="apiVersion"
                  placeholder="2026-04"
                />
              </label>
            </div>

            <label className="mt-3 grid gap-1.5">
              <span className="text-xs font-bold">API secret key</span>
              <input
                autoComplete="off"
                className="input"
                name="clientSecret"
                placeholder="Shopify API secret key"
                required
                type="password"
              />
            </label>

            <button className="button button-primary mt-4" type="submit">
              Save connection
            </button>
          </form>
        </details>
      ) : null}

      {canManage ? (
        <details
          className="panel panel-pad compact-form credential-details"
          open={klaviyoConnection?.status !== "connected"}
        >
          <summary className="credential-summary">
            <span>Klaviyo private API key</span>
            <span className="badge">Read only</span>
          </summary>
          <form action={saveKlaviyoApiKeyConnection}>
            <p className="muted mt-2 max-w-2xl text-sm leading-6">
              Use a Klaviyo private API key with read scopes. Ora stores it
              encrypted and only exposes read-only Klaviyo tools to chat.
            </p>

            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
              <label className="grid gap-1.5">
                <span className="text-xs font-bold">Private API key</span>
                <input
                  autoComplete="off"
                  className="input"
                  name="apiKey"
                  placeholder="pk_..."
                  required
                  type="password"
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-bold">API revision</span>
                <input
                  className="input"
                  name="apiRevision"
                  placeholder={KLAVIYO_DEFAULT_REVISION}
                />
              </label>
            </div>

            <button className="button button-primary mt-4" type="submit">
              Save Klaviyo
            </button>
          </form>
        </details>
      ) : null}
    </>
  );
}

function LifecycleScanStatus({
  classifiedCount,
  snapshot,
}: {
  classifiedCount: number;
  snapshot: {
    activeRepeatCount: number;
    atRiskCount: number;
    churnedCount: number;
    createdAt: Date;
    highAovCount: number;
    newCount: number;
    sweepDate: string;
    totalCustomers: number;
    totalRevenueCents: number;
    vipCount: number;
  } | null;
}) {
  if (!snapshot && classifiedCount === 0) {
    return (
      <div className="lifecycle-scan-panel">
        <div>
          <span className="fact-label">Customer lifecycle</span>
          <strong>Not scanned yet</strong>
        </div>
        <p>
          Run Detect Signals after Shopify customer permissions are available to
          classify customer groups.
        </p>
      </div>
    );
  }

  return (
    <div className="lifecycle-scan-panel">
      <div className="lifecycle-scan-head">
        <div>
          <span className="fact-label">Customer lifecycle</span>
          <strong>{classifiedCount} purchasing customers classified</strong>
        </div>
        {snapshot ? <StatusBadge status={`snapshot ${snapshot.sweepDate}`} /> : null}
      </div>

      {snapshot ? (
        <>
          <div className="lifecycle-mix-grid">
            <LifecycleMetric label="New" value={snapshot.newCount} />
            <LifecycleMetric
              label="Active repeat"
              value={snapshot.activeRepeatCount}
            />
            <LifecycleMetric label="At-risk" value={snapshot.atRiskCount} />
            <LifecycleMetric label="Churned" value={snapshot.churnedCount} />
            <LifecycleMetric label="VIP" value={snapshot.vipCount} />
            <LifecycleMetric label="High AOV" value={snapshot.highAovCount} />
          </div>
          <p>
            Customer lifecycle counts are scan evidence. Ora only creates a
            customer Signal when a group is large or valuable enough to act on.
            Last classified {formatDate(snapshot.createdAt)} ·{" "}
            {formatMoneyFromCents(snapshot.totalRevenueCents)} lifetime spend.
          </p>
        </>
      ) : (
        <p>
          Customer rows exist, but no lifecycle snapshot has been recorded yet.
          Run Detect Signals again to refresh the lifecycle scan.
        </p>
      )}
    </div>
  );
}

function LifecycleMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="lifecycle-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
