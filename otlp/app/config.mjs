import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, ".otlp-config.json");

export const DEFAULTS = {
  dsn: process.env.SENTRY_DSN || "",
  // Empty means "derive from the DSN host", e.g. http://localhost:8000.
  relayUrl: process.env.RELAY_URL || "",
  prometheusUrl: process.env.PROMETHEUS_URL || "http://localhost:9090",
  exportIntervalMillis: Number(process.env.EXPORT_INTERVAL_MS || 10000),
  // 16 = OTel SDK default bounds, 32 = denser log-spaced layout (otel.mjs).
  explicitBuckets: Number(process.env.EXPLICIT_BUCKETS || 32),
  requestsPerSecond: Number(process.env.REQUESTS_PER_SECOND || 20),
  serviceName: "otlp-poc",
};

export function readConfig() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8")) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeConfig(patch) {
  const next = { ...readConfig(), ...patch };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2));
  return next;
}

/**
 * Turns a Sentry DSN into the OTLP endpoints and auth header Relay expects.
 * `relayUrl` overrides the DSN host, which lets a DSN that points at the Sentry
 * devserver proxy (:8000) be sent straight to Relay (:7899) instead.
 */
export function resolveSentryTarget(config) {
  if (!config.dsn) {
    return null;
  }
  const url = new URL(config.dsn);
  const publicKey = url.username;
  const projectId = url.pathname.replace(/^\/+/, "");
  const base = (config.relayUrl || `${url.protocol}//${url.host}`).replace(/\/+$/, "");
  const integration = `${base}/api/${projectId}/integration/otlp`;
  return {
    publicKey,
    projectId,
    base,
    metricsUrl: `${integration}/v1/metrics`,
    tracesUrl: `${integration}/v1/traces`,
    headers: { "x-sentry-auth": `sentry sentry_key=${publicKey}` },
  };
}

export function resolvePrometheusTarget(config) {
  const base = (config.prometheusUrl || DEFAULTS.prometheusUrl).replace(/\/+$/, "");
  return { base, metricsUrl: `${base}/api/v1/otlp/v1/metrics` };
}
