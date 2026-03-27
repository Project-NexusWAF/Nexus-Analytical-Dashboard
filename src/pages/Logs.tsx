import { useEffect, useMemo, useState } from "react";
import { BellRing, Send } from "lucide-react";
import { ApiErrorAlert } from "@/components/ApiErrorAlert";
import { Topbar } from "@/components/Topbar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AttackLogEntry,
  ConfigLogEntry,
  ConfigSnapshot,
  RuleVersion,
  SlackSeverity,
  fetchConfigLogs,
  fetchConfigSnapshot,
  fetchRecentLogs,
  fetchRuleVersions,
} from "@/lib/control-api";

interface AlertFeedItem {
  id: string;
  timestamp: string;
  severity: SlackSeverity;
  type: "request" | "system";
  source: string;
  title: string;
  details: string;
  sendable: boolean;
}

const severityOrder: Record<SlackSeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function isRateLimitDecision(decision: string): boolean {
  const normalized = decision.replace(/[\s_-]/g, "").toLowerCase();
  return normalized === "ratelimit";
}

function decisionVariant(decision: string) {
  const lowered = decision.toLowerCase();
  if (lowered.includes("block")) return "destructive" as const;
  if (lowered.includes("rate")) return "secondary" as const;
  if (lowered.includes("challenge")) return "secondary" as const;
  return "default" as const;
}

function statusVariant(status: string) {
  const lowered = status.toLowerCase();
  if (lowered === "error") return "destructive" as const;
  if (lowered === "applied") return "default" as const;
  return "secondary" as const;
}

function severityVariant(severity: SlackSeverity) {
  if (severity === "critical" || severity === "high") return "destructive" as const;
  if (severity === "medium") return "default" as const;
  return "outline" as const;
}

function classifyRequestSeverity(log: AttackLogEntry): SlackSeverity {
  if (log.block_code === "CommandInjection" || log.block_code === "SqlInjection") {
    return "critical";
  }
  if (
    log.block_code === "CrossSiteScripting" ||
    log.block_code === "PathTraversal" ||
    log.block_code === "MlDetectedThreat"
  ) {
    return "high";
  }
  if (
    isRateLimitDecision(log.decision) ||
    (log.threat_tags || []).some((tag) => tag.toLowerCase() === "anomaly")
  ) {
    return "medium";
  }
  return "low";
}

function classifySystemSeverity(entry: ConfigLogEntry): SlackSeverity {
  return entry.status.toLowerCase() === "error" ? "high" : "low";
}

function wouldSlackSend(
  severity: SlackSeverity,
  configSnapshot: ConfigSnapshot | null,
  options: { isRateLimit?: boolean } = {},
) {
  const slack = configSnapshot?.config?.slack;
  if (!slack?.enabled) {
    return false;
  }
  if (options.isRateLimit && !slack.include_rate_limits) {
    return false;
  }
  return severityOrder[severity] >= severityOrder[slack.min_severity];
}

export default function Logs() {
  const [attackLogs, setAttackLogs] = useState<AttackLogEntry[]>([]);
  const [ruleVersions, setRuleVersions] = useState<RuleVersion[]>([]);
  const [configLogs, setConfigLogs] = useState<ConfigLogEntry[]>([]);
  const [configSnapshot, setConfigSnapshot] = useState<ConfigSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const [attack, rules, configs, config] = await Promise.all([
          fetchRecentLogs(200),
          fetchRuleVersions(),
          fetchConfigLogs(),
          fetchConfigSnapshot(),
        ]);
        if (!mounted) return;
        setAttackLogs(attack);
        setRuleVersions(rules);
        setConfigLogs(configs);
        setConfigSnapshot(config);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load logs");
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

  const sortedConfigLogs = useMemo(
    () => [...configLogs].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [configLogs],
  );

  const sortedRules = useMemo(
    () => [...ruleVersions].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [ruleVersions],
  );

  const alertFeed = useMemo(() => {
    const requestAlerts: AlertFeedItem[] = attackLogs.map((log) => {
      const severity = classifyRequestSeverity(log);
      const blockedBy = log.blocked_by || log.block_code || "gateway";
      const tags = log.threat_tags.length ? `Tags: ${log.threat_tags.join(", ")}` : "No tags";
      return {
        id: log.id,
        timestamp: log.timestamp,
        severity,
        type: "request",
        source: blockedBy,
        title: `${log.decision} ${log.method} ${log.uri}`,
        details: `${log.client_ip} · ${tags}`,
        sendable: wouldSlackSend(severity, configSnapshot, {
          isRateLimit: isRateLimitDecision(log.decision),
        }),
      };
    });

    const systemAlerts: AlertFeedItem[] = sortedConfigLogs.map((entry, index) => {
      const severity = classifySystemSeverity(entry);
      return {
        id: `${entry.timestamp}-${index}`,
        timestamp: entry.timestamp,
        severity,
        type: "system",
        source: "config_reload",
        title: entry.status.toLowerCase() === "error" ? "Config Reload Failed" : "Config Reload Applied",
        details: entry.message,
        sendable: wouldSlackSend(severity, configSnapshot),
      };
    });

    return [...requestAlerts, ...systemAlerts].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [attackLogs, configSnapshot, sortedConfigLogs]);

  const sendableAlertCount = useMemo(
    () => alertFeed.filter((item) => item.sendable).length,
    [alertFeed],
  );

  const highestSeverity = useMemo(() => {
    if (alertFeed.some((item) => item.severity === "critical")) return "critical";
    if (alertFeed.some((item) => item.severity === "high")) return "high";
    if (alertFeed.some((item) => item.severity === "medium")) return "medium";
    return "low";
  }, [alertFeed]);

  const slackConfig = configSnapshot?.config?.slack;

  return (
    <div className="min-h-screen bg-background">
      <Topbar />
      <div className="p-6">
        {error && <ApiErrorAlert className="mb-6" title="Log streams unavailable" message={error} />}

        <Tabs defaultValue="attack">
          <TabsList className="bg-secondary/60">
            <TabsTrigger value="attack" className="text-xs uppercase tracking-[0.2em]">
              Attack Logs
            </TabsTrigger>
            <TabsTrigger value="rules" className="text-xs uppercase tracking-[0.2em]">
              Rules Logs
            </TabsTrigger>
            <TabsTrigger value="config" className="text-xs uppercase tracking-[0.2em]">
              Config Logs
            </TabsTrigger>
            <TabsTrigger value="alerts" className="text-xs uppercase tracking-[0.2em]">
              Alerts
            </TabsTrigger>
          </TabsList>

          <TabsContent value="attack">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-display">Attack Logs</CardTitle>
                <CardDescription>Latest gateway decisions from the attack log stream.</CardDescription>
              </CardHeader>
              <CardContent>
                {attackLogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No attack logs available.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Client IP</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>URI</TableHead>
                        <TableHead>Decision</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {attackLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-display text-xs">{formatTimestamp(log.timestamp)}</TableCell>
                          <TableCell className="font-display text-xs">{log.client_ip}</TableCell>
                          <TableCell className="font-display text-xs">{log.method}</TableCell>
                          <TableCell className="max-w-[240px] truncate text-xs text-muted-foreground">{log.uri}</TableCell>
                          <TableCell>
                            <Badge variant={decisionVariant(log.decision)} className="text-[10px] uppercase tracking-[0.15em]">
                              {log.decision}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="rules">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-display">Rule Version History</CardTitle>
                <CardDescription>Stored revisions of the active rule set.</CardDescription>
              </CardHeader>
              <CardContent>
                {sortedRules.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No rule versions available.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Version</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedRules.map((rule) => (
                        <TableRow key={rule.id}>
                          <TableCell className="font-display text-xs">{rule.version}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{formatTimestamp(rule.created_at)}</TableCell>
                          <TableCell>
                            <Badge variant={rule.active ? "default" : "secondary"} className="text-[10px] uppercase tracking-[0.15em]">
                              {rule.active ? "Active" : "Archived"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="config">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-display">Config Reloads</CardTitle>
                <CardDescription>Audit trail of config watcher reloads.</CardDescription>
              </CardHeader>
              <CardContent>
                {sortedConfigLogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No config log entries available.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Message</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedConfigLogs.map((entry, index) => (
                        <TableRow key={`${entry.timestamp}-${index}`}>
                          <TableCell className="font-display text-xs">{formatTimestamp(entry.timestamp)}</TableCell>
                          <TableCell className="text-xs">{entry.version}</TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(entry.status)} className="text-[10px] uppercase tracking-[0.15em]">
                              {entry.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-[360px] truncate text-xs text-muted-foreground">{entry.message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="alerts">
            <div className="flex flex-col gap-6">
              <div className="grid gap-4 lg:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg font-display">
                      <BellRing />
                      Slack Alerting
                    </CardTitle>
                    <CardDescription>Current alert transport settings from the active config snapshot.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={slackConfig?.enabled ? "default" : "outline"} className="uppercase tracking-[0.15em]">
                        {slackConfig?.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                      <Badge variant={slackConfig?.webhook_url ? "secondary" : "outline"} className="uppercase tracking-[0.15em]">
                        {slackConfig?.webhook_url ? "Webhook Configured" : "Webhook Missing"}
                      </Badge>
                    </div>
                    <p>Channel: {slackConfig?.channel || "default webhook channel"}</p>
                    <p>Username: {slackConfig?.username || "NexusWAF"}</p>
                    <p>Icon: {slackConfig?.icon_emoji || ":shield:"}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg font-display">
                      <Send />
                      Delivery Policy
                    </CardTitle>
                    <CardDescription>How the current Slack policy filters recent request and system events.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={severityVariant(slackConfig?.min_severity || "medium")} className="uppercase tracking-[0.15em]">
                        Min severity: {slackConfig?.min_severity || "medium"}
                      </Badge>
                      <Badge variant={slackConfig?.include_rate_limits ? "secondary" : "outline"} className="uppercase tracking-[0.15em]">
                        {slackConfig?.include_rate_limits ? "Rate Limits Included" : "Rate Limits Ignored"}
                      </Badge>
                    </div>
                    <p>Recent alert candidates: {alertFeed.length}</p>
                    <p>Would send right now: {sendableAlertCount}</p>
                    <p>TLS listener: {configSnapshot?.config?.gateway?.tls?.enabled ? "HTTPS enabled" : "HTTP only"}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg font-display">Recent Signal</CardTitle>
                    <CardDescription>A quick read on what the alerting pipeline is seeing in the current dashboard window.</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={severityVariant(highestSeverity)} className="uppercase tracking-[0.15em]">
                        Highest severity: {highestSeverity}
                      </Badge>
                      <Badge variant={sendableAlertCount > 0 ? "default" : "outline"} className="uppercase tracking-[0.15em]">
                        {sendableAlertCount > 0 ? "Active Alert Flow" : "Quiet Window"}
                      </Badge>
                    </div>
                    <p>Attack log events: {attackLogs.length}</p>
                    <p>System reload events: {sortedConfigLogs.length}</p>
                    <p>Sendable share: {alertFeed.length > 0 ? `${Math.round((sendableAlertCount / alertFeed.length) * 100)}%` : "0%"}</p>
                  </CardContent>
                </Card>
              </div>

              <Alert>
                <BellRing />
                <AlertTitle>Derived alert stream</AlertTitle>
                <AlertDescription>
                  This feed shows what the current Slack policy would send based on recent attack logs and config reload events. Delivery receipts are not persisted by the backend yet.
                </AlertDescription>
              </Alert>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-display">Recent Alert Candidates</CardTitle>
                  <CardDescription>Request and system events ranked by the same severity model the Slack notifier uses.</CardDescription>
                </CardHeader>
                <CardContent>
                  {alertFeed.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No alert candidates available in the current lookback window.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>Severity</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Would Send</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead>Summary</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {alertFeed.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-display text-xs">{formatTimestamp(item.timestamp)}</TableCell>
                            <TableCell>
                              <Badge variant={severityVariant(item.severity)} className="text-[10px] uppercase tracking-[0.15em]">
                                {item.severity}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px] uppercase tracking-[0.15em]">
                                {item.type}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant={item.sendable ? "default" : "outline"} className="text-[10px] uppercase tracking-[0.15em]">
                                {item.sendable ? "Yes" : "No"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{item.source}</TableCell>
                            <TableCell className="max-w-[440px]">
                              <div className="flex flex-col gap-1">
                                <span className="text-xs font-medium text-foreground">{item.title}</span>
                                <span className="truncate text-xs text-muted-foreground">{item.details}</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {loading && <p className="mt-4 text-sm text-muted-foreground">Loading log streams...</p>}
      </div>
    </div>
  );
}
