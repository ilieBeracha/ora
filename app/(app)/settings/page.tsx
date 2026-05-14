import { PageHeader } from "@/components/page-header";
import { requireCurrentUser } from "@/lib/auth/session";

export default async function SettingsPage() {
  const user = await requireCurrentUser();

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="App settings"
        description="Ora v1 keeps settings deliberately small: app-level users, roles, and the focused Signal workflow."
        marker="05"
      />

      <section className="panel panel-pad">
        <h2 className="section-title">Current user</h2>
        <dl className="mt-4 grid gap-3 text-sm">
          <div>
            <dt className="muted">Email</dt>
            <dd className="m-0">{user.email}</dd>
          </div>
          <div>
            <dt className="muted">Role</dt>
            <dd className="m-0">{user.role}</dd>
          </div>
          <div>
            <dt className="muted">Status</dt>
            <dd className="m-0">{user.status}</dd>
          </div>
        </dl>
      </section>
    </>
  );
}
