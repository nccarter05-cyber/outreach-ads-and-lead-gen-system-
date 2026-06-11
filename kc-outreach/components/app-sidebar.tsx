"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Crown,
  Users,
  Target,
  Megaphone,
  ListOrdered,
  Phone,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { label: "Command Center", href: "/", icon: Crown },
  { label: "Leads", href: "/leads", icon: Users },
  { label: "Audiences", href: "/audiences", icon: Target },
  { label: "Sequences", href: "/sequences", icon: ListOrdered },
  { label: "Campaigns", href: "/campaigns", icon: Megaphone },
  { label: "Call List", href: "/calls", icon: Phone },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-sidebar-border bg-sidebar">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 pt-6 pb-8">
        <div className="flex size-9 items-center justify-center rounded-full border border-gold/40 bg-gold/10">
          <Crown className="size-4 text-gold" />
        </div>
        <div className="leading-tight">
          <div className="heading-display text-[15px] tracking-[0.08em] text-foreground">
            KING CIRCLE
          </div>
          <div className="label-caps text-gold/80">Outreach AI</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-1 flex-col gap-1 px-3">
        <div className="label-caps px-2 pb-2 text-muted-foreground/70">
          Operations
        </div>
        {navItems.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-gold/10 text-gold"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              )}
            >
              {active && (
                <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-gold" />
              )}
              <item.icon
                className={cn(
                  "size-4",
                  active
                    ? "text-gold"
                    : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80"
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border px-3 py-4">
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          <Settings className="size-4" />
          Settings
        </button>
        <div className="mt-3 flex items-center gap-3 px-3">
          <div className="flex size-8 items-center justify-center rounded-full bg-gold/15 font-mono text-xs text-gold">
            NC
          </div>
          <div className="leading-tight">
            <div className="text-sm text-sidebar-foreground">Nate Carter</div>
            <div className="text-xs text-muted-foreground">Owner</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
