import { useEffect, useMemo, useState } from "react";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfigSnapshot, fetchConfigSnapshot } from "@/lib/control-api";

export default function Config() {
  const [configSnapshot, setConfigSnapshot] = useState<ConfigSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const result = await fetchConfigSnapshot();
        if (!mounted) return;
        setConfigSnapshot(result);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load config");
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

  const formattedConfig = useMemo(() => {
    if (!configSnapshot?.config) return "";
    try {
      return JSON.stringify(configSnapshot.config, null, 2);
    } catch {
      return String(configSnapshot.config);
    }
  }, [configSnapshot]);

  return (
    <div className="min-h-screen bg-background">
      <Topbar />
      <div className="p-6">
        {error && (
          <div className="mb-6 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            Failed to load config: {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-display">Active Configuration</CardTitle>
            <CardDescription>Secrets are redacted before rendering.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="font-display">Version:</span>
              <Badge variant="secondary" className="text-[10px] uppercase tracking-[0.15em]">
                {configSnapshot?.version ?? "unknown"}
              </Badge>
            </div>

            {formattedConfig ? (
              <pre className="max-h-[520px] overflow-auto rounded-md border border-border bg-secondary/40 p-4 text-xs text-foreground">
                {formattedConfig}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">No config payload available.</p>
            )}
          </CardContent>
        </Card>

        {loading && <p className="mt-4 text-sm text-muted-foreground">Loading config snapshot...</p>}
      </div>
    </div>
  );
}
