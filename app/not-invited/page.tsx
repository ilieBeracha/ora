import Link from "next/link";

export default function NotInvitedPage() {
  return (
    <main className="auth-message-page">
      <section className="auth-message-card">
        <div className="brand-mark" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <h1>You need an invitation to join Ora.</h1>
        <p>
          This workspace is invitation-only. Ask an owner or admin to send an
          app invitation before signing in again.
        </p>
        <Link className="button button-primary" href="/logout">
          Sign out
        </Link>
      </section>
    </main>
  );
}
