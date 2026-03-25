import { Activity, ScrollText, Settings, Shield } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: Activity },
  { to: "/logs", label: "Logs", icon: ScrollText },
  { to: "/rules", label: "Rules", icon: Shield },
  { to: "/config", label: "Config", icon: Settings },
] as const;

export function Topbar() {
  return (
    <div className="sticky top-0 z-40 border-b border-border/60 bg-gradient-to-r from-secondary/70 via-background to-secondary/70 backdrop-blur">
      <div className="flex w-full flex-wrap items-center gap-4 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 text-primary shadow-[0_0_18px_hsl(var(--primary)/0.18)]">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">NEXUS</p>
            <p className="text-xs font-semibold font-display text-foreground">Control Plane</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-wrap items-center gap-1 rounded-full border border-border/60 bg-background/70 p-1 shadow-inner">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground transition-all",
                "hover:text-foreground hover:bg-secondary/70",
              )}
              activeClassName="border border-primary/30 bg-primary/15 text-primary shadow-[0_0_18px_hsl(var(--primary)/0.2)]"
              pendingClassName="opacity-60"
              end={to === "/"}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-primary metric-pulse" />
          <span className="font-display uppercase tracking-[0.2em]">Live</span>
        </div>
      </div>
    </div>
  );
}
