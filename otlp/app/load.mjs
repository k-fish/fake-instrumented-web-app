import { SpanStatusCode } from "@opentelemetry/api";

import { METRICS } from "./otel.mjs";

const ROUTES = [
  { route: "/api/users", method: "GET", weight: 5 },
  { route: "/api/checkout", method: "POST", weight: 2 },
  { route: "/api/search", method: "GET", weight: 3 },
];

export const CACHE_MISS_RATE = 0.06;

function uniform(lo, hi) {
  return lo + Math.random() * (hi - lo);
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
 * Bimodal request duration: ~94% cache hits in (0,5] ms, ~6% cache misses in
 * (2500,5000] ms. This is the shape where t-digest over one value per bucket
 * went badly wrong.
 */
export function sampleDuration() {
  const miss = Math.random() < CACHE_MISS_RATE;
  return { miss, ms: miss ? uniform(2500, 5000) : uniform(0, 5) };
}

/**
 * Drives the instruments at a fixed request rate. Every histogram record runs
 * inside an active span so exemplars could attach to real traces if the SDK
 * supported them.
 */
export function createLoadGenerator(pipeline, { requestsPerSecond = 20 } = {}) {
  const { meter, tracer } = pipeline;

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
    const { route, method } = pickRoute();
    const { miss, ms } = sampleDuration();
    const attributes = {
      "http.route": route,
      "http.request.method": method,
      "http.response.status_code": 200,
    };

    tracer.startActiveSpan(`${method} ${route}`, { attributes }, (span) => {
      requests.add(1, attributes);
      duration.record(ms, attributes);
      durationExp.record(ms, attributes);
      span.setAttribute("cache", miss ? "miss" : "hit");
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
