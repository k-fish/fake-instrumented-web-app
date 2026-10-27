"""Side-by-side Sentry (events-stats) vs Prometheus (query_range, rate[1m]) over the same window.

usage: SENTRY_TOKEN=... python3 compare.py <window_minutes> <interval_minutes>"""
import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request

TOKEN = os.environ["SENTRY_TOKEN"]
SENTRY = "http://127.0.0.1:8001/api/0/organizations/sentry/events-stats/"
PROM = "http://localhost:9090/api/v1/query_range"
HIST = "http.server.request.duration"

end = int(time.time()) // 60 * 60 - 120  # skip the still-filling trailing minutes
start = end - int(sys.argv[1]) * 60 if len(sys.argv) > 1 else end - 12 * 60
INTERVAL = int(sys.argv[2]) if len(sys.argv) > 2 else 1
STEP = INTERVAL * 60
end = end // STEP * STEP
start = start // STEP * STEP


def sentry_series(field, metric, mtype, unit, query=""):
    params = [
        ("dataset", "tracemetrics"),
        ("project", "2"),
        ("start", time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(start))),
        ("end", time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(end))),
        ("utc", "true"),
        ("interval", f"{INTERVAL}m"),
        ("query", f"metric.name:{metric} metric.type:{mtype} {query}".strip()),
        ("yAxis", f"{field}(value,{metric},{mtype},{unit})"),
        ("referrer", "api.explore.metrics"),
    ]
    req = urllib.request.Request(SENTRY + "?" + urllib.parse.urlencode(params), headers={"Authorization": f"Bearer {TOKEN}"})
    data = json.loads(urllib.request.urlopen(req).read())
    return {ts: (vals[0]["count"] if vals else None) for ts, vals in data["data"]}


def prom_series(expr):
    # Prometheus range vectors at t cover (t-window, t]; Sentry buckets at t cover [t, t+interval). Shift prom back one step.
    params = {"query": expr.replace("[1m]", f"[{INTERVAL}m]"), "start": start + STEP, "end": end + STEP, "step": STEP}
    data = json.loads(urllib.request.urlopen(PROM + "?" + urllib.parse.urlencode(params)).read())
    result = data["data"]["result"]
    if not result:
        return {}
    return {int(ts) - STEP: float(v) for ts, v in result[0]["values"]}


def compare(label, s_series, p_series, s_q, p_q):
    print(f"\n== {label}")
    print(f"   sentry: {s_q}")
    print(f"   prom:   {p_q}")
    print(f"   {'ts':>20} {'sentry':>12} {'prom':>12} {'diff%':>8}")
    worst = 0.0
    n = 0
    for ts in sorted(set(s_series) & set(p_series)):
        s, p = s_series[ts], p_series[ts]
        if s is None or p != p:  # NaN
            continue
        diff = (s - p) / p * 100 if p else float("nan")
        worst = max(worst, abs(diff)) if diff == diff else worst
        n += 1
        flag = " <-- >5%" if diff == diff and abs(diff) > 5 else ""
        print(f"   {time.strftime('%H:%M', time.gmtime(ts)) + f' (+{INTERVAL}m)':>20} {s:12.3f} {p:12.3f} {diff:8.2f}{flag}")
    print(f"   points={n} worst_abs_diff={worst:.2f}%")


for q in ("p50", "p95", "p99"):
    s_q = f"{q}(value,{HIST},histogram,millisecond)"
    p_q = f"histogram_quantile({q[1:]}/100, sum by (le) (rate(http_server_request_duration_milliseconds_bucket[1m])))"
    p_q = p_q.replace("50/100", "0.50").replace("95/100", "0.95").replace("99/100", "0.99")
    compare(f"explicit histogram {q}", sentry_series(q, HIST, "histogram", "millisecond"), prom_series(p_q), s_q, p_q)

s_q = f"count(value,{HIST},histogram,millisecond)"
p_q = "sum(increase(http_server_request_duration_milliseconds_count[1m]))"
compare("explicit histogram count per minute", sentry_series("count", HIST, "histogram", "millisecond"), prom_series(p_q), s_q, p_q)

s_q = f"avg(value,{HIST},histogram,millisecond)"
p_q = "sum(rate(http_server_request_duration_milliseconds_sum[1m])) / sum(rate(http_server_request_duration_milliseconds_count[1m]))"
compare("explicit histogram avg", sentry_series("avg", HIST, "histogram", "millisecond"), prom_series(p_q), s_q, p_q)

s_q = "sum(value,poc.requests,counter,none)"
p_q = "sum(increase(poc_requests_total[1m]))"
compare("poc.requests per minute", sentry_series("sum", "poc.requests", "counter", "none"), prom_series(p_q), s_q, p_q)

s_q = "avg(value,poc.queue_depth,gauge,none)"
p_q = "avg_over_time(poc_queue_depth[1m])"
compare("poc.queue_depth", sentry_series("avg", "poc.queue_depth", "gauge", "none"), prom_series(p_q), s_q, p_q)
