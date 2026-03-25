import { cn } from "@/lib/utils";

interface StatusIndicatorProps {
  name: string;
  status: "healthy" | "unhealthy" | "unknown" | "disabled";
  latency?: number;
}

const STATUS_STYLES = {
  healthy: {
    dot: "bg-primary metric-pulse",
    label: "HEALTHY",
    text: "text-primary",
  },
  unhealthy: {
    dot: "bg-destructive",
    label: "DOWN",
    text: "text-destructive",
  },
  unknown: {
    dot: "bg-warning",
    label: "UNKNOWN",
    text: "text-warning",
  },
  disabled: {
    dot: "bg-muted-foreground/70",
    label: "DISABLED",
    text: "text-muted-foreground",
  },
} as const;

export function StatusIndicator({ name, status, latency }: StatusIndicatorProps) {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.unknown;
  const isHealthy = status === "healthy";
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className={cn("h-2 w-2 rounded-full", style.dot)} />
        <span className="text-sm font-medium font-display text-card-foreground">{name}</span>
      </div>
      {isHealthy && latency !== undefined && (
        <span className="text-xs text-muted-foreground font-display">{latency}ms</span>
      )}
      {!isHealthy && <span className={cn("text-xs font-medium", style.text)}>{style.label}</span>}
    </div>
  );
}
