import { useCallback, useEffect, useState } from "react";
import { Bot, PlayCircle } from "lucide-react";
import { ApiErrorAlert } from "@/components/ApiErrorAlert";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ManualTrainResponse,
  PolicyFeedbackEntry,
  PolicyServiceSnapshot,
  fetchPolicyFeedbackEvents,
  fetchPolicyServiceSnapshot,
  triggerManualPolicyTrain,
} from "@/lib/control-api";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

function formatLoss(value: number): string {
  return Number.isFinite(value) && value > 0 ? value.toFixed(4) : "0.0000";
}

function formatUnixTime(unixTimeMs: number): string {
  return new Date(unixTimeMs).toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function policyEventToJsonLine(event: PolicyFeedbackEntry): string {
  return JSON.stringify({
    request_id: event.request_id,
    unix_time_ms: event.unix_time_ms,
    policy_action_name: event.policy_action_name,
    final_decision: event.final_decision,
    decided_by: event.decided_by,
    reward: event.reward,
    method: event.method,
    uri: event.uri,
    block_code: event.block_code,
    rate_limited: event.rate_limited,
  });
}

export default function Policy() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [policySnapshot, setPolicySnapshot] = useState<PolicyServiceSnapshot | null>(null);
  const [policyEvents, setPolicyEvents] = useState<PolicyFeedbackEntry[]>([]);
  const [trainGradientUpdates, setTrainGradientUpdates] = useState("25");
  const [trainReplayLimit, setTrainReplayLimit] = useState("500");
  const [trainBusy, setTrainBusy] = useState(false);
  const [trainResult, setTrainResult] = useState<ManualTrainResponse | null>(null);
  const [trainError, setTrainError] = useState<string | null>(null);

  const loadPolicy = useCallback(async () => {
    const [snapshot, events] = await Promise.all([
      fetchPolicyServiceSnapshot(),
      fetchPolicyFeedbackEvents(18),
    ]);

    setPolicySnapshot(snapshot);
    setPolicyEvents(events);
  }, []);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        await loadPolicy();
        if (!mounted) return;
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load policy operations");
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
  }, [loadPolicy]);

  const handleManualTrain = async () => {
    try {
      setTrainBusy(true);
      setTrainError(null);
      const result = await triggerManualPolicyTrain({
        gradient_updates: Number(trainGradientUpdates) || 25,
        replay_from_log_limit: Number(trainReplayLimit) || 500,
      });
      setTrainResult(result);
      await loadPolicy();
    } catch (err) {
      setTrainError(err instanceof Error ? err.message : "Manual training failed");
    } finally {
      setTrainBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Topbar />
      <div className="p-6">
        {error && <ApiErrorAlert className="mb-6" title="Policy operations unavailable" message={error} />}

        <div className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-5 py-4">
          <div>
            <p className="text-xs font-display uppercase tracking-[0.28em] text-muted-foreground">Policy</p>
            <h1 className="mt-1 text-2xl font-display text-card-foreground">RL Agent Operations</h1>
            <p className="mt-1 text-sm text-muted-foreground">Inspect live policy feedback and kick off manual replay updates without leaving the control plane.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={policySnapshot?.enabled ? "default" : "outline"} className="uppercase tracking-[0.15em]">
              {policySnapshot?.enabled ? policySnapshot?.status || "enabled" : "Disabled"}
            </Badge>
            <Badge variant={policySnapshot?.online_training_enabled ? "secondary" : "outline"} className="uppercase tracking-[0.15em]">
              {policySnapshot?.online_training_enabled ? "Online train" : "Manual train"}
            </Badge>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-display">RL Policy Service</CardTitle>
              <CardDescription>Live gRPC status from the policy agent that decides allow, block, or deeper analysis.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={policySnapshot?.enabled ? "default" : "outline"} className="uppercase tracking-[0.15em]">
                  {policySnapshot?.enabled ? policySnapshot?.status || "enabled" : "Disabled"}
                </Badge>
                <Badge variant={policySnapshot?.online_training_enabled ? "secondary" : "outline"} className="uppercase tracking-[0.15em]">
                  {policySnapshot?.online_training_enabled ? "Online train" : "Manual train"}
                </Badge>
              </div>
              <p className="flex items-center gap-2 text-card-foreground"><Bot className="h-4 w-4 text-primary" /> Endpoint: <span className="font-mono">{policySnapshot?.endpoint || "n/a"}</span></p>
              <p>Model: <span className="font-mono text-card-foreground">{policySnapshot?.model || "n/a"}</span></p>
              <p>Feedback events: {formatNumber(policySnapshot?.feedback_events_total || 0)}</p>
              <p>Replay size: {formatNumber(policySnapshot?.replay_size || 0)}</p>
              <p>Last loss: {formatLoss(policySnapshot?.last_loss || 0)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-display">RL Manual Training</CardTitle>
              <CardDescription>Kick off gradient updates against the replay buffer without restarting the policy service.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-display uppercase tracking-[0.18em] text-muted-foreground">Gradient Updates</span>
                  <Input
                    type="number"
                    min={1}
                    value={trainGradientUpdates}
                    onChange={(event) => setTrainGradientUpdates(event.target.value)}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-display uppercase tracking-[0.18em] text-muted-foreground">Replay Fill Limit</span>
                  <Input
                    type="number"
                    min={0}
                    value={trainReplayLimit}
                    onChange={(event) => setTrainReplayLimit(event.target.value)}
                  />
                </label>
              </div>
              <Button onClick={handleManualTrain} disabled={trainBusy || !policySnapshot?.enabled} className="w-full sm:w-auto">
                <PlayCircle className="h-4 w-4" />
                {trainBusy ? "Training..." : "Start Manual Training"}
              </Button>
              {trainResult && (
                <div className="rounded-md border border-border bg-secondary/30 p-3">
                  <p className="font-display text-card-foreground">{trainResult.message}</p>
                  <p className="mt-2">Updates run: {trainResult.updates_run}</p>
                  <p>Replay size: {formatNumber(trainResult.replay_size)}</p>
                  <p>Last loss: {formatLoss(trainResult.last_loss)}</p>
                  <p>Checkpoint saved: {trainResult.checkpoint_saved ? "yes" : "no"}</p>
                </div>
              )}
              {trainError && <ApiErrorAlert title="Manual training failed" message={trainError} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-display">Feedback JSONL Tail</CardTitle>
              <CardDescription>Latest policy feedback entries mirrored from the RL service&apos;s `policy_events.jsonl` stream.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="max-h-[28rem] space-y-2 overflow-auto rounded-md border border-border bg-secondary/20 p-3 font-mono text-[11px] text-muted-foreground">
                {policyEvents.length ? policyEvents.map((event) => (
                  <div key={`${event.request_id}-${event.unix_time_ms}`} className="space-y-1 rounded-md border border-border/60 bg-background/60 p-2">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      {formatUnixTime(event.unix_time_ms)}
                    </div>
                    <pre className="whitespace-pre-wrap break-all text-[11px] leading-5 text-card-foreground">
                      {policyEventToJsonLine(event)}
                    </pre>
                  </div>
                )) : (
                  <p>No policy feedback events available yet.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {loading && <p className="mt-6 text-sm text-muted-foreground">Loading policy operations...</p>}
      </div>
    </div>
  );
}
