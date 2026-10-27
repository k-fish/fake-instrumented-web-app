import traceback
from google.protobuf import json_format
from sentry_protos.snuba.v1.endpoint_trace_item_table_pb2 import TraceItemTableRequest
from sentry.utils import snuba_rpc
from datetime import datetime, timedelta, timezone
end = datetime.now(timezone.utc); start = end - timedelta(minutes=15)
q = {'meta': {'organizationId': '1', 'referrer': 'api.auth-token.events', 'projectIds': ['2'], 'startTimestamp': start.isoformat().replace("+00:00","Z"), 'endTimestamp': end.isoformat().replace("+00:00","Z"), 'traceItemType': 'TRACE_ITEM_TYPE_METRIC', 'downsampledStorageConfig': {'mode': 'MODE_NORMAL'}}, 'columns': [{'key': {'type': 'TYPE_STRING', 'name': 'sentry.metric_name'}, 'label': 'metric.name'}, {'key': {'type': 'TYPE_STRING', 'name': 'sentry._internal.row_kind'}, 'label': 'row_kind'}, {'aggregation': {'aggregate': 'FUNCTION_P50', 'key': {'type': 'TYPE_DOUBLE', 'name': 'sentry.value'}, 'label': 'p50(value)', 'extrapolationMode': 'EXTRAPOLATION_MODE_SAMPLE_WEIGHTED'}, 'label': 'p50(value)'}], 'groupBy': [{'type': 'TYPE_STRING', 'name': 'sentry.metric_name'}, {'type': 'TYPE_STRING', 'name': 'sentry._internal.row_kind'}], 'limit': 101, 'pageToken': {'offset': '0'}}
req = json_format.ParseDict(q, TraceItemTableRequest())
try:
    resp = snuba_rpc.table_rpc([req])[0]
    for row in resp.column_values:
        print(row.attribute_name, [ (r.val_double if r.HasField("val_double") else (r.val_str if r.HasField("val_str") else ("NULL" if r.is_null else r))) for r in row.results])
except Exception:
    traceback.print_exc()
