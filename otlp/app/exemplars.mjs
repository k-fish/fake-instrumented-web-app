import { AggregationTemporality } from "@opentelemetry/sdk-metrics";
import { JsonMetricsSerializer } from "@opentelemetry/otlp-transformer";

/**
 * The OTel JS SDK (sdk-metrics 2.x) never attaches exemplars to exported
 * histogram points, and otlp-transformer 0.223 never serializes them. This
 * module fills the gap for the PoC: the load generator offers (value, span)
 * pairs at record() time, and the exporter below splices them into the OTLP
 * JSON the SDK's own serializer produced, right before the POST.
 *
 * Each exporter gets its own pending queue so delta (Sentry) and cumulative
 * (Prometheus) exports can drain independently.
 */

const MAX_PER_SERIES = 4;

function seriesKey(metricName, attributes) {
  const parts = Object.keys(attributes)
    .sort()
    .map((key) => `${key}=${String(attributes[key])}`);
  return `${metricName}|${parts.join(",")}`;
}

function anyValueToString(value) {
  if (!value) {
    return "";
  }
  if ("stringValue" in value) return value.stringValue;
  if ("intValue" in value) return String(value.intValue);
  if ("doubleValue" in value) return String(value.doubleValue);
  if ("boolValue" in value) return String(value.boolValue);
  return JSON.stringify(value);
}

function jsonSeriesKey(metricName, attributes = []) {
  const flat = {};
  for (const { key, value } of attributes) {
    flat[key] = anyValueToString(value);
  }
  return seriesKey(metricName, flat);
}

function toAnyValue(value) {
  if (typeof value === "number") {
    return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "boolean") {
    return { boolValue: value };
  }
  return { stringValue: String(value) };
}

export function createExemplarReservoir(exporterNames) {
  const pending = Object.fromEntries(exporterNames.map((name) => [name, new Map()]));
  const totals = { offered: 0, kept: 0 };

  /**
   * Keeps the largest value seen for the series plus the most recent ones, so
   * the slow tail always has an exemplar and so does the common case.
   */
  function keep(list, exemplar) {
    list.push(exemplar);
    if (list.length <= MAX_PER_SERIES) {
      return;
    }
    const maxIndex = list.reduce((best, e, i) => (e.asDouble > list[best].asDouble ? i : best), 0);
    const dropIndex = maxIndex === 0 ? 1 : 0;
    list.splice(dropIndex, 1);
  }

  return {
    totals,
    offer(metricName, attributes, value, span, extraAttributes = {}) {
      const context = span?.spanContext?.();
      if (!context || !context.traceId || context.traceId === "0".repeat(32)) {
        return;
      }
      totals.offered += 1;
      const exemplar = {
        timeUnixNano: String(BigInt(Date.now()) * 1_000_000n),
        asDouble: value,
        traceId: context.traceId,
        spanId: context.spanId,
        filteredAttributes: Object.entries(extraAttributes).map(([key, v]) => ({
          key,
          value: toAnyValue(v),
        })),
      };
      const key = seriesKey(metricName, attributes);
      for (const queue of Object.values(pending)) {
        const list = queue.get(key) ?? [];
        keep(list, exemplar);
        queue.set(key, list);
      }
    },
    drain(exporterName, metricName, jsonAttributes) {
      const queue = pending[exporterName];
      const key = jsonSeriesKey(metricName, jsonAttributes);
      const list = queue.get(key) ?? [];
      queue.delete(key);
      totals.kept += list.length;
      return list;
    },
  };
}

/**
 * PushMetricExporter that serializes with the SDK's JSON transformer, attaches
 * pending exemplars to every histogram / exponential histogram data point, and
 * POSTs the result. Drop-in for OTLPMetricExporter within this PoC.
 */
export class ExemplarInjectingExporter {
  constructor({ name, url, headers = {}, temporality, reservoir }) {
    this.name = name;
    this.url = url;
    this.headers = headers;
    this.temporality = temporality;
    this.reservoir = reservoir;
    this.lastExemplars = 0;
  }

  selectAggregationTemporality() {
    return this.temporality;
  }

  attachExemplars(request) {
    let attached = 0;
    for (const rm of request.resourceMetrics ?? []) {
      for (const sm of rm.scopeMetrics ?? []) {
        for (const metric of sm.metrics ?? []) {
          const points = metric.histogram?.dataPoints ?? metric.exponentialHistogram?.dataPoints;
          if (!points) {
            continue;
          }
          for (const point of points) {
            const exemplars = this.reservoir.drain(this.name, metric.name, point.attributes);
            if (exemplars.length) {
              point.exemplars = exemplars;
              attached += exemplars.length;
            }
          }
        }
      }
    }
    this.lastExemplars = attached;
    return request;
  }

  export(resourceMetrics, resultCallback) {
    const serialized = JsonMetricsSerializer.serializeRequest(resourceMetrics);
    const request = this.attachExemplars(JSON.parse(new TextDecoder().decode(serialized)));
    fetch(this.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...this.headers },
      body: JSON.stringify(request),
    })
      .then(async (response) => {
        if (response.ok) {
          resultCallback({ code: 0 });
        } else {
          const text = await response.text();
          resultCallback({ code: 1, error: new Error(`${response.status} ${text.slice(0, 300)}`) });
        }
      })
      .catch((error) => resultCallback({ code: 1, error }));
  }

  async forceFlush() {}

  async shutdown() {}
}

export { AggregationTemporality };
