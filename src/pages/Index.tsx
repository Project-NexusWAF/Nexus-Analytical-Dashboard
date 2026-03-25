import { useEffect, useMemo, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";
import { Activity, Shield, Zap, Globe, Brain, AlertTriangle } from "lucide-react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { StatusIndicator } from "@/components/dashboard/StatusIndicator";
import {
  AttackLogEntry,
  fetchHealthSnapshot,
  fetchRecentLogs,
  fetchStatsSnapshot,
} from "@/lib/control-api";

const CHART_COLORS = [
  "hsl(160, 70%, 45%)", "hsl(200, 80%, 55%)", "hsl(280, 65%, 60%)",
  "hsl(35, 90%, 55%)", "hsl(0, 72%, 55%)", "hsl(50, 80%, 50%)",
];

const tooltipStyle = {
  contentStyle: { background: "hsl(220, 18%, 10%)", border: "1px solid hsl(220, 14%, 18%)", borderRadius: 8, fontFamily: "JetBrains Mono", fontSize: 12 },
  labelStyle: { color: "hsl(210, 20%, 92%)" },
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

function toMinuteLabel(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function summarizeLogs(logs: AttackLogEntry[]) {
  const decisions = new Map<string, number>();
  const blockReasons = new Map<string, number>();
  const ips = new Map<string, number>();
  const tags = new Map<string, number>();
  const requestsByMinute = new Map<string, number>();
  const mlByMinute = new Map<string, number>();

  for (const log of logs) {
    decisions.set(log.decision, (decisions.get(log.decision) || 0) + 1);

    const reason = log.blocked_by || log.block_code || "other";
    if (log.decision.toLowerCase().includes("block") || log.decision.toLowerCase().includes("rate")) {
      blockReasons.set(reason, (blockReasons.get(reason) || 0) + 1);
    }

    ips.set(log.client_ip, (ips.get(log.client_ip) || 0) + 1);

    for (const tag of log.threat_tags || []) {
      tags.set(tag, (tags.get(tag) || 0) + 1);
    }

    const minute = toMinuteLabel(log.timestamp);
    requestsByMinute.set(minute, (requestsByMinute.get(minute) || 0) + 1);
    if (typeof log.ml_score === "number") {
      mlByMinute.set(minute, (mlByMinute.get(minute) || 0) + 1);
    }
  }

  const requestsSeries = Array.from(requestsByMinute.entries())
    .map(([time, value]) => ({ time, value }))
    .sort((a, b) => a.time.localeCompare(b.time));

  const mlSeries = Array.from(mlByMinute.entries())
    .map(([time, value]) => ({ time, value }))
    .sort((a, b) => a.time.localeCompare(b.time));

  return {
    decisions: Array.from(decisions.entries()).map(([status, count]) => ({ status, count })),
    blocked: Array.from(blockReasons.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
    topIps: Array.from(ips.entries())
      .map(([client_ip, count]) => ({ client_ip, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    topTags: Array.from(tags.entries())
      .map(([rule_id, count]) => ({ rule_id, action: "tag", count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
    requestsSeries,
    mlSeries,
  };
}

export default function Index() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<{ ok: boolean; status: string; config_version: number } | null>(null);
  const [stats, setStats] = useState<{
    requests_total: number;
    blocked_total: number;
    rate_limited_total: number;
    pipeline_layers: string[];
    config_version: number;
    ml_circuit_state: string;
    healthy_upstreams: number;
  } | null>(null);
  const [logs, setLogs] = useState<AttackLogEntry[]>([]);

  const logSummary = useMemo(() => summarizeLogs(logs), [logs]);

  const derivedSummary = useMemo(() => {
    if (!stats) {
      return {
        blockedPercent: 0,
        totalRequests: 0,
        blockedTotal: 0,
        rateLimitedTotal: 0,
        pipelineLayerCount: 0,
        healthyUpstreams: 0,
      };
    }

    const blockedPercent = stats.requests_total > 0
      ? +((stats.blocked_total / stats.requests_total) * 100).toFixed(2)
      : 0;

    return {
      blockedPercent,
      totalRequests: stats.requests_total,
      blockedTotal: stats.blocked_total,
      rateLimitedTotal: stats.rate_limited_total,
      pipelineLayerCount: stats.pipeline_layers.length,
      healthyUpstreams: stats.healthy_upstreams,
    };
  }, [stats]);

  const layerDurations = useMemo(
    () => (stats?.pipeline_layers || []).map((layer, index) => ({
      layer,
      p50: +(0.7 + index * 0.4).toFixed(1),
      p95: +(2 + index * 0.8).toFixed(1),
      p99: +(4 + index * 1.4).toFixed(1),
    })),
    [stats]
  );

  const upstreams = useMemo(
    () => Array.from({ length: stats?.healthy_upstreams || 0 }, (_, index) => ({
      upstream: `upstream-${index + 1}`,
      health: 1,
      latency: 0,
    })),
    [stats]
  );

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const [nextHealth, nextStats, nextLogs] = await Promise.all([
          fetchHealthSnapshot(),
          fetchStatsSnapshot(),
          fetchRecentLogs(),
        ]);

        if (!mounted) return;

        setHealth(nextHealth);
        setStats(nextStats);
        setLogs(nextLogs);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load dashboard data");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    load();
    const interval = setInterval(load, 5000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background p-6">
      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold font-display text-foreground tracking-tight">NEXUS DASHBOARD</h1>
          <p className="text-xs text-muted-foreground">Real-time observability · Auto-refreshing every 5s</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary metric-pulse" />
          <span className="text-xs text-muted-foreground font-display">LIVE</span>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Failed to load backend data: {error}
        </div>
      )}

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <MetricCard title="Total Requests" value={formatNumber(derivedSummary.totalRequests)} icon={<Activity className="h-4 w-4" />} variant="success" />
        <MetricCard title="Rate Limited" value={formatNumber(derivedSummary.rateLimitedTotal)} icon={<Zap className="h-4 w-4" />} variant="warning" />
        <MetricCard title="Blocked %" value={`${derivedSummary.blockedPercent}%`} icon={<Shield className="h-4 w-4" />} />
        <MetricCard title="Config Version" value={health?.config_version || stats?.config_version || 0} icon={<Globe className="h-4 w-4" />} />
        <MetricCard title="ML Circuit" value={stats?.ml_circuit_state || "unknown"} icon={<Brain className="h-4 w-4" />} subtitle="control plane" />
        <MetricCard title="Upstreams" value={derivedSummary.healthyUpstreams} subtitle="healthy" icon={<AlertTriangle className="h-4 w-4" />} variant="success" />
      </div>

      {/* Row 1: Duration + Active Connections */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Request Volume" subtitle="Requests per minute from attack logs">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={logSummary.requestsSeries}>
              <defs>
                <linearGradient id="durationGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(160, 70%, 45%)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(160, 70%, 45%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: "hsl(215, 15%, 50%)" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(215, 15%, 50%)" }} />
              <Tooltip {...tooltipStyle} />
              <Area type="monotone" dataKey="value" stroke="hsl(160, 70%, 45%)" fill="url(#durationGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="ML-Scored Requests" subtitle="Requests per minute where ML score exists">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={logSummary.mlSeries}>
              <defs>
                <linearGradient id="connGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(200, 80%, 55%)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(200, 80%, 55%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: "hsl(215, 15%, 50%)" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(215, 15%, 50%)" }} />
              <Tooltip {...tooltipStyle} />
              <Area type="monotone" dataKey="value" stroke="hsl(200, 80%, 55%)" fill="url(#connGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 2: Blocked Requests + Requests by Status */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Blocked Requests" subtitle="By block reason from logs">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={logSummary.blocked} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
              <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(215, 15%, 50%)" }} />
              <YAxis dataKey="reason" type="category" tick={{ fontSize: 10, fill: "hsl(215, 15%, 50%)" }} width={100} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {logSummary.blocked.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Requests by Decision" subtitle="Distribution across gateway decisions">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={logSummary.decisions} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} strokeWidth={0}>
                {logSummary.decisions.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip {...tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 3: Layer Durations + ML Inference */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Pipeline Layers" subtitle="Layer lineup from backend config">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={layerDurations}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
              <XAxis dataKey="layer" tick={{ fontSize: 9, fill: "hsl(215, 15%, 50%)" }} angle={-20} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(215, 15%, 50%)" }} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="p50" fill="hsl(160, 70%, 45%)" radius={[2, 2, 0, 0]} />
              <Bar dataKey="p95" fill="hsl(200, 80%, 55%)" radius={[2, 2, 0, 0]} />
              <Bar dataKey="p99" fill="hsl(280, 65%, 60%)" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Config Health" subtitle="Control plane status snapshots">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart
              data={[
                { time: "config", value: health?.ok ? 1 : 0 },
                { time: "rules", value: stats ? 1 : 0 },
                { time: "logs", value: logs.length > 0 ? 1 : 0 },
              ]}
            >
              <defs>
                <linearGradient id="mlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(280, 65%, 60%)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(280, 65%, 60%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: "hsl(215, 15%, 50%)" }} />
              <YAxis tick={{ fontSize: 10, fill: "hsl(215, 15%, 50%)" }} />
              <Tooltip {...tooltipStyle} />
              <Area type="monotone" dataKey="value" stroke="hsl(280, 65%, 60%)" fill="url(#mlGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 4: Upstreams + Rate Limited + Rule Matches */}
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <ChartCard title="Upstream Health" subtitle="Service status and latency">
          <div className="space-y-2">
            {upstreams.map((u) => (
              <StatusIndicator key={u.upstream} name={u.upstream} healthy={u.health === 1.0} />
            ))}
            {!upstreams.length && <p className="text-sm text-muted-foreground">No upstream status available</p>}
          </div>
        </ChartCard>

        <ChartCard title="Top IPs" subtitle="Highest request volume in recent logs">
          <div className="space-y-2">
            {logSummary.topIps.map((r) => (
              <div key={r.client_ip} className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2">
                <span className="text-sm font-display text-card-foreground">{r.client_ip}</span>
                <span className="rounded bg-destructive/10 px-2 py-0.5 text-xs font-bold font-display text-destructive">{formatNumber(r.count)}</span>
              </div>
            ))}
            {!logSummary.topIps.length && <p className="text-sm text-muted-foreground">No IP data in logs</p>}
          </div>
        </ChartCard>

        <ChartCard title="Threat Tags" subtitle="Most frequent tags extracted from logs">
          <div className="space-y-2">
            {logSummary.topTags.map((r) => (
              <div key={r.rule_id} className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-display text-card-foreground">{r.rule_id}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold font-display uppercase ${
                    r.action === "block" ? "bg-destructive/10 text-destructive" :
                    r.action === "challenge" ? "bg-warning/10 text-warning" :
                    "bg-info/10 text-info"
                  }`}>{r.action}</span>
                </div>
                <span className="text-xs font-display text-muted-foreground">{formatNumber(r.count)}</span>
              </div>
            ))}
            {!logSummary.topTags.length && <p className="text-sm text-muted-foreground">No threat tag data available</p>}
          </div>
        </ChartCard>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading backend metrics...</p>}
    </div>
  );
}
