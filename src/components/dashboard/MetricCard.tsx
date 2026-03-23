import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  variant?: "default" | "success" | "warning" | "danger";
}

const variantStyles = {
  default: "border-border",
  success: "border-primary/30 glow-primary",
  warning: "border-warning/30",
  danger: "border-destructive/30",
};

const trendColors = {
  up: "text-primary",
  down: "text-destructive",
  neutral: "text-muted-foreground",
};

export function MetricCard({ title, value, subtitle, icon, trend, trendValue, variant = "default" }: MetricCardProps) {
  return (
    <div className={cn("rounded-lg border bg-card p-5 transition-all hover:bg-secondary/50", variantStyles[variant])}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground font-display">{title}</p>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <p className="mt-2 text-3xl font-bold font-display text-card-foreground">{value}</p>
      <div className="mt-1 flex items-center gap-2">
        {trend && trendValue && (
          <span className={cn("text-xs font-medium", trendColors[trend])}>
            {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"} {trendValue}
          </span>
        )}
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
      </div>
    </div>
  );
}
