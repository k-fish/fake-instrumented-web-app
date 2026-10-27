import crypto from "node:crypto";

import { readConfig, resolvePrometheusTarget, resolveSentryTarget } from "./config.mjs";
import { DEFAULT_BOUNDS } from "./otel.mjs";

const DELTA = "AGGREGATION_TEMPORALITY_DELTA";
const CUMULATIVE = "AGGREGATION_TEMPORALITY_CUMULATIVE";

export const FIXTURE = {
  histogram: {
    name: "http.server.request.duration",
    unit: "ms",
    bounds: DEFAULT_BOUNDS,
    // (0,5] -> 9400, (2500,5000] -> 600, all other buckets 0
    buckets: { "(0,5]": 9400, "(2500,5000]": 600 },
    count: 10000,
    sum: 1569400,
    min: 0.4,
    max: 4870,
    exemplars: [
      { value: 3.1, attributes: { cache: "hit" } },
      { value: 4100, attributes: { cache: "miss" } },
    ],
  },
  counter: { name: "poc.fixture.counter", value: 42 },
  cumulativeCounter: { name: "poc.fixture.cumulative_counter", value: 7 },
  // What the PoC should show for the histogram above.
  expected: {
    count: 10000,
    sum: 1569400,
    avg: 156.94,
    p50: 2.66,
    p95: 2916.7,
    p99: 4583.3,
    min: 0,
    max: 5000,
    sampleRows: 4,
    exemplarRows: 2,
    counterSum: 42,
  },
};

function hex(bytes) {
  return crypto.randomBytes(bytes).toString("hex");
}

function nanos(date) {
  return `${BigInt(date.getTime()) * 1000000n}`;
}

function kv(key, value) {
  const typed =
    typeof value === "number"
      ? Number.isInteger(value)
        ? { intValue: String(value) }
        : { doubleValue: value }
      : { stringValue: String(value) };
  return { key, value: typed };
}

function attrs(object) {
  return Object.entries(object).map(([key, value]) => kv(key, value));
}

/** bucketCounts for the explicit bounds, with the two populated buckets. */
function bucketCounts(bounds, populated) {
  const counts = new Array(bounds.length + 1).fill("0");
  for (const [label, count] of Object.entries(populated)) {
    const upper = Number(label.slice(label.indexOf(",") + 1, -1));
    const index = bounds.indexOf(upper);
    if (index === -1) {
      throw new Error(`bucket ${label} does not end on an explicit bound`);
    }
    counts[index] = String(count);
  }
  return counts;
}

/**
 * Builds the exemplar list once so Sentry and Prometheus get identical trace ids.
 */
export function buildExemplars(now) {
  return FIXTURE.histogram.exemplars.map((exemplar) => ({
    traceId: hex(16),
    spanId: hex(8),
    value: exemplar.value,
    attributes: exemplar.attributes,
    timeUnixNano: nanos(now),
  }));
}

function histogramPoint({ start, end, exemplars, attributes }) {
  const h = FIXTURE.histogram;
  return {
    startTimeUnixNano: nanos(start),
    timeUnixNano: nanos(end),
    count: String(h.count),
    sum: h.sum,
    min: h.min,
    max: h.max,
    bucketCounts: bucketCounts(h.bounds, h.buckets),
    explicitBounds: h.bounds,
    attributes: attrs(attributes),
    exemplars: exemplars.map((exemplar) => ({
      timeUnixNano: exemplar.timeUnixNano,
      asDouble: exemplar.value,
      traceId: exemplar.traceId,
      spanId: exemplar.spanId,
      filteredAttributes: attrs(exemplar.attributes),
    })),
  };
}

function sumPoint({ start, end, value, attributes }) {
  return {
    startTimeUnixNano: nanos(start),
    timeUnixNano: nanos(end),
    asInt: String(value),
    attributes: attrs(attributes),
  };
}

function resourceMetrics(metrics, serviceName) {
  return {
    resourceMetrics: [
      {
        resource: { attributes: attrs({ "service.name": serviceName, "service.version": "fixture" }) },
        scopeMetrics: [{ scope: { name: "otlp-poc.fixture", version: "1" }, metrics }],
      },
    ],
  };
}

const POINT_ATTRIBUTES = { "http.route": "/fixture", "http.request.method": "GET" };

/**
 * Payload for Relay: one delta histogram point with 2 exemplars, one delta sum,
 * and one cumulative sum which the PoC must drop.
 */
export function buildSentryPayload({ start, end, exemplars, serviceName }) {
  const h = FIXTURE.histogram;
  return resourceMetrics(
    [
      {
        name: h.name,
        unit: h.unit,
        histogram: {
          aggregationTemporality: DELTA,
          dataPoints: [histogramPoint({ start, end, exemplars, attributes: POINT_ATTRIBUTES })],
        },
      },
      {
        name: FIXTURE.counter.name,
        unit: "1",
        sum: {
          aggregationTemporality: DELTA,
          isMonotonic: true,
          dataPoints: [sumPoint({ start, end, value: FIXTURE.counter.value, attributes: POINT_ATTRIBUTES })],
        },
      },
      {
        name: FIXTURE.cumulativeCounter.name,
        unit: "1",
        sum: {
          aggregationTemporality: CUMULATIVE,
          isMonotonic: true,
          dataPoints: [
            sumPoint({ start, end, value: FIXTURE.cumulativeCounter.value, attributes: POINT_ATTRIBUTES }),
          ],
        },
      },
    ],
    serviceName
  );
}

/**
 * Same data as cumulative for Prometheus. A cumulative series needs two samples
 * for `increase()`/`rate()` to work, so an all-zero point is written at `start`
 * and the full point at `end` (both with the same start time).
 */
export function buildPrometheusPayloads({ start, end, exemplars, serviceName }) {
  const h = FIXTURE.histogram;
  const zeroHistogram = {
    startTimeUnixNano: nanos(start),
    timeUnixNano: nanos(start),
    count: "0",
    sum: 0,
    bucketCounts: new Array(h.bounds.length + 1).fill("0"),
    explicitBounds: h.bounds,
    attributes: attrs(POINT_ATTRIBUTES),
  };
  const zeroPayload = resourceMetrics(
    [
      { name: h.name, unit: h.unit, histogram: { aggregationTemporality: CUMULATIVE, dataPoints: [zeroHistogram] } },
      {
        name: FIXTURE.counter.name,
        unit: "1",
        sum: {
          aggregationTemporality: CUMULATIVE,
          isMonotonic: true,
          dataPoints: [sumPoint({ start, end: start, value: 0, attributes: POINT_ATTRIBUTES })],
        },
      },
    ],
    serviceName
  );
  const fullPayload = resourceMetrics(
    [
      {
        name: h.name,
        unit: h.unit,
        histogram: {
          aggregationTemporality: CUMULATIVE,
          dataPoints: [histogramPoint({ start, end, exemplars, attributes: POINT_ATTRIBUTES })],
        },
      },
      {
        name: FIXTURE.counter.name,
        unit: "1",
        sum: {
          aggregationTemporality: CUMULATIVE,
          isMonotonic: true,
          dataPoints: [sumPoint({ start, end, value: FIXTURE.counter.value, attributes: POINT_ATTRIBUTES })],
        },
      },
    ],
    serviceName
  );
  return [zeroPayload, fullPayload];
}

/** One OTLP trace per exemplar so the exemplar rows link to a real trace. */
export function buildTracePayload({ end, exemplars, serviceName }) {
  return {
    resourceSpans: [
      {
        resource: { attributes: attrs({ "service.name": serviceName }) },
        scopeSpans: [
          {
            scope: { name: "otlp-poc.fixture" },
            spans: exemplars.map((exemplar) => {
              const endMs = end.getTime();
              const startMs = endMs - exemplar.value;
              return {
                traceId: exemplar.traceId,
                spanId: exemplar.spanId,
                name: `GET /fixture (${exemplar.attributes.cache})`,
                kind: 2,
                startTimeUnixNano: nanos(new Date(startMs)),
                endTimeUnixNano: nanos(end),
                attributes: attrs({ ...POINT_ATTRIBUTES, cache: exemplar.attributes.cache }),
                status: { code: 1 },
              };
            }),
          },
        ],
      },
    ],
  };
}

async function postJson(url, body, headers = {}) {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    return { url, status: response.status, ok: response.ok, body: text.slice(0, 500), ms: Date.now() - started };
  } catch (error) {
    return { url, status: 0, ok: false, body: error.message, ms: Date.now() - started };
  }
}

export async function sendFixture(config = readConfig()) {
  const sentry = resolveSentryTarget(config);
  const prometheus = resolvePrometheusTarget(config);
  const end = new Date();
  const start = new Date(end.getTime() - 60000);
  const exemplars = buildExemplars(end);
  const serviceName = config.serviceName;

  const results = { sentAt: end.toISOString(), exemplars, sentry: null, traces: null, prometheus: [] };

  if (sentry) {
    results.traces = await postJson(sentry.tracesUrl, buildTracePayload({ end, exemplars, serviceName }), sentry.headers);
    results.sentry = await postJson(
      sentry.metricsUrl,
      buildSentryPayload({ start, end, exemplars, serviceName }),
      sentry.headers
    );
  }
  for (const payload of buildPrometheusPayloads({ start, end, exemplars, serviceName })) {
    results.prometheus.push(await postJson(prometheus.metricsUrl, payload));
  }
  return results;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  sendFixture().then((results) => {
    console.log(JSON.stringify(results, null, 2));
  });
}
