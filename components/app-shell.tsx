import Link from "next/link";
import {
  Bell,
  LogOut,
  Mic,
  Search,
  Settings,
} from "lucide-react";

import { AssistantChat } from "@/components/assistant-chat";
import { SettingsSectionMenu } from "@/components/settings-section-menu";
import { SidebarNav } from "@/components/sidebar-nav";
import { canManageApp } from "@/lib/auth/session";
import { getTopSignals } from "@/lib/signals/queries";

export async function AppShell({
  user,
  children,
}: {
  user: {
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
    companyId: string | null;
  };
  children: React.ReactNode;
}) {
  const initial = user.email.slice(0, 1);
  const canManage = canManageApp(user.role);
  const topSignals = user.companyId ? await getTopSignals(user.companyId, 3) : [];

  return (
    <div className="workspace-stage">
      <div className="app-window">
        <aside className="sidebar">
          <Link href="/today" className="brand-wordmark" aria-label="Ora">
            <span className="brand-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </Link>

          <SidebarNav />

          <Link href="/logout" className="rail-exit" aria-label="Sign out">
            <LogOut size={20} aria-hidden="true" />
          </Link>
        </aside>

        <SettingsSectionMenu canInvite={canManage} />

        <div className="main-pane">
          <header className="topbar">
            <div className="command-search" aria-label="Signal assistant search">
              <Mic size={18} aria-hidden="true" />
              <span>Ask about your store</span>
              <kbd>/</kbd>
            </div>

            <nav className="signal-tabs" aria-label="Priority Signals">
              {topSignals.length === 0 ? (
                <span className="signal-tab signal-tab-empty">
                  No open Signals
                </span>
              ) : (
                topSignals.map((signal) => (
                  <Link
                    className="signal-tab"
                    href={`/signals/${signal.id}`}
                    key={signal.id}
                  >
                    <span className="priority-pill">
                      {signal.severity.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="urgency-text">{signal.severity}</span>
                    <span className="tab-title">{signal.title}</span>
                  </Link>
                ))
              )}
            </nav>

            <div className="topbar-actions">
              <Link
                href="/signals"
                className="icon-button"
                aria-label="Search Signals"
              >
                <Search size={18} aria-hidden="true" />
              </Link>
              <Link
                href="/settings"
                className="icon-button"
                aria-label="Settings"
              >
                <Settings size={18} aria-hidden="true" />
              </Link>
              <span
                className="icon-button notification-dot"
                aria-label="Notifications"
              >
                <Bell size={18} aria-hidden="true" />
              </span>
              <div className="user-chip" title={`${user.email} · ${user.role}`}>
                <div className="user-dot">{initial}</div>
              </div>
            </div>
          </header>

          <div className="content-shell">
            <section className="workspace-panel">
              <main className="content">{children}</main>
            </section>

            <AssistantChat />
          </div>
        </div>
      </div>
    </div>
  );
}
