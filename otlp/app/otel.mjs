import { diag, DiagConsoleLogger, DiagLogLevel, trace } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  AggregationType,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { NodeTracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

import { resolvePrometheusTarget, resolveSentryTarget } from "./config.mjs";
import {
  AggregationTemporality,
  ExemplarInjectingExporter,
  createExemplarReservoir,
} from "./exemplars.mjs";

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);

// OTel SDK default explicit bounds (16 buckets).
export const DEFAULT_BOUNDS = [0, 5, 10, 25, 50, 75, 100, 250, 500, 750, 1000, 2500, 5000, 7500, 10000];
// Denser log-spaced layout (32 buckets), roughly 1-2-3-5-7.5 per decade.
export const BOUNDS_32 = [
  0, 1, 2, 3, 5, 7.5, 10, 15, 20, 25, 35, 50, 75, 100, 150, 200, 250, 350, 500, 750, 1000, 1500,
  2000, 2500, 3500, 5000, 7500, 10000, 15000, 20000, 30000,
];

export function boundsFor(config) {
  return Number(config.explicitBuckets) === 32 ? BOUNDS_32 : DEFAULT_BOUNDS;
}

export const METRICS = {
  requests: "poc.requests",
  queueDepth: "poc.queue_depth",
  duration: "http.server.request.duration",
  durationExp: "http.server.request.duration.exp",
};

/**
 * Wraps an exporter so every export result is recorded for the UI, and so an
 * export against Relay/Prometheus that fails never crashes the reader loop.
 */
function instrumentExporter(exporter, name, stats) {
  const original = exporter.export.bind(exporter);
  exporter.export = (payload, resultCallback) => {
    // Span exporters receive an array, metric exporters a ResourceMetrics.
    const points = Array.isArray(payload)
      ? payload.length
      : payload.scopeMetrics.reduce(
          (n, scope) => n + scope.metrics.reduce((m, metric) => m + metric.dataPoints.length, 0),
          0
        );
    original(payload, (result) => {
      const entry = stats[name];
      entry.exports += 1;
      entry.points += points;
      entry.lastAt = new Date().toISOString();
      if (result.code === 0) {
        entry.ok += 1;
        entry.lastError = null;
      } else {
        entry.failed += 1;
        entry.lastError = String(result.error?.message || result.error || "unknown");
      }
      resultCallback(result);
    });
  };
  return exporter;
}

function emptyStats() {
  return { exports: 0, ok: 0, failed: 0, points: 0, lastAt: null, lastError: null };
}

/**
 * One MeterProvider, two readers: Relay gets DELTA, Prometheus stays CUMULATIVE.
 * Both use ExemplarInjectingExporter (see exemplars.mjs) because the JS SDK
 * does not emit exemplars itself. Also sets up an OTLP trace exporter to Relay
 * so the spans referenced by exemplars exist as real traces.
 */
export function createPipeline(config) {
  const sentry = resolveSentryTarget(config);
  const prometheus = resolvePrometheusTarget(config);
  const stats = { sentry: emptyStats(), prometheus: emptyStats(), traces: emptyStats() };
  const exemplars = createExemplarReservoir(["sentry", "prometheus"]);

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: config.serviceName,
    "service.version": "poc",
    "deployment.environment": "local",
  });

  const readers = [];
  if (sentry) {
    readers.push(
      new PeriodicExportingMetricReader({
        exporter: instrumentExporter(
          new ExemplarInjectingExporter({
            name: "sentry",
            url: sentry.metricsUrl,
            headers: sentry.headers,
            temporality: AggregationTemporality.DELTA,
            reservoir: exemplars,
          }),
          "sentry",
          stats
        ),
        exportIntervalMillis: config.exportIntervalMillis,
      })
    );
  }
  readers.push(
    new PeriodicExportingMetricReader({
      exporter: instrumentExporter(
        new ExemplarInjectingExporter({
          name: "prometheus",
          url: prometheus.metricsUrl,
          temporality: AggregationTemporality.CUMULATIVE,
          reservoir: exemplars,
        }),
        "prometheus",
        stats
      ),
      exportIntervalMillis: config.exportIntervalMillis,
    })
  );

  const meterProvider = new MeterProvider({
    resource,
    readers,
    views: [
      {
        instrumentName: METRICS.duration,
        aggregation: {
          type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
          options: { boundaries: boundsFor(config), recordMinMax: true },
        },
      },
      {
        instrumentName: METRICS.durationExp,
        aggregation: {
          type: AggregationType.EXPONENTIAL_HISTOGRAM,
          options: { maxSize: 160, recordMinMax: true },
        },
      },
    ],
  });

  let tracerProvider = null;
  if (sentry) {
    tracerProvider = new NodeTracerProvider({
      resource,
      spanProcessors: [
        new BatchSpanProcessor(
          instrumentExporter(
            new OTLPTraceExporter({ url: sentry.tracesUrl, headers: sentry.headers }),
            "traces",
            stats
          ),
          { scheduledDelayMillis: 5000 }
        ),
      ],
    });
    tracerProvider.register();
  }

  return {
    stats,
    exemplars,
    sentry,
    prometheus,
    meter: meterProvider.getMeter("otlp-poc"),
    tracer: tracerProvider ? tracerProvider.getTracer("otlp-poc") : trace.getTracer("noop"),
    async shutdown() {
      await meterProvider.shutdown();
      if (tracerProvider) {
        await tracerProvider.shutdown();
      }
    },
  };
}
