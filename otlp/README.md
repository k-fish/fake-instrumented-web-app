# OTLP delta metrics + histograms + exemplars — local bench

Local test bench for the Sentry OTLP metrics PoC (branch `poc/metrics/otlp-delta-histograms`
in relay / snuba / sentry) with Prometheus + Grafana as the reference implementation.

Everything in this folder is PoC tooling. No PRs are opened from it.

## Layout

| Path | What |
| --- | --- |
| `app/` | OTel JS producer (one `MeterProvider`, two readers: Sentry DELTA + Prometheus CUMULATIVE), load generator, deterministic fixture sender, small HTTP control API on `:3002` |
| `docker-compose.yml` | Prometheus 3.x (OTLP receiver, exemplar storage, native histograms) on `127.0.0.1:9090`, Grafana on `127.0.0.1:3100` (anonymous admin) |
| `prometheus/prometheus.yml` | OTLP resource-attribute promotion, 30m out-of-order window (so the fixture's back-dated points are accepted) |
| `grafana/` | Provisioned Prometheus datasource (exemplar trace links → local Sentry trace view) and the `otlp-poc` dashboard |
| `relay/config.yml` | Config for running Relay from source on the host, same port/credentials as the devservices container |
| `screenshots/` | Captures from the live comparison |
| `scripts/` | `sentry-devserver.sh`, `snuba-devserver.sh`, `mkproject.py`/`mktoken.py` (run via `sentry exec`), `build_config.py`, `compare.py`, `sq.sh`, `qbench.sh`, `rows.sql`, `rpc_repro.py`, `smoke.envelope` |

The "OTel Metrics" tab in the fake web app (`src/App.jsx`) drives `app/server.mjs`: sync DSN + URLs, start/stop load, send fixture, view status.

## Pinned versions / IDs used in this run

| Thing | Value |
| --- | --- |
| relay | `9755ddb159` poc(otlp): ingest OTLP delta metrics + histograms + exemplars as trace metrics |
| snuba | `465c89d1d` poc(eap): bucket-aware aggregations for OTLP histogram trace metrics, `6b2d2b14e` exemplar-row fix |
| sentry | `4c5611cf6fa` poc(trace-metrics): support OTLP histogram rows + exemplars in Explore metrics, `69189971012` histogram samples tab shows exemplars only |
| Sentry org / project | `sentry` / project id `2` (slug `otlp-poc`) |
| Public key | `0e82f64da02883cd8c307442dbe8cc4f` |
| DSN | `http://0e82f64da02883cd8c307442dbe8cc4f@localhost:8000/2` |
| Relay | `http://127.0.0.1:7899` (also reachable through the devserver proxy on `:8000` for `/api/2/**`) |
| OTLP metrics endpoint | `POST http://127.0.0.1:7899/api/2/integration/otlp/v1/metrics`, header `x-sentry-auth: sentry sentry_key=0e82f64da02883cd8c307442dbe8cc4f` |
| OTLP traces endpoint | `POST http://127.0.0.1:7899/api/2/integration/otlp/v1/traces` |
| Prometheus OTLP | `POST http://localhost:9090/api/v1/otlp/v1/metrics` |
| OTel JS | `@opentelemetry/sdk-metrics` 2.12.0 / exporters 0.223.0 (3.x sdk-metrics is incompatible with sdk-trace-node 2.12) |

## Bring-up

Order matters: devservices → Snuba → Relay → Sentry → compose → producer.

### 0. Branches

```bash
cd ~/repos/relay  && git checkout poc/metrics/otlp-delta-histograms && git submodule update --init
cd ~/repos/snuba  && git checkout poc/metrics/otlp-delta-histograms
cd ~/repos/sentry && git checkout poc/metrics/otlp-delta-histograms && devenv sync   # applies migrations
```

### 1. devservices (sentry repo)

Follows [Running a dependency locally](https://develop.sentry.dev/development-infrastructure/devservices/#running-a-dependency-locally):
toggle snuba and relay to the `local` runtime so devservices stops their containers but keeps
their own dependencies (Kafka, Redis, ClickHouse) up; `--exclude-local` so devservices does not
try to launch them itself (we start them by hand below). Taskbroker is required: Relay project
configs are built by taskworker tasks.

```bash
cd ~/repos/sentry
.venv/bin/devservices toggle snuba local
.venv/bin/devservices toggle relay local
.venv/bin/devservices up --mode taskbroker --exclude-local
```

Revert later with `.venv/bin/devservices toggle snuba containerized` / `toggle relay containerized`.

### 2. Snuba from source

Same command devservices would run for the `local` runtime (`x-programs.devserver` in
`snuba/devservices/config.yml`):

```bash
~/repos/fake-instrumented-web-app/otlp/scripts/snuba-devserver.sh   # api :1218 + rust consumers incl. eap_items
# = cd ~/repos/snuba && PATH=$PWD/.venv/bin:$PATH snuba devserver   (snuba must be on PATH; it re-execs by name)
```

The script exports `SNUBA_OTLP_HISTOGRAM_POINTS_PER_BUCKET=10` (k-points mode, needed for heatmaps —
see "k-points mode" below). Set it to `0` for the exact rank + interpolation path.

### 3. Relay from source

Per [relay/README.md "Usage with Sentry"](https://github.com/getsentry/relay#usage-with-sentry):
build with `--all-features` (processing mode) and point a config dir at the Sentry devserver.
`relay/config.yml` is the devservices container config (`relay/devservices/config/relay.yml`)
with container hostnames swapped for loopback: upstream `127.0.0.1:8001` (the backend, not the
webpack proxy on `:8000`), Kafka `127.0.0.1:9092`, Redis `127.0.0.1:6379`, port `7899`,
processing enabled. The credentials are the same dev credentials the container uses, so the
relay id is already registered with the devserver.

```bash
cd ~/repos/relay
export CPATH=/opt/homebrew/include LIBRARY_PATH=/opt/homebrew/lib   # macOS/homebrew
cargo build --all-features                                           # ~15 min cold
cp devservices/config/devservices-credentials.json \
   ~/repos/fake-instrumented-web-app/otlp/relay/credentials.json     # gitignored
./target/debug/relay run --config ~/repos/fake-instrumented-web-app/otlp/relay
# equivalent: cargo run --all-features -- run --config ~/repos/fake-instrumented-web-app/otlp/relay
```

### 4. Sentry devserver

`~/.sentry/sentry.conf.py` already has `SENTRY_USE_RELAY = True` and all
`tracemetrics-*` / `visibility-explore*` flags enabled.

```bash
~/repos/fake-instrumented-web-app/otlp/scripts/sentry-devserver.sh   # UI :8000, backend :8001
# = cd ~/repos/sentry && source .venv/bin/activate && PATH=$PWD/.devenv/bin:$PATH sentry devserver --workers
```

The script wraps the devserver in a restart loop: in `--workers` mode honcho stops *every* process
when any one exits, and `process-spans` exits on a Kafka `_MAX_POLL_EXCEEDED` whenever the machine
is briefly busy (cargo build, Snuba restart). That took the whole stack down three times during
the PoC.

Create the project + key (once), and build the Relay project config synchronously
(workaround: the taskworker gRPC client stayed in backoff against taskbroker, so the
`build_project_config` task never ran and Relay logged
`error fetching project state … deadline exceeded pending`):

```bash
sentry exec ~/repos/fake-instrumented-web-app/otlp/scripts/mkproject.py   # prints PROJECT / PUBLIC_KEY / DSN
sentry exec ~/repos/fake-instrumented-web-app/otlp/scripts/mktoken.py     # API token for the query scripts (export SENTRY_TOKEN=...)
sentry exec - <<'EOF'
from sentry.tasks.relay import build_project_config
build_project_config(public_key="0e82f64da02883cd8c307442dbe8cc4f")
EOF
```

Smoke test (plain error envelope through Relay):

```bash
curl -s -X POST http://127.0.0.1:7899/api/2/envelope/ \
  -H 'x-sentry-auth: sentry sentry_key=0e82f64da02883cd8c307442dbe8cc4f' \
  --data-binary @otlp/scripts/smoke.envelope
```

### 5. Prometheus + Grafana

```bash
cd ~/repos/fake-instrumented-web-app/otlp && docker compose up -d
# Prometheus http://127.0.0.1:9090   Grafana http://127.0.0.1:3100/d/otlp-poc
```

Note: `--enable-feature=native-histograms` logs a "no-op" warning on Prometheus 3.x; native
histograms are on by default and the exponential variant does ingest.

### 6. Producer + fake app

```bash
cd ~/repos/fake-instrumented-web-app
npm --prefix otlp/app install
npm run dev            # vite :3000 + api :3001 + otlp producer :3002
```

Open `http://localhost:3000/?dsn=http://0e82f64da02883cd8c307442dbe8cc4f@localhost:8000/2&nickname=otlp-poc`
(the `?dsn=` param is saved to the DSN list and selected), then the **OTel Metrics** tab:
set Relay URL `http://127.0.0.1:7899`, Prometheus URL `http://localhost:9090`, **SYNC DSN + URLS**.

Headless equivalents:

```bash
curl -s localhost:3002/otlp/status
curl -s -X POST localhost:3002/otlp/config -H 'content-type: application/json' \
  -d '{"dsn":"http://0e82f64da02883cd8c307442dbe8cc4f@localhost:8000/2","relayUrl":"http://127.0.0.1:7899","prometheusUrl":"http://localhost:9090"}'
curl -s -X POST localhost:3002/otlp/load/start -d '{"requestsPerSecond":20}' -H 'content-type: application/json'
curl -s -X POST localhost:3002/otlp/load/stop
curl -s -X POST localhost:3002/otlp/fixture          # or: npm run otlp:fixture
```

## What the producer emits

Single `MeterProvider`, two `PeriodicExportingMetricReader`s (10s):

- Sentry reader: `OTLPMetricExporter` (http/json) → Relay, `temporalityPreference: DELTA`
- Prometheus reader: `OTLPMetricExporter` → Prometheus OTLP receiver, `CUMULATIVE`

Instruments (`app/load.mjs`):

| Instrument | OTel kind | Sentry name / type | Prometheus name |
| --- | --- | --- | --- |
| `poc.requests` | Counter | `poc.requests` / counter | `poc_requests_total` |
| `poc.queue_depth` | ObservableGauge | `poc.queue_depth` / gauge | `poc_queue_depth` |
| `http.server.request.duration` (ms, explicit bounds) | Histogram | `http.server.request.duration` / histogram | `http_server_request_duration_milliseconds_{bucket,count,sum}` |
| `http.server.request.duration.exp` (View → exponential histogram) | Histogram | `http.server.request.duration.exp` / histogram | `http_server_request_duration_exp_milliseconds` (native histogram) |

Explicit bounds come from `config.explicitBuckets`: `16` = the OTel SDK default layout, `32`
(default) = a denser log-spaced 1-2-3-5-7.5 layout up to 30 s (`BOUNDS_32` in `otel.mjs`). Relay
has no cap on explicit buckets; exponential histograms are downscaled to ≤ 64 populated buckets
per side (`MAX_EXPONENTIAL_BUCKETS` in `relay-server/.../integrations/otel.rs`).

Durations are log-normal per route (medians 60 / 300 / 1200 ms for `/api/users`, `/api/search`,
`/api/checkout`) plus a 3% "cache miss" tail uniform in (2500, 7500], so 27 of the 32 buckets are
populated. The earlier bimodal shape (94% in (0, 5], 6% in (2500, 5000]) is kept in the fixture.
`config.requestsPerSecond` and `exportIntervalMillis` control row volume (200 rps at a 1 s export
≈ 180 rows/s across both histograms). Each record happens inside a span exported to Relay via OTLP
traces.

**Exemplars:** the OTel JS SDK (sdk-metrics 2.12) does not emit exemplars — `ExemplarFilter`/
`ExemplarReservoir` exist in source but no reservoir is wired into the aggregators, and
`@opentelemetry/otlp-transformer` never serializes `exemplars`. `app/exemplars.mjs` works around
this: `load.mjs` offers every histogram recording (value + active span) to a small per-series
reservoir (keeps up to 4 per export interval, biased to the largest value), and
`ExemplarInjectingExporter` serializes the SDK's `ResourceMetrics` with the stock JSON transformer,
splices the pending exemplars into the matching histogram data points, and POSTs the JSON to
Relay / Prometheus. Both exporters (DELTA → Relay, CUMULATIVE → Prometheus) share one reservoir so
both sides see the same exemplars. `/otlp/status` reports `exemplars.offered/kept`.

## Fixture (`app/fixture.mjs`)

One explicit-bucket delta histogram point (default bounds) with:

- bucket (0,5]: 9400 samples, (2500,5000]: 600 samples → count 10000, sum 1 569 400
- 2 exemplars (one per populated bucket) with trace/span ids that are also sent as spans
- delta counter `poc.fixture.counter` = 42
- cumulative counter `poc.fixture.cumulative` = 7 (must be dropped by Relay)

Prometheus gets the cumulative equivalent (zero point + full point) so both sides see identical data.

Expected vs observed, Sentry (`/api/0/organizations/sentry/events/?dataset=tracemetrics`, fields
`<agg>(value,http.server.request.duration,histogram,millisecond)`):

| Aggregate | Expected | Sentry | Prometheus |
| --- | --- | --- | --- |
| count | 10000 | 10000 | 10000 |
| sum | 1569400 | 1569400 | 1569400 |
| avg | 156.94 | 156.94 | 156.94 |
| p50 | ≈2.66 | 2.6596 | 2.6596 |
| p95 | ≈2916.7 | 2916.67 | 2916.67 |
| p99 | ≈4583.3 | 4583.33 | 4583.33 |
| min / max | 0 / 5000 | 0 / 5000 | — |
| samples rows | 4 (2 bucket + 2 exemplar, same `point_id`) | 4 | — |
| `poc.fixture.counter` sum | 42 | 42 | 42 |
| `poc.fixture.cumulative` | dropped | not present | 7 |

ClickHouse raw rows (attributes live in 40 string/float maps; concat them):

```sql
WITH mapConcat(attributes_string_0, …, attributes_string_39) AS sm,
     mapConcat(attributes_float_0, …, attributes_float_39) AS fm
SELECT timestamp, trace_id,
  sm['sentry.metric_name'] AS name, sm['sentry.metric_type'] AS type,
  sm['sentry._internal.row_kind'] AS row_kind, sm['sentry._internal.point_id'] AS point_id,
  fm['sentry.value'] AS value,
  fm['sentry._internal.bucket_lower'] AS lower, fm['sentry._internal.bucket_upper'] AS upper,
  attributes_int['sentry._internal.bucket_count'] AS bucket_count,
  fm['sentry._internal.sum_share'] AS sum_share,
  attributes_int['sentry._internal.histogram_count'] AS h_count,
  fm['sentry._internal.histogram_sum'] AS h_sum
FROM default.eap_items_1_local
WHERE project_id = 2 AND item_type = 8 AND sm['sentry._internal.source'] = 'otlp'
  AND timestamp > now() - INTERVAL 30 MINUTE
ORDER BY name, row_kind, lower FORMAT Vertical
```

Full query: `scripts/rows.sql`; run with
`docker exec -i snuba-clickhouse-1 clickhouse-client < scripts/rows.sql`.

## Live comparison

Screenshots in `screenshots/`: Sentry Explore (p50/p95/p99, all three metrics, samples tab showing
exemplars with trace links — `sentry-samples-exemplars.png` — and its empty state when a histogram has
none — `sentry-samples-no-exemplars.png`), the histogram heatmap (`sentry-histogram-heatmap.png`,
k-points mode), Grafana dashboard, Prometheus p95, fake-app OTel tab.
Older screenshots still show the first UI iteration (Row Kind / Point ID columns, "Exemplars only"
toggle); see FIXES.md "Samples tab = exemplars" for why that was dropped.

## k-points mode (heatmaps)

`SNUBA_OTLP_HISTOGRAM_POINTS_PER_BUCKET=k` (default 0) switches Snuba from "exact rank in merged
buckets + interpolate" to expanding every bucket row into `k` evenly spaced points with
`arrayJoin(range(k))` before aggregating: point `i` has value `lower + (upper-lower)·(i+0.5)/k` and
weight `bucket_count/k`; plain and exemplar rows keep only `i = 0`. Everything then runs on the
expanded value: `count`/`sum`/`avg` as weighted sums, percentiles as
`quantileTDigestWeighted(q)(value, round(weight·1000))`, and any filter on `sentry.value` — which is
what the heatmap endpoint's `count_if(value >= lo AND value < hi)` cells are — is rewritten onto
the expanded value. Sentry's `doesMetricSupportHeatMapVisualization` allows `histogram`, so the
Heatmap chart type shows up and each bucket's count is spread evenly over the y-cells it covers.

Measured at k = 10:

- Fixture alone (`sq.sh … 10m "http.route:/fixture"`): count 10 000, sum 1 569 400, p50/p95/p99 =
  2.6596 / 2916.67 / 4583.33 — identical to interpolation mode, because a uniform lattice with
  t-digest's linear interpolation between neighbouring centroids *is* uniform interpolation.
  `count` stays an integer (weights are rounded back after summing).
- Heatmap on the fixture (`events-heatmap`, `yBuckets=10`): 9400 in the 0–500 cell and 120 in each
  of the five 500 ms cells from 2500 to 5000 (600 spread evenly). Interpolation mode would put all
  600 in the 3500–4000 cell because `sentry.value` is the bucket midpoint.
- Live load, 30 m, ~28 k observations across many points: p50/p95/p99 = 2.75 / 2978.8 / 4625 vs
  2.66 / 2917 / 4583. Once the t-digest compresses centroids the answers snap to the point
  lattice (`bucket_width/k`: 0.5 ms in (0,5], 250 ms in (2500,5000]). Raise k to shrink that.
- `arrayJoin` multiplies every row in the SELECT, not just the aggregate; the hidden count column
  and the exemplar exclusion are rewritten too (`aggregation.py::get_count_column`). Identical
  `arrayJoin` expressions are CSE'd by ClickHouse so one query pays k× once, not per aggregate.

### Query cost: k-points vs merged-bucket rank

`scripts/qbench.sh <label> 10m 5` runs the three Explore shapes against the 32-bucket histogram
(aggregate table with count/sum/avg/p50/p95/p99/min/max, p95 timeseries at 1 m, heatmap at 1 m ×
20 y-cells — the heatmap is two ClickHouse queries per request) and reads ClickHouse
`system.query_log`. 10 m window ≈ 95 k observations, ~100 k–120 k EAP rows scanned per query
(bucket + exemplar rows of both histograms; the window drifts between runs because load keeps
coming in). Single local ClickHouse, warm cache, numbers are avg / max of 5 requests:

| mode | table ms | table mem | timeseries ms | timeseries mem | heatmap ms (per query) | heatmap mem |
| --- | --- | --- | --- | --- | --- | --- |
| k = 0 (rank + interpolate) | 494–594 / 1077 | 42 MiB | 221–275 / 388 | 17 MiB | 124–155 / 291 | 15 MiB |
| k = 10 | 206–298 / 387 | 17–19 MiB | 141–150 / 197 | 17–20 MiB | 442–756 / 3065 | 30–32 MiB (max 62) |
| k = 32 | 418–486 / 810 | 23–27 MiB | 242–298 / 362 | 29–32 MiB | 1097–1221 / 2933 | 49–55 MiB (max 106) |

- The aggregate table is *faster* at k = 10 than in rank mode: `sumMap` keyed by `(lower, upper)`
  plus `arrayCumSum` per percentile is heavier than one weighted t-digest over 10× rows, and
  uses 2× the memory. At k = 32 the two are even.
- The timeseries (one percentile) is roughly a wash at k = 10 and ~10–20% slower at k = 32.
- The heatmap is where k shows: 3–4× slower at k = 10 and ~8× at k = 32, because 20 y-cells ×
  `count_if` each evaluate the expanded value, and memory scales with k. In rank mode the heatmap
  is cheap but wrong (a bucket's whole count lands in the cell holding its midpoint).
- Accuracy on this data (10 m, 32-bucket layout): p50 / p95 / p99 = 188.3 / 2927 / 6175 at k = 0,
  187.5 / 2943 / 6126 at k = 10, 187.9 / 2943 / 6187 at k = 32 — all within 1%, which is well
  inside what the bucket layout itself can resolve.

Load at 20 req/s from 17:11 UTC. `scripts/compare.py` (`SENTRY_TOKEN=… python3 scripts/compare.py 15 5`) pulls Sentry `events-stats`
(`interval=Nm`) and Prometheus `query_range` (`step=Nm`, range vectors `[Nm]`) over the same window.
Prometheus range vectors at `t` cover `(t−N, t]` while Sentry buckets at `t` cover `[t, t+N)`, so the
Prometheus series is shifted back one step before comparing.

Queries:

| Series | Sentry (`events-stats`, dataset `tracemetrics`) | Prometheus |
| --- | --- | --- |
| p50/p95/p99 | `pNN(value,http.server.request.duration,histogram,millisecond)` | `histogram_quantile(0.NN, sum by (le) (rate(http_server_request_duration_milliseconds_bucket[Nm])))` |
| count | `count(value,http.server.request.duration,histogram,millisecond)` | `sum(increase(http_server_request_duration_milliseconds_count[Nm]))` |
| avg | `avg(value,…,histogram,millisecond)` | `sum(rate(…_sum[Nm])) / sum(rate(…_count[Nm]))` |
| requests | `sum(value,poc.requests,counter,none)` | `sum(increase(poc_requests_total[Nm]))` |
| queue depth | `avg(value,poc.queue_depth,gauge,none)` | `avg_over_time(poc_queue_depth[Nm])` |
| exp. histogram | `p95(value,http.server.request.duration.exp,histogram,millisecond)` | `histogram_quantile(0.95, sum(rate(http_server_request_duration_exp_milliseconds[Nm])))` |

Results, 5m interval (17:15–17:40 UTC, 5 points), worst abs diff across points:

| Series | worst diff |
| --- | --- |
| p50 | 0.08% |
| p95 | 0.99% |
| p99 | 0.12% |
| count | 3.47% |
| avg | 1.25% |
| poc.requests | 3.47% |
| poc.queue_depth | 2.12% |

Totals at a fixed end time (17:11–17:26 UTC): Sentry count 16402 / Prometheus 16403; `poc.requests`
16402 / 16403 — one export point on the boundary.

At 1m interval the same series disagree by up to ~17% on count and ~19% on p95/avg on individual
minutes. This is not an aggregation bug: with a 10s export period there are only 6 delta points per
minute, so one point landing on either side of a minute boundary moves a 1m bucket by ~17%, and
Prometheus' `rate()`/`increase()` extrapolation does the same on its side. Percentiles converge once
the window is ≥5m (p50/p99 agree <1% even at 1m since they sit inside wide, well-populated buckets;
p95 sits in the 6% tail and is noisy per minute on both sides).

## Bugs found in the PoC branches

See [`FIXES.md`](FIXES.md) for the full list, status and commits.

1. **snuba** — percentile over a group with only exemplar rows returned HTTP 500
   (`aggregation.py:310`, `NoneType - float`). Fixed in `6b2d2b14e` on the snuba PoC branch.

Also seen (pre-existing, not PoC code): a Relay **debug-build** assertion in
`relay-server/src/managed/managed.rs:949` (`New item has 2 items in category 'session' …`) on
session envelopes from the fake app's main DSN; the envelope is dropped, Relay keeps running.
A `--release` build does not have the check.

Not bugs after all (earlier notes were wrong):

- Sentry `max`/`min` for histograms "reporting bucket bounds": Relay clamps the lowest/highest
  bucket to the point's `min`/`max` (`otel.rs` `clamp_lower`/`clamp_upper`), so the bounds *are*
  the observed min/max whenever the SDK sends them. The `5000` came from the fixture, whose
  payload has no min/max.
- Point ID click adding a "Clear point filter" chip instead of a `point_id:` search term is the
  PoC's intended UI (tooltip "Show all rows of this point").

## Workarounds in this setup (not product changes)

- `build_project_config(public_key=…)` run synchronously via `sentry exec` because the taskworker
  never picked the task up from taskbroker in this devenv.
- Relay runs with the devservices container's `credentials.json` so the already-registered relay id
  is reused; upstream pinned to `:8001` to bypass the webpack proxy.
- OTel JS deps pinned to the 2.12 / 0.223 line in a separate `otlp/app/package.json` because the
  app's `@sentry/node` 10.x pins conflicting OTel versions.
- `AggregationTemporalityPreference` imported from `exporter-metrics-otlp-http` (the proto exporter
  does not re-export it in 0.223).
- Prometheus `out_of_order_time_window: 30m` so the back-dated fixture points are accepted.

## Observed limitations

- Prometheus 3.x's new `/query` UI has no "show exemplars" toggle (the old `g0.show_exemplars`
  param is ignored); exemplars are only visible via `/api/v1/query_exemplars` or Grafana.
- Live exemplars need the custom exporter in `app/exemplars.mjs` (see above); the stock OTel JS
  exporter sends none.
- Explicit-bucket percentiles are linear interpolation inside the bucket on both sides; a histogram
  whose tail falls in the (2500,5000] bucket gives p95 ≈ 2917 for both, not the true p95 of the
  underlying uniform tail (~4583 would be p99).
- Summary and cumulative Sum/Histogram points are dropped by Relay by design; Prometheus keeps them.
- Sentry `min`/`max` for histograms are bucket bounds; exact only when the SDK sends `min`/`max`
  on the point (OTel JS does; the hand-built fixture does not).
- Exponential histogram: 30m p95 Sentry 2940.1 vs Prometheus native histogram 2941.5 (0.05%).
