import { useEffect, useMemo, useState } from "react";
import { Topbar } from "@/components/Topbar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RulesPayload, fetchRulesSnapshot } from "@/lib/control-api";

export default function Rules() {
  const [rules, setRules] = useState<RulesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const result = await fetchRulesSnapshot();
        if (!mounted) return;
        setRules(result);
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

  const content = useMemo(() => {
    if (!rules?.content) return "";
    return rules.content.trim();
  }, [rules]);

  return (
    <div className="min-h-screen bg-background">
      <Topbar />
      <div className="p-6">
        {error && (
          <div className="mb-6 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            Failed to load rules: {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-display">Current Ruleset</CardTitle>
            <CardDescription>Version and source are derived from the active rules payload.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
              <pre className="max-h-[520px] overflow-auto rounded-md border border-border bg-secondary/40 p-4 text-xs text-foreground">
                {content}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">No rules content available.</p>
            )}
          </CardContent>
        </Card>

        {loading && <p className="mt-4 text-sm text-muted-foreground">Loading rules snapshot...</p>}
      </div>
    </div>
  );
}
