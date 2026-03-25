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

export interface RuleVersion {
  id: number;
  version: string;
  created_at: string;
  active: boolean;
}

export interface ConfigSnapshot {
  version: number;
  config: Record<string, unknown>;
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

async function fetchJson<T>(path: string): Promise<T> {
  const headers: HeadersInit = {
    Accept: "application/json",
  };

  if (API_TOKEN) {
    headers.Authorization = `Bearer ${API_TOKEN}`;
  }

  const response = await fetch(apiUrl(path), { headers });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`API ${path} failed (${response.status}): ${body || response.statusText}`);
  }
  return response.json() as Promise<T>;
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
