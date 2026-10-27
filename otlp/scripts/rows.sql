
WITH mapConcat(attributes_string_0, attributes_string_1, attributes_string_2, attributes_string_3, attributes_string_4, attributes_string_5, attributes_string_6, attributes_string_7, attributes_string_8, attributes_string_9, attributes_string_10, attributes_string_11, attributes_string_12, attributes_string_13, attributes_string_14, attributes_string_15, attributes_string_16, attributes_string_17, attributes_string_18, attributes_string_19, attributes_string_20, attributes_string_21, attributes_string_22, attributes_string_23, attributes_string_24, attributes_string_25, attributes_string_26, attributes_string_27, attributes_string_28, attributes_string_29, attributes_string_30, attributes_string_31, attributes_string_32, attributes_string_33, attributes_string_34, attributes_string_35, attributes_string_36, attributes_string_37, attributes_string_38, attributes_string_39) AS sm, mapConcat(attributes_float_0, attributes_float_1, attributes_float_2, attributes_float_3, attributes_float_4, attributes_float_5, attributes_float_6, attributes_float_7, attributes_float_8, attributes_float_9, attributes_float_10, attributes_float_11, attributes_float_12, attributes_float_13, attributes_float_14, attributes_float_15, attributes_float_16, attributes_float_17, attributes_float_18, attributes_float_19, attributes_float_20, attributes_float_21, attributes_float_22, attributes_float_23, attributes_float_24, attributes_float_25, attributes_float_26, attributes_float_27, attributes_float_28, attributes_float_29, attributes_float_30, attributes_float_31, attributes_float_32, attributes_float_33, attributes_float_34, attributes_float_35, attributes_float_36, attributes_float_37, attributes_float_38, attributes_float_39) AS fm
SELECT
  timestamp, trace_id,
  sm['sentry.name'] AS name,
  sm['sentry.metric_type'] AS type,
  sm['sentry._internal.row_kind'] AS row_kind,
  sm['sentry._internal.point_id'] AS point_id,
  fm['sentry.value'] AS value,
  fm['sentry._internal.bucket_lower'] AS lower,
  fm['sentry._internal.bucket_upper'] AS upper,
  attributes_int['sentry._internal.bucket_count'] AS bucket_count,
  fm['sentry._internal.sum_share'] AS sum_share,
  attributes_int['sentry._internal.histogram_count'] AS h_count,
  fm['sentry._internal.histogram_sum'] AS h_sum,
  fm['sentry._internal.histogram_min'] AS h_min,
  fm['sentry._internal.histogram_max'] AS h_max,
  sm['sentry.span_id'] AS span_id,
  sm['cache'] AS cache,
  attributes_int['sentry._internal.start_timestamp_precise'] AS start_ns
FROM default.eap_items_1_local
WHERE project_id = 2 AND item_type = 8 AND timestamp > now() - INTERVAL 30 MINUTE
  AND sm['sentry._internal.source'] = 'otlp'
ORDER BY name, row_kind, lower
FORMAT Vertical
