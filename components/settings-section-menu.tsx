"use client";

import { Settings, UserPlus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const settingsItems = [
  {
    href: "/settings",
    label: "Settings",
    description: "App preferences",
    icon: Settings,
  },
  {
    href: "/invite",
    label: "Invite",
    description: "Users and invitations",
    icon: UserPlus,
  },
];

export function SettingsSectionMenu({ canInvite }: { canInvite: boolean }) {
  const pathname = usePathname();
  const inSettingsSection =
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    pathname === "/invite" ||
    pathname.startsWith("/invite/");

  if (!inSettingsSection) return null;
  const visibleItems = canInvite
    ? settingsItems
    : settingsItems.filter((item) => item.href !== "/invite");

  return (
    <aside className="section-sidebar" aria-label="Settings menu">
      <div>
        <div className="section-sidebar-label">Settings</div>
        <nav className="section-sidebar-nav">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <Link
                className={
                  active
                    ? "section-sidebar-link section-sidebar-link-active"
                    : "section-sidebar-link"
                }
                href={item.href}
                key={item.href}
              >
                <Icon size={16} aria-hidden="true" />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
