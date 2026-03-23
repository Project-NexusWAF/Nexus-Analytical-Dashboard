// Mock metric data simulating Nexus observability metrics

const randomBetween = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const generateTimeSeries = (points: number, baseValue: number, variance: number) =>
  Array.from({ length: points }, (_, i) => {
    const time = new Date(Date.now() - (points - i) * 60000);
    return {
      time: time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      value: Math.max(0, baseValue + (Math.random() - 0.5) * variance * 2),
    };
  });

export const getRequestsTotal = () => {
  const methods = ["GET", "POST", "PUT", "DELETE"];
  const statuses = ["200", "201", "400", "401", "403", "404", "500", "502"];
  return methods.flatMap((method) =>
    statuses.map((status) => ({
      method,
      status,
      count: randomBetween(status.startsWith("2") ? 5000 : 50, status.startsWith("2") ? 50000 : 2000),
    }))
  );
};

export const getRequestDurationTimeSeries = () => generateTimeSeries(30, 45, 30);

export const getBlockedRequests = () => [
  { reason: "rate_limit", count: randomBetween(800, 3000) },
  { reason: "waf_rule", count: randomBetween(200, 1500) },
  { reason: "geo_block", count: randomBetween(100, 800) },
  { reason: "ip_blacklist", count: randomBetween(50, 400) },
  { reason: "bot_detection", count: randomBetween(300, 2000) },
  { reason: "ml_flagged", count: randomBetween(100, 600) },
];

export const getLayerDurations = () => [
  { layer: "tls_termination", p50: 2.1, p95: 8.5, p99: 15.2 },
  { layer: "rate_limiter", p50: 0.3, p95: 1.2, p99: 3.1 },
  { layer: "waf", p50: 5.4, p95: 18.7, p99: 45.0 },
  { layer: "ml_inference", p50: 12.3, p95: 35.6, p99: 78.9 },
  { layer: "routing", p50: 0.8, p95: 2.4, p99: 5.1 },
  { layer: "upstream_proxy", p50: 25.1, p95: 85.3, p99: 210.0 },
];

export const getMlInferenceDuration = () => generateTimeSeries(30, 12, 8);

export const getMlDetectionsTimeSeries = () => generateTimeSeries(30, 15, 12);

export const getActiveConnections = () => generateTimeSeries(30, 1200, 400);

export const getUpstreamHealth = () => [
  { upstream: "api-primary", health: 1.0, latency: 23 },
  { upstream: "api-secondary", health: 1.0, latency: 31 },
  { upstream: "auth-service", health: 1.0, latency: 12 },
  { upstream: "cdn-edge-1", health: 0.0, latency: 0 },
  { upstream: "cdn-edge-2", health: 1.0, latency: 8 },
  { upstream: "ml-service", health: 1.0, latency: 45 },
];

export const getRateLimitedTop = () => [
  { client_ip: "192.168.1.42", count: randomBetween(500, 2000) },
  { client_ip: "10.0.0.15", count: randomBetween(300, 1500) },
  { client_ip: "172.16.0.88", count: randomBetween(200, 1000) },
  { client_ip: "203.0.113.5", count: randomBetween(100, 800) },
  { client_ip: "198.51.100.7", count: randomBetween(50, 500) },
];

export const getRuleMatches = () => [
  { rule_id: "sql-injection-01", action: "block", count: randomBetween(100, 800) },
  { rule_id: "xss-reflect-02", action: "block", count: randomBetween(50, 400) },
  { rule_id: "path-traversal-03", action: "block", count: randomBetween(20, 200) },
  { rule_id: "header-anomaly-04", action: "log", count: randomBetween(200, 1500) },
  { rule_id: "bot-signature-05", action: "challenge", count: randomBetween(300, 2000) },
  { rule_id: "payload-size-06", action: "block", count: randomBetween(10, 100) },
];

export const getSummaryStats = () => ({
  totalRequests: randomBetween(1_200_000, 2_500_000),
  avgLatency: +(Math.random() * 30 + 20).toFixed(1),
  blockedPercent: +(Math.random() * 3 + 0.5).toFixed(2),
  activeConnections: randomBetween(900, 1600),
  mlDetections: randomBetween(500, 3000),
  healthyUpstreams: 5,
  totalUpstreams: 6,
});
