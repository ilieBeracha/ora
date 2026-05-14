import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { canManageApp, requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { inviteUserAction, revokeInvitationAction } from "./actions";

export default async function InvitePage() {
  const user = await requireCurrentUser();

  if (!canManageApp(user.role)) {
    return (
      <>
        <PageHeader
          eyebrow="Invite"
          title="App-wide invitations"
          description="Invite users into Ora without WorkOS Organizations."
          marker="06"
        />

        <section className="panel panel-pad">
          <h2 className="section-title">Owners and admins only</h2>
          <p className="muted mt-2 text-sm">
            Your current role is {user.role}. Ask an owner or admin to send
            invitations or change your app role.
          </p>
        </section>
      </>
    );
  }

  if (!user.companyId) {
    return null;
  }

  const [users, invitations] = await Promise.all([
    prisma.user.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invitation.findMany({
      where: { companyId: user.companyId },
      orderBy: { createdAt: "desc" },
      include: { invitedBy: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Invite"
        title="App-wide invitations"
        description="Invite users into Ora without WorkOS Organizations. Owners and admins manage invitations; members can view Signals and actions."
        marker="06"
      />

      <form action={inviteUserAction} className="panel panel-pad mb-5">
        <label className="grid gap-2">
          <span className="text-sm font-bold">Email</span>
          <input className="input" name="email" type="email" required />
        </label>
        <button className="button button-primary mt-4" type="submit">
          Send invite
        </button>
      </form>

      <section className="panel panel-pad mb-5">
        <h2 className="section-title">Users</h2>
        <div className="mt-4 grid gap-3">
          {users.map((appUser) => (
            <div
              className="flex flex-col gap-2 border-t border-[var(--line)] pt-3 sm:flex-row sm:items-center sm:justify-between"
              key={appUser.id}
            >
              <div>
                <div className="font-bold">{appUser.email}</div>
                <div className="muted text-sm">
                  {appUser.firstName} {appUser.lastName}
                </div>
              </div>
              <div className="flex gap-2">
                <StatusBadge status={appUser.role} />
                <StatusBadge status={appUser.status} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel panel-pad">
        <h2 className="section-title">Invitations</h2>
        <div className="mt-4 grid gap-3">
          {invitations.length === 0 ? (
            <p className="muted text-sm">No invitations have been sent yet.</p>
          ) : (
            invitations.map((invitation) => (
              <div
                className="flex flex-col gap-3 border-t border-[var(--line)] pt-3 sm:flex-row sm:items-center sm:justify-between"
                key={invitation.id}
              >
                <div>
                  <div className="font-bold">{invitation.email}</div>
                  <div className="muted text-sm">
                    Invited by {invitation.invitedBy?.email ?? "unknown"} ·
                    Expires {formatDate(invitation.expiresAt)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge status={invitation.status} />
                  {invitation.status === "pending" ? (
                    <form action={revokeInvitationAction}>
                      <input
                        type="hidden"
                        name="invitationId"
                        value={invitation.id}
                      />
                      <button className="button button-danger" type="submit">
                        Revoke
                      </button>
                    </form>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </>
  );
}
