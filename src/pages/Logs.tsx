import { useEffect, useMemo, useState } from "react";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AttackLogEntry,
  ConfigLogEntry,
  RuleVersion,
  fetchConfigLogs,
  fetchRecentLogs,
  fetchRuleVersions,
} from "@/lib/control-api";

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

function formatRisk(score: number) {
  if (!Number.isFinite(score)) return "n/a";
  const clamped = Math.max(0, Math.min(1, score));
  const percent = (clamped * 100).toFixed(0);
  return `${clamped.toFixed(2)} (${percent}%)`;
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

export default function Logs() {
  const [attackLogs, setAttackLogs] = useState<AttackLogEntry[]>([]);
  const [ruleVersions, setRuleVersions] = useState<RuleVersion[]>([]);
  const [configLogs, setConfigLogs] = useState<ConfigLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const [attack, rules, configs] = await Promise.all([
          fetchRecentLogs(200),
          fetchRuleVersions(),
          fetchConfigLogs(),
        ]);
        if (!mounted) return;
        setAttackLogs(attack);
        setRuleVersions(rules);
        setConfigLogs(configs);
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

  return (
    <div className="min-h-screen bg-background">
      <Topbar />
      <div className="p-6">
        {error && (
          <div className="mb-6 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            Failed to load log data: {error}
          </div>
        )}

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
                        <TableHead>Risk</TableHead>
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
                          <TableCell className="text-xs">{formatRisk(log.risk_score)}</TableCell>
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
        </Tabs>

        {loading && <p className="mt-4 text-sm text-muted-foreground">Loading log streams...</p>}
      </div>
    </div>
  );
}
