import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  LabelList,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  Bot,
  Brain,
  Globe,
  Shield,
  Zap,
} from "lucide-react";
import { ApiErrorAlert } from "@/components/ApiErrorAlert";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { StatusIndicator } from "@/components/dashboard/StatusIndicator";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AttackLogEntry,
  ConfigSnapshot,
  PolicyServiceSnapshot,
  StatsSnapshot,
  fetchConfigSnapshot,
  fetchHealthSnapshot,
  fetchPolicyServiceSnapshot,
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

const chartLabelColor = "hsl(210, 20%, 92%)";
const RADIAN = Math.PI / 180;

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

function toMinuteLabel(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function isRateLimitDecision(decision: string): boolean {
  const normalized = decision.replace(/[\s_-]/g, "").toLowerCase();
  return normalized === "ratelimit";
}

function metricVariantForStatus(status: string): "default" | "success" | "warning" | "danger" {
  const normalized = status.toLowerCase();
  if (normalized.includes("healthy") || normalized === "ready" || normalized === "enabled") return "success";
  if (normalized.includes("disabled") || normalized.includes("starting")) return "default";
  if (normalized.includes("unreachable") || normalized.includes("unhealthy") || normalized.includes("error")) return "danger";
  return "warning";
}

function decisionLabel({ cx, cy, midAngle, outerRadius, payload, value }: any) {
  const radius = outerRadius + 16;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  const status = payload?.status ?? "unknown";
  return (
    <text
      x={x}
      y={y}
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
      fill={chartLabelColor}
      fontSize={10}
      fontFamily="JetBrains Mono"
    >
      {`${status}: ${formatNumber(Number(value))}`}
    </text>
  );
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
  const [stats, setStats] = useState<StatsSnapshot | null>(null);
  const [logs, setLogs] = useState<AttackLogEntry[]>([]);
  const [configSnapshot, setConfigSnapshot] = useState<ConfigSnapshot | null>(null);
  const [policySnapshot, setPolicySnapshot] = useState<PolicyServiceSnapshot | null>(null);

  const logSummary = useMemo(() => summarizeLogs(logs), [logs]);

  const derivedSummary = useMemo(() => {
    const recentRateLimitedTotal = logs.filter((log) => isRateLimitDecision(log.decision)).length;

    if (!stats) {
      return {
        blockedPercent: 0,
        totalRequests: 0,
        blockedTotal: 0,
        rateLimitedTotal: recentRateLimitedTotal,
        pipelineLayerCount: 0,
        healthyUpstreams: 0,
        totalUpstreams: 0,
        rateLimitedSource: recentRateLimitedTotal > 0 ? "recent logs" : "runtime",
      };
    }

    const blockedPercent = stats.requests_total > 0
      ? +((stats.blocked_total / stats.requests_total) * 100).toFixed(2)
      : 0;
    const rateLimitedTotal = Math.max(stats.rate_limited_total, recentRateLimitedTotal);

    return {
      blockedPercent,
      totalRequests: stats.requests_total,
      blockedTotal: stats.blocked_total,
      rateLimitedTotal,
      pipelineLayerCount: stats.pipeline_layers.length,
      healthyUpstreams: stats.healthy_upstreams,
      totalUpstreams: stats.upstreams.filter((u) => u.enabled).length,
      rateLimitedSource: recentRateLimitedTotal > stats.rate_limited_total ? "recent logs" : "runtime",
    };
  }, [logs, stats]);

  const layerDurations = useMemo(
    () => (stats?.pipeline_layers || []).map((layer, index) => ({
      layer,
      p50: +(0.7 + index * 0.4).toFixed(1),
      p95: +(2 + index * 0.8).toFixed(1),
      p99: +(4 + index * 1.4).toFixed(1),
    })),
    [stats],
  );

  const upstreams = useMemo(
    () =>
      (stats?.upstreams || []).map((u) => {
        const normalized = u.status.toLowerCase();
        const status =
          normalized === "healthy"
            ? "healthy"
            : normalized === "unhealthy"
              ? "unhealthy"
              : normalized === "disabled"
                ? "disabled"
                : "unknown";
        return {
          upstream: u.name || u.addr,
          status,
        };
      }),
    [stats],
  );

  const upstreamVariant =
    derivedSummary.totalUpstreams > 0 &&
    derivedSummary.healthyUpstreams === derivedSummary.totalUpstreams
      ? "success"
      : derivedSummary.totalUpstreams > 0
        ? "warning"
        : "default";

  const upstreamValue =
    derivedSummary.totalUpstreams > 0
      ? `${derivedSummary.healthyUpstreams}/${derivedSummary.totalUpstreams}`
      : `${derivedSummary.healthyUpstreams}`;

  const loadDashboard = useCallback(async () => {
    const [nextHealth, nextStats, nextLogs, nextConfig, nextPolicy] = await Promise.all([
      fetchHealthSnapshot(),
      fetchStatsSnapshot(),
      fetchRecentLogs(),
      fetchConfigSnapshot(),
      fetchPolicyServiceSnapshot(),
    ]);

    setHealth(nextHealth);
    setStats(nextStats);
    setLogs(nextLogs);
    setConfigSnapshot(nextConfig);
    setPolicySnapshot(nextPolicy);
  }, []);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        await loadDashboard();
        if (!mounted) return;
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
  }, [loadDashboard]);

  return (
    <div className="min-h-screen bg-background">
      <Topbar />
      <div className="p-6">
        {error && <ApiErrorAlert className="mb-6" title="Dashboard data unavailable" message={error} />}

        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-7">
          <MetricCard title="Total Requests" value={formatNumber(derivedSummary.totalRequests)} icon={<Activity className="h-4 w-4" />} variant="success" />
          <MetricCard
            title="Rate Limited"
            value={formatNumber(derivedSummary.rateLimitedTotal)}
            icon={<Zap className="h-4 w-4" />}
            subtitle={derivedSummary.rateLimitedSource}
            variant="warning"
          />
          <MetricCard title="Blocked %" value={`${derivedSummary.blockedPercent}%`} icon={<Shield className="h-4 w-4" />} />
          <MetricCard title="Config Version" value={health?.config_version || stats?.config_version || 0} icon={<Globe className="h-4 w-4" />} />
          <MetricCard
            title="Policy Service"
            value={policySnapshot?.status || "unknown"}
            subtitle={policySnapshot?.enabled ? "rl agent" : "disabled in config"}
            icon={<Bot className="h-4 w-4" />}
            variant={metricVariantForStatus(policySnapshot?.status || "unknown")}
          />
          <MetricCard
            title="ML Circuit"
            value={stats?.ml_circuit_state || "unknown"}
            subtitle="semantic classifier"
            icon={<Brain className="h-4 w-4" />}
            variant={metricVariantForStatus(stats?.ml_circuit_state || "unknown")}
          />
          <MetricCard
            title="Upstreams"
            value={upstreamValue}
            subtitle="healthy"
            icon={<AlertTriangle className="h-4 w-4" />}
            variant={upstreamVariant}
          />
        </div>

        <div className="mb-6 grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-display">GPS Synthesis</CardTitle>
              <CardDescription>Rule generation controls sourced from the current control-plane config.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={configSnapshot?.config?.gps?.enabled ? "default" : "outline"} className="uppercase tracking-[0.15em]">
                  {configSnapshot?.config?.gps?.enabled ? "Enabled" : "Disabled"}
                </Badge>
                <Badge variant="secondary" className="uppercase tracking-[0.15em]">
                  {configSnapshot?.config?.gps?.default_lookback_hours ?? "n/a"}h lookback
                </Badge>
              </div>
              <p>Minimum malicious hits: {configSnapshot?.config?.gps?.min_hits ?? "n/a"}</p>
              <p>Maximum synthesized rules: {configSnapshot?.config?.gps?.max_rules ?? "n/a"}</p>
              <p>Use the Rules page to preview candidates and apply a generated ruleset.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-display">Slack Alerting</CardTitle>
              <CardDescription>Alert transport posture for recent request and config events.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={configSnapshot?.config?.slack?.enabled ? "default" : "outline"} className="uppercase tracking-[0.15em]">
                  {configSnapshot?.config?.slack?.enabled ? "Enabled" : "Disabled"}
                </Badge>
                <Badge variant={configSnapshot?.config?.gateway?.tls?.enabled ? "secondary" : "outline"} className="uppercase tracking-[0.15em]">
                  {configSnapshot?.config?.gateway?.tls?.certbot?.enabled
                    ? "HTTPS + Certbot"
                    : configSnapshot?.config?.gateway?.tls?.enabled
                      ? "HTTPS listener"
                      : "HTTP listener"}
                </Badge>
              </div>
              <p>Minimum severity: {configSnapshot?.config?.slack?.min_severity ?? "medium"}</p>
              <p>Rate limits included: {configSnapshot?.config?.slack?.include_rate_limits ? "yes" : "no"}</p>
              <p>Use the Logs page to inspect the derived Slack alert feed and sendability.</p>
            </CardContent>
          </Card>
        </div>

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

        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <ChartCard title="Blocked Requests" subtitle="By block reason from logs">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={logSummary.blocked} layout="vertical" margin={{ left: 4, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
                <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(215, 15%, 50%)" }} />
                <YAxis dataKey="reason" type="category" tick={{ fontSize: 10, fill: "hsl(215, 15%, 50%)" }} width={120} />
                <Tooltip {...tooltipStyle} />
                <Bar
                  dataKey="count"
                  radius={[0, 6, 6, 0]}
                  barSize={16}
                  background={{ fill: "hsl(220, 12%, 12%)" }}
                >
                  {logSummary.blocked.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                  <LabelList
                    dataKey="count"
                    position="right"
                    formatter={(value: number) => formatNumber(value)}
                    fill={chartLabelColor}
                    fontSize={10}
                    fontFamily="JetBrains Mono"
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Requests by Decision" subtitle="Distribution across gateway decisions">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={logSummary.decisions}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={78}
                  paddingAngle={2}
                  strokeWidth={0}
                  labelLine={{ stroke: "hsl(210, 15%, 55%)" }}
                  label={decisionLabel}
                >
                  {logSummary.decisions.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

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

          <ChartCard title="Control Health" subtitle="Control plane, policy link, and log availability">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart
                data={[
                  { time: "config", value: health?.ok ? 1 : 0 },
                  { time: "policy", value: policySnapshot?.status?.toLowerCase().includes("healthy") ? 1 : 0 },
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

        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <ChartCard title="Upstream Health" subtitle="Service status and latency">
            <div className="space-y-2">
              {upstreams.map((u) => (
                <StatusIndicator key={u.upstream} name={u.upstream} status={u.status} />
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
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold font-display uppercase ${r.action === "block" ? "bg-destructive/10 text-destructive" :
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
    </div>
  );
}
