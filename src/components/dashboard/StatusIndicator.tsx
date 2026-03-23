import { cn } from "@/lib/utils";

interface StatusIndicatorProps {
  name: string;
  healthy: boolean;
  latency?: number;
}

export function StatusIndicator({ name, healthy, latency }: StatusIndicatorProps) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2">
      <div className="flex items-center gap-2">
        <span className={cn("h-2 w-2 rounded-full", healthy ? "bg-primary metric-pulse" : "bg-destructive")} />
        <span className="text-sm font-medium font-display text-card-foreground">{name}</span>
      </div>
      {healthy && latency !== undefined && (
        <span className="text-xs text-muted-foreground font-display">{latency}ms</span>
      )}
      {!healthy && <span className="text-xs font-medium text-destructive">DOWN</span>}
    </div>
  );
}
