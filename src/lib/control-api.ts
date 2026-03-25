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
