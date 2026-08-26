/**
 * Mirrors Relay's canonical EAP byte size calculation so the UI can show the
 * quantity that would be billed against the log_byte / trace_metric_byte
 * categories. JSON framing, item headers and non-counted fields (timestamp,
 * trace_id, span_id, level, metric type, unit) contribute nothing: only the
 * body/name, the metric value and the attribute keys and values are counted.
 *
 * See relay-event-normalization/src/eap/size.rs, relay-ourlogs/src/size.rs and
 * relay-server/src/processing/trace_metrics/utils.rs.
 */

const encoder = new TextEncoder();

export function utf8Size(str) {
  return encoder.encode(str).length;
}

export function valueSize(value) {
  if (value === null || value === undefined) return 0;

  switch (typeof value) {
    case 'boolean':
      return 1;
    case 'number':
    case 'bigint':
      return 8;
    case 'string':
      return utf8Size(value);
    default:
      if (Array.isArray(value)) {
        return value.reduce((total, item) => total + valueSize(item), 0);
      }
      return Object.entries(value).reduce(
        (total, [key, item]) => total + utf8Size(key) + valueSize(item),
        0
      );
  }
}

export function attributesSize(attributes) {
  if (!attributes) return 0;
  return Object.entries(attributes).reduce(
    (total, [key, value]) => total + utf8Size(key) + valueSize(value),
    0
  );
}

export function calculateLogSize(body, attributes) {
  return Math.max(1, utf8Size(body || '') + attributesSize(attributes));
}

export function calculateTraceMetricSize(name, value, attributes) {
  return Math.max(1, utf8Size(name || '') + valueSize(value) + attributesSize(attributes));
}
