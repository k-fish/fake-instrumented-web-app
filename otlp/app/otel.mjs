import { diag, DiagConsoleLogger, DiagLogLevel, trace } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  AggregationType,
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { AggregationTemporalityPreference } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { NodeTracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

import { resolvePrometheusTarget, resolveSentryTarget } from "./config.mjs";

diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);

export const DEFAULT_BOUNDS = [0, 5, 10, 25, 50, 75, 100, 250, 500, 750, 1000, 2500, 5000, 7500, 10000];

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
 * Also sets up an OTLP trace exporter to Relay so the spans around histogram
 * recordings exist as real traces.
 */
export function createPipeline(config) {
  const sentry = resolveSentryTarget(config);
  const prometheus = resolvePrometheusTarget(config);
  const stats = { sentry: emptyStats(), prometheus: emptyStats(), traces: emptyStats() };

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
          new OTLPMetricExporter({
            url: sentry.metricsUrl,
            headers: sentry.headers,
            temporalityPreference: AggregationTemporalityPreference.DELTA,
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
        new OTLPMetricExporter({
          url: prometheus.metricsUrl,
          temporalityPreference: AggregationTemporalityPreference.CUMULATIVE,
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
          options: { boundaries: DEFAULT_BOUNDS, recordMinMax: true },
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
