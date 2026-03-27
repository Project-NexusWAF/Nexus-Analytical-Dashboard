import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { ApiErrorAlert } from "@/components/ApiErrorAlert";
import { Topbar } from "@/components/Topbar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ConfigSnapshot,
  RulesPayload,
  SynthesizeRulesResponse,
  fetchConfigSnapshot,
  fetchRulesSnapshot,
  synthesizeRules,
} from "@/lib/control-api";

interface GpsFormState {
  lookback_hours: string;
  min_hits: string;
  max_rules: string;
}

function parsePositiveInt(value: string, field: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${field} must be a positive integer.`);
  }
  return parsed;
}

function gpsDefaults(snapshot: ConfigSnapshot | null): GpsFormState {
  return {
    lookback_hours: String(snapshot?.config?.gps?.default_lookback_hours ?? 24),
    min_hits: String(snapshot?.config?.gps?.min_hits ?? 3),
    max_rules: String(snapshot?.config?.gps?.max_rules ?? 8),
  };
}

export default function Rules() {
  const [rules, setRules] = useState<RulesPayload | null>(null);
  const [configSnapshot, setConfigSnapshot] = useState<ConfigSnapshot | null>(null);
  const [gpsForm, setGpsForm] = useState<GpsFormState>(gpsDefaults(null));
  const [gpsResult, setGpsResult] = useState<SynthesizeRulesResponse | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsAction, setGpsAction] = useState<"preview" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const [rulesResult, configResult] = await Promise.all([
          fetchRulesSnapshot(),
          fetchConfigSnapshot(),
        ]);
        if (!mounted) return;
        setRules(rulesResult);
        setConfigSnapshot(configResult);
        setGpsForm(gpsDefaults(configResult));
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load rules");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const content = useMemo(() => rules?.content?.trim() ?? "", [rules]);
  const gpsEnabled = configSnapshot?.config?.gps?.enabled ?? false;

  async function runSynthesis(apply: boolean) {
    try {
      setGpsError(null);
      setGpsAction(apply ? "apply" : "preview");

      const response = await synthesizeRules({
        lookback_hours: parsePositiveInt(gpsForm.lookback_hours, "Lookback hours"),
        min_hits: parsePositiveInt(gpsForm.min_hits, "Minimum malicious hits"),
        max_rules: parsePositiveInt(gpsForm.max_rules, "Maximum synthesized rules"),
        apply,
      });

      setGpsResult(response);
      if (apply) {
        const nextRules = await fetchRulesSnapshot();
        setRules(nextRules);
        toast.success(`Applied GPS candidates as rules version ${response.version}.`);
      } else {
        toast.success(`Generated ${response.candidates.length} GPS candidate rules.`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to run GPS synthesis";
      setGpsError(message);
      toast.error(message);
    } finally {
      setGpsAction(null);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Topbar />
      <div className="p-6">
        {error && <ApiErrorAlert className="mb-6" title="Rules data unavailable" message={error} />}

        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.95fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-display">Current Ruleset</CardTitle>
              <CardDescription>Version and source are derived from the active rules payload.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="font-display">Version:</span>
                <Badge variant="secondary" className="text-[10px] uppercase tracking-[0.15em]">
                  {rules?.version || "unknown"}
                </Badge>
                <span className="font-display">Source:</span>
                <Badge variant="secondary" className="text-[10px] uppercase tracking-[0.15em]">
                  {rules?.source || "unknown"}
                </Badge>
                {!rules?.found && <span className="text-destructive">No active rules found.</span>}
              </div>

              {content ? (
                <pre className="max-h-[640px] overflow-auto rounded-md border border-border bg-secondary/40 p-4 text-xs text-foreground">
                  {content}
                </pre>
              ) : (
                <p className="text-sm text-muted-foreground">No rules content available.</p>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-col gap-6">
            <Card id="gps">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg font-display">
                  <Sparkles />
                  GPS Rule Synthesis
                </CardTitle>
                <CardDescription>
                  Mine recent attack logs, validate candidates against benign traffic, and preview or apply new rules.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <Badge variant={gpsEnabled ? "default" : "outline"} className="uppercase tracking-[0.15em]">
                    {gpsEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                  <span>Default lookback: {configSnapshot?.config?.gps?.default_lookback_hours ?? "n/a"}h</span>
                  <span>Min hits: {configSnapshot?.config?.gps?.min_hits ?? "n/a"}</span>
                  <span>Max rules: {configSnapshot?.config?.gps?.max_rules ?? "n/a"}</span>
                </div>

                {!gpsEnabled && (
                  <Alert>
                    <Sparkles />
                    <AlertTitle>GPS is disabled in config</AlertTitle>
                    <AlertDescription>
                      The dashboard can still show defaults, but synthesis actions are disabled until the control-plane config enables GPS.
                    </AlertDescription>
                  </Alert>
                )}

                {gpsError && (
                  <ApiErrorAlert title="GPS synthesis failed" message={gpsError} />
                )}

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="flex flex-col gap-2">
                    <label htmlFor="gps-lookback" className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                      Lookback Hours
                    </label>
                    <Input
                      id="gps-lookback"
                      value={gpsForm.lookback_hours}
                      inputMode="numeric"
                      onChange={(event) =>
                        setGpsForm((current) => ({ ...current, lookback_hours: event.target.value }))
                      }
                      disabled={gpsAction !== null || !gpsEnabled}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label htmlFor="gps-min-hits" className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                      Minimum Hits
                    </label>
                    <Input
                      id="gps-min-hits"
                      value={gpsForm.min_hits}
                      inputMode="numeric"
                      onChange={(event) =>
                        setGpsForm((current) => ({ ...current, min_hits: event.target.value }))
                      }
                      disabled={gpsAction !== null || !gpsEnabled}
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label htmlFor="gps-max-rules" className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                      Maximum Rules
                    </label>
                    <Input
                      id="gps-max-rules"
                      value={gpsForm.max_rules}
                      inputMode="numeric"
                      onChange={(event) =>
                        setGpsForm((current) => ({ ...current, max_rules: event.target.value }))
                      }
                      disabled={gpsAction !== null || !gpsEnabled}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={gpsAction !== null || !gpsEnabled}
                    onClick={() => void runSynthesis(false)}
                  >
                    {gpsAction === "preview" ? "Generating Preview..." : "Preview Candidates"}
                  </Button>
                  <Button
                    type="button"
                    disabled={gpsAction !== null || !gpsEnabled}
                    onClick={() => void runSynthesis(true)}
                  >
                    {gpsAction === "apply" ? "Applying Rules..." : "Generate & Apply"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-display">GPS Preview</CardTitle>
                <CardDescription>
                  Candidate rules are shown before application so you can inspect what the synthesizer mined from recent traffic.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {gpsResult ? (
                  <>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="font-display">Synthesized version:</span>
                      <Badge variant="secondary" className="text-[10px] uppercase tracking-[0.15em]">
                        {gpsResult.version}
                      </Badge>
                      <Badge variant={gpsResult.applied ? "default" : "outline"} className="text-[10px] uppercase tracking-[0.15em]">
                        {gpsResult.applied ? "Applied" : "Preview Only"}
                      </Badge>
                      <span>{gpsResult.candidates.length} candidates</span>
                    </div>

                    {gpsResult.candidates.length > 0 ? (
                      <div className="rounded-md border border-border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Rule</TableHead>
                              <TableHead>Kind</TableHead>
                              <TableHead>Signal</TableHead>
                              <TableHead>Malicious Hits</TableHead>
                              <TableHead>Benign Hits</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {gpsResult.candidates.map((candidate) => (
                              <TableRow key={candidate.id}>
                                <TableCell className="font-display text-xs">{candidate.name}</TableCell>
                                <TableCell className="text-xs uppercase text-muted-foreground">{candidate.kind}</TableCell>
                                <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">{candidate.signal}</TableCell>
                                <TableCell className="text-xs">{candidate.malicious_hits}</TableCell>
                                <TableCell className="text-xs">{candidate.benign_hits}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No candidate rules passed validation for the selected window.
                      </p>
                    )}

                    <pre className="max-h-[360px] overflow-auto rounded-md border border-border bg-secondary/40 p-4 text-xs text-foreground">
                      {gpsResult.content.trim()}
                    </pre>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Run a preview to inspect synthesized candidates and the generated rules payload.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {loading && <p className="mt-4 text-sm text-muted-foreground">Loading rules and GPS controls...</p>}
      </div>
    </div>
  );
}
