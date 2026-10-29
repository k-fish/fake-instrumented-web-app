#!/bin/bash
# usage: qbench.sh <label> [period=15m] [iterations=5]
# Runs the three Explore query shapes (aggregate table, p95 timeseries, heatmap)
# against the histogram metric via the Sentry API and reports what ClickHouse
# recorded for them in system.query_log. Run once per Snuba mode (e.g. k=0 vs
# SNUBA_OTLP_HISTOGRAM_POINTS_PER_BUCKET=10) and compare the tables.
set -u
TOKEN=${SENTRY_TOKEN:?set SENTRY_TOKEN (see mktoken.py)}
LABEL=$1; P=${2:-15m}; N=${3:-5}
M=http.server.request.duration; T=histogram; U=millisecond
API=http://127.0.0.1:8001/api/0/organizations/sentry
CH="docker exec -i snuba-clickhouse-1 clickhouse-client"
common=(-H "Authorization: Bearer $TOKEN" --data-urlencode "dataset=tracemetrics" --data-urlencode "project=2"
  --data-urlencode "query=metric.name:$M metric.type:$T" --data-urlencode "referrer=api.explore.metrics")

# Snuba's readthrough cache is keyed on the SQL and the table/heatmap shapes
# round the window to the minute, so shift it by one minute per iteration to
# force a real ClickHouse query each time.
window() {
  python3 - "$P" "$1" <<'EOF'
import sys, datetime as dt, re
m = re.fullmatch(r"(\d+)([smhd])", sys.argv[1]); n, u = int(m[1]), m[2]
secs = n * {"s": 1, "m": 60, "h": 3600, "d": 86400}[u]
end = dt.datetime.now(dt.UTC).replace(microsecond=0) - dt.timedelta(seconds=int(sys.argv[2]))
start = end - dt.timedelta(seconds=secs)
print(start.strftime("%Y-%m-%dT%H:%M:%S"), end.strftime("%Y-%m-%dT%H:%M:%S"))
EOF
}

run_shape() {
  local name=$1; shift
  local start; start=$($CH -q "SELECT now64(3)")
  for i in $(seq "$N"); do
    read -r s e < <(window $((i * 60)))
    curl -s -G "$@" --data-urlencode "start=$s" --data-urlencode "end=$e" -o /dev/null
  done
  $CH -q "SYSTEM FLUSH LOGS" >/dev/null
  $CH -q "SELECT '$LABEL' AS mode, '$name' AS shape, count() AS queries,
      round(avg(query_duration_ms)) AS avg_ms, max(query_duration_ms) AS max_ms,
      round(avg(read_rows)) AS read_rows, formatReadableSize(avg(memory_usage)) AS avg_mem,
      formatReadableSize(max(memory_usage)) AS max_mem,
      round(avg(ProfileEvents['SelectedRows'])) AS selected_rows
    FROM system.query_log
    WHERE type = 'QueryFinish' AND event_time_microseconds >= toDateTime64('$start', 3)
      AND query LIKE 'SELECT%eap_items%' AND query NOT LIKE '%system.query_log%'
    FORMAT PrettyCompactNoEscapes"
}

table=("${common[@]}")
for f in count sum avg p50 p95 p99 min max; do table+=(--data-urlencode "field=$f(value,$M,$T,$U)"); done
run_shape table "$API/events/" "${table[@]}"

run_shape timeseries "$API/events-timeseries/" "${common[@]}" --data-urlencode "interval=1m" \
  --data-urlencode "yAxis=p95(value,$M,$T,$U)"

run_shape heatmap "$API/events-heatmap/" "${common[@]}" --data-urlencode "interval=1m" \
  --data-urlencode "xAxis=time" --data-urlencode "yAxis=value" --data-urlencode "zAxis=count()" \
  --data-urlencode "yBuckets=20"
