"use client";

import {
  BellDot,
  CheckCircle2,
  History,
  Plug,
  Settings,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/today", label: "Today", icon: BellDot },
  { href: "/signals", label: "Signals", icon: CheckCircle2 },
  { href: "/actions", label: "Actions", icon: History },
  { href: "/connections", label: "Connections", icon: Plug },
  { href: "/settings", label: "Settings", icon: Settings, aliases: ["/invite"] },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="grid gap-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active =
          pathname === item.href ||
          pathname.startsWith(`${item.href}/`) ||
          item.aliases?.some(
            (alias) => pathname === alias || pathname.startsWith(`${alias}/`),
          );

        return (
          <Link
            key={item.href}
            href={item.href}
            className={active ? "nav-link nav-link-active" : "nav-link"}
            title={item.label}
          >
            <Icon size={18} aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
