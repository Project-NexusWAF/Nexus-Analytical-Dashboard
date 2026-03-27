export interface HealthSnapshot {
  ok: boolean;
  status: string;
  config_version: number;
}

export interface StatsSnapshot {
  requests_total: number;
  blocked_total: number;
  rate_limited_total: number;
  pipeline_layers: string[];
  config_version: number;
  ml_circuit_state: string;
  healthy_upstreams: number;
  upstreams: UpstreamStatusView[];
}

export interface UpstreamStatusView {
  name: string;
  addr: string;
  status: string;
  enabled: boolean;
}

export interface AttackLogEntry {
  id: string;
  timestamp: string;
  client_ip: string;
  uri: string;
  method: string;
  risk_score: number;
  decision: string;
  threat_tags: string[];
  blocked_by?: string | null;
  ml_score?: number | null;
  ml_label?: string | null;
  block_code?: string | null;
}

export interface PaginatedLogs {
  page: number;
  limit: number;
  items: AttackLogEntry[];
}

export interface RulesPayload {
  found: boolean;
  version: string;
  content: string;
  source: string;
}

export interface GpsCandidateView {
  id: string;
  name: string;
  description: string;
  kind: string;
  signal: string;
  malicious_hits: number;
  benign_hits: number;
}

export interface SynthesizeRulesBody {
  lookback_hours?: number;
  min_hits?: number;
  max_rules?: number;
  apply?: boolean;
}

export interface SynthesizeRulesResponse {
  version: string;
  applied: boolean;
  candidates: GpsCandidateView[];
  content: string;
}

export interface RuleVersion {
  id: number;
  version: string;
  created_at: string;
  active: boolean;
}

export interface ConfigSnapshot {
  version: number;
  config: ControlConfigSnapshot;
}

export type SlackSeverity = "low" | "medium" | "high" | "critical";

export interface TlsConfigSnapshot {
  enabled: boolean;
  cert_path: string;
  key_path: string;
  certbot: CertbotConfigSnapshot;
}

export interface CertbotConfigSnapshot {
  enabled: boolean;
  certbot_bin: string;
  live_dir: string;
  cert_name: string;
  domain: string;
  extra_domains: string[];
  email: string;
  webroot_dir: string;
  challenge_addr: string;
  renew_interval_hours: number;
  staging: boolean;
}

export interface GatewayConfigSnapshot extends Record<string, unknown> {
  tls: TlsConfigSnapshot;
}

export interface GpsConfigSnapshot {
  enabled: boolean;
  default_lookback_hours: number;
  min_hits: number;
  max_rules: number;
}

export interface SlackConfigSnapshot {
  enabled: boolean;
  webhook_url: string;
  channel: string;
  username: string;
  icon_emoji: string;
  min_severity: SlackSeverity;
  include_rate_limits: boolean;
}

export interface ControlConfigSnapshot extends Record<string, unknown> {
  gateway: GatewayConfigSnapshot;
  gps: GpsConfigSnapshot;
  slack: SlackConfigSnapshot;
}

export interface ConfigLogEntry {
  timestamp: string;
  version: number;
  status: string;
  message: string;
}

const API_BASE = (import.meta.env.VITE_CONTROL_API_BASE_URL || "").trim();
const API_TOKEN = (import.meta.env.VITE_CONTROL_API_TOKEN || "").trim();

function apiUrl(path: string): string {
  if (!API_BASE) return path;
  return `${API_BASE.replace(/\/$/, "")}${path}`;
}

function formatErrorBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return "";

  try {
    const parsed = JSON.parse(trimmed) as { error?: unknown; message?: unknown };
    if (typeof parsed.error === "string" && parsed.error.trim()) {
      return parsed.error.trim();
    }
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message.trim();
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (API_TOKEN) {
    headers.set("Authorization", `Bearer ${API_TOKEN}`);
  }

  const response = await fetch(apiUrl(path), { ...init, headers });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const detail = formatErrorBody(body) || response.statusText;
    throw new Error(`API ${path} failed (${response.status}): ${detail}`);
  }
  return response.json() as Promise<T>;
}

async function fetchJson<T>(path: string): Promise<T> {
  return requestJson<T>(path);
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  return requestJson<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function fetchHealthSnapshot(): Promise<HealthSnapshot> {
  return fetchJson<HealthSnapshot>("/api/health");
}

export async function fetchStatsSnapshot(): Promise<StatsSnapshot> {
  return fetchJson<StatsSnapshot>("/api/stats");
}

export async function fetchRecentLogs(limit = 300): Promise<AttackLogEntry[]> {
  const logs = await fetchJson<PaginatedLogs>(`/api/logs?page=1&limit=${limit}`);
  return logs.items;
}

export async function fetchRulesSnapshot(): Promise<RulesPayload> {
  return fetchJson<RulesPayload>("/api/rules");
}

export async function fetchRuleVersions(): Promise<RuleVersion[]> {
  return fetchJson<RuleVersion[]>("/api/rules/versions");
}

export async function fetchConfigSnapshot(): Promise<ConfigSnapshot> {
  return fetchJson<ConfigSnapshot>("/api/config");
}

export async function fetchConfigLogs(): Promise<ConfigLogEntry[]> {
  return fetchJson<ConfigLogEntry[]>("/api/config/logs");
}

export async function synthesizeRules(
  body: SynthesizeRulesBody,
): Promise<SynthesizeRulesResponse> {
  return postJson<SynthesizeRulesResponse>("/api/rules/synthesize", body);
}
