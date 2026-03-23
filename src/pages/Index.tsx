import { useState, useEffect } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
} from "recharts";
import { Activity, Shield, Zap, Globe, Brain, AlertTriangle } from "lucide-react";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { ChartCard } from "@/components/dashboard/ChartCard";
import { StatusIndicator } from "@/components/dashboard/StatusIndicator";
import {
  getSummaryStats, getRequestDurationTimeSeries, getBlockedRequests,
  getLayerDurations, getMlInferenceDuration, getActiveConnections,
  getUpstreamHealth, getRateLimitedTop, getRuleMatches, getRequestsTotal,
} from "@/lib/mock-metrics";

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

export default function Index() {
  const [stats, setStats] = useState(getSummaryStats());
  const [durationTS, setDurationTS] = useState(getRequestDurationTimeSeries());
  const [blocked, setBlocked] = useState(getBlockedRequests());
  const [layers, setLayers] = useState(getLayerDurations());
  const [mlDuration, setMlDuration] = useState(getMlInferenceDuration());
  const [connections, setConnections] = useState(getActiveConnections());
  const [upstreams, setUpstreams] = useState(getUpstreamHealth());
  const [rateLimited, setRateLimited] = useState(getRateLimitedTop());
  const [rules, setRules] = useState(getRuleMatches());
  const [requestsByStatus, setRequestsByStatus] = useState<{ status: string; count: number }[]>([]);

  useEffect(() => {
    const reqs = getRequestsTotal();
    const statusMap: Record<string, number> = {};
    reqs.forEach((r) => { statusMap[r.status] = (statusMap[r.status] || 0) + r.count; });
    setRequestsByStatus(Object.entries(statusMap).map(([status, count]) => ({ status, count })));
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setStats(getSummaryStats());
      setDurationTS(getRequestDurationTimeSeries());
      setConnections(getActiveConnections());
      setMlDuration(getMlInferenceDuration());
    }, 5000);
    return () => clearInterval(interval);
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

      {/* Summary Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <MetricCard title="Total Requests" value={formatNumber(stats.totalRequests)} icon={<Activity className="h-4 w-4" />} trend="up" trendValue="12.3%" variant="success" />
        <MetricCard title="Avg Latency" value={`${stats.avgLatency}ms`} icon={<Zap className="h-4 w-4" />} trend="down" trendValue="5.1%" variant="success" />
        <MetricCard title="Blocked" value={`${stats.blockedPercent}%`} icon={<Shield className="h-4 w-4" />} trend="neutral" trendValue="0.2%" />
        <MetricCard title="Connections" value={formatNumber(stats.activeConnections)} icon={<Globe className="h-4 w-4" />} trend="up" trendValue="8.7%" />
        <MetricCard title="ML Detections" value={formatNumber(stats.mlDetections)} icon={<Brain className="h-4 w-4" />} trend="up" trendValue="3.2%" variant="warning" />
        <MetricCard title="Upstreams" value={`${stats.healthyUpstreams}/${stats.totalUpstreams}`} subtitle="healthy" icon={<AlertTriangle className="h-4 w-4" />} variant={stats.healthyUpstreams < stats.totalUpstreams ? "danger" : "success"} />
      </div>

      {/* Row 1: Duration + Active Connections */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Request Duration" subtitle="End-to-end latency (ms) — last 30 min">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={durationTS}>
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

        <ChartCard title="Active Connections" subtitle="Open client connections — last 30 min">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={connections}>
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
        <ChartCard title="Blocked Requests" subtitle="By reason">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={blocked} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 14%, 18%)" />
              <XAxis type="number" tick={{ fontSize: 10, fill: "hsl(215, 15%, 50%)" }} />
              <YAxis dataKey="reason" type="category" tick={{ fontSize: 10, fill: "hsl(215, 15%, 50%)" }} width={100} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {blocked.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Requests by Status" subtitle="Distribution across HTTP status codes">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={requestsByStatus} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={2} strokeWidth={0}>
                {requestsByStatus.map((_, i) => (
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
        <ChartCard title="Layer Processing Time" subtitle="Per-layer latency percentiles (µs)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={layers}>
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

        <ChartCard title="ML Inference Duration" subtitle="gRPC call latency (ms) — last 30 min">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={mlDuration}>
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
              <StatusIndicator key={u.upstream} name={u.upstream} healthy={u.health === 1.0} latency={u.latency} />
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Top Rate-Limited IPs" subtitle="Requests blocked by rate limiter">
          <div className="space-y-2">
            {rateLimited.map((r) => (
              <div key={r.client_ip} className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2">
                <span className="text-sm font-display text-card-foreground">{r.client_ip}</span>
                <span className="rounded bg-destructive/10 px-2 py-0.5 text-xs font-bold font-display text-destructive">{formatNumber(r.count)}</span>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Rule Matches" subtitle="WAF rule hits by rule ID and action">
          <div className="space-y-2">
            {rules.map((r) => (
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
          </div>
        </ChartCard>
      </div>
    </div>
  );
}
