import { SpanStatusCode } from "@opentelemetry/api";

import { METRICS } from "./otel.mjs";

// medianMs/sigma parameterise a log-normal per route so the OTel default
// 16-bucket layout (0..10000) is populated end to end.
const ROUTES = [
  { route: "/api/users", method: "GET", weight: 5, medianMs: 60, sigma: 1.1 },
  { route: "/api/search", method: "GET", weight: 3, medianMs: 300, sigma: 0.9 },
  { route: "/api/checkout", method: "POST", weight: 2, medianMs: 1200, sigma: 0.7 },
];

export const CACHE_MISS_RATE = 0.03;
const MAX_MS = 9000;

function uniform(lo, hi) {
  return lo + Math.random() * (hi - lo);
}

function gaussian() {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function logNormal(medianMs, sigma) {
  return medianMs * Math.exp(sigma * gaussian());
}

function pickRoute() {
  const total = ROUTES.reduce((n, r) => n + r.weight, 0);
  let roll = Math.random() * total;
  for (const route of ROUTES) {
    roll -= route.weight;
    if (roll <= 0) {
      return route;
    }
  }
  return ROUTES[0];
}

/**
 * Log-normal request duration per route (medians 60 / 300 / 1200 ms) plus a
 * ~3% "cache miss" tail uniform in (2500, 7500] ms, clamped below MAX_MS so
 * everything stays inside the default bucket layout. The old bimodal shape
 * (94% in (0,5], 6% in (2500,5000]) lives on in the fixture.
 */
export function sampleDuration(route) {
  const miss = Math.random() < CACHE_MISS_RATE;
  const ms = miss ? uniform(2500, 7500) : logNormal(route.medianMs, route.sigma);
  return { miss, ms: Math.min(MAX_MS, Math.max(0.1, ms)) };
}

/**
 * Drives the instruments at a fixed request rate. Every histogram record runs
 * inside an active span and is offered to the exemplar reservoir so the
 * exported points carry exemplars pointing at real traces.
 */
export function createLoadGenerator(pipeline, { requestsPerSecond = 20 } = {}) {
  const { meter, tracer, exemplars } = pipeline;

  const requests = meter.createCounter(METRICS.requests, {
    description: "Requests handled by the fake server",
    unit: "{request}",
  });
  const duration = meter.createHistogram(METRICS.duration, {
    description: "Request duration (explicit buckets)",
    unit: "ms",
  });
  const durationExp = meter.createHistogram(METRICS.durationExp, {
    description: "Request duration (base-2 exponential histogram)",
    unit: "ms",
  });

  let queueDepth = 10;
  meter
    .createObservableGauge(METRICS.queueDepth, { description: "Fake queue depth", unit: "{job}" })
    .addCallback((result) => {
      result.observe(queueDepth, { "queue.name": "orders" });
    });

  const counts = { total: 0, hits: 0, misses: 0, startedAt: null };
  let timer = null;

  function handleRequest() {
    const picked = pickRoute();
    const { route, method } = picked;
    const { miss, ms } = sampleDuration(picked);
    const attributes = {
      "http.route": route,
      "http.request.method": method,
      "http.response.status_code": 200,
    };

    tracer.startActiveSpan(`${method} ${route}`, { attributes }, (span) => {
      requests.add(1, attributes);
      duration.record(ms, attributes);
      durationExp.record(ms, attributes);
      const cache = miss ? "miss" : "hit";
      exemplars.offer(METRICS.duration, attributes, ms, span, { cache });
      exemplars.offer(METRICS.durationExp, attributes, ms, span, { cache });
      span.setAttribute("cache", cache);
      span.setStatus({ code: SpanStatusCode.OK });
      // End the span at a time that matches the recorded duration.
      span.end(Date.now() + ms);
    });

    counts.total += 1;
    counts[miss ? "misses" : "hits"] += 1;
    // Random walk between 0 and 50.
    queueDepth = Math.max(0, Math.min(50, queueDepth + Math.round(uniform(-3, 3))));
  }

  return {
    counts,
    get running() {
      return timer !== null;
    },
    start() {
      if (timer) {
        return;
      }
      counts.startedAt = new Date().toISOString();
      timer = setInterval(handleRequest, 1000 / requestsPerSecond);
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
