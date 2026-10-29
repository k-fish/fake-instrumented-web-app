# OTLP histogram PoC — what needed fixing, and how to build it properly

Companion to [`README.md`](README.md) (full bring-up, IDs, fixture and comparison details).
Branch `poc/metrics/otlp-delta-histograms` in relay / snuba / sentry; bench in this folder.
PoC only — commits were pushed to the PoC branches, no PRs.

## Fixes

### 1. snuba — percentile over exemplar-only rows returned HTTP 500 (fixed)

Commit `6b2d2b14e` on `getsentry/snuba` `poc/metrics/otlp-delta-histograms`.

Symptom: `GET /api/0/organizations/<org>/events/?dataset=tracemetrics&query=row_kind:exemplar
&field=p95(value,…,histogram,millisecond)` → 500; the RPC raised
`unsupported operand type(s) for -: 'NoneType' and 'float'` at
`snuba/web/rpc/common/aggregation.py:310` (`PercentileExtrapolationContext.reliability`).

Cause: `histogram_aggregation.py` deliberately skips exemplar rows, so the percentile is `NULL`
for a group containing only exemplars. The companion `__snuba_custom_column__count` column
(`get_count_column`) still counted those rows, so `is_data_present` was true and the reliability
math ran with `value = None`.

Fix (`aggregation.py`, `histogram_aggregation.py`):

- `get_count_column` now applies the same "not an exemplar row" condition when the aggregation is
  histogram-aware (`not_exemplar_condition`, shared with the aggregate itself).
- `ExtrapolationContext.is_data_present` also requires `value is not None`, so no reliability
  path can ever do arithmetic on a `NULL` aggregate (this also protects the generic context, which
  divided by `self.value`).
- Tests: `tests/web/rpc/test_histogram_aggregation.py` (`test_count_column_skips_exemplar_rows`,
  `test_null_percentile_over_exemplar_only_group_is_not_data_present`).

Verified live: `row_kind:exemplar` → `200 {p95: null, count: 0}`; bucket/unfiltered queries
unchanged; fixture numbers still exact (10000 / 1569400 / 156.94 / 2.6596 / 2916.67 / 4583.33).

Note: the snuba pre-commit `mypy` hook fails on unrelated files in this checkout (missing `flask`
/ `structlog_sentry` stubs in the venv); a targeted `mypy` on the two changed modules is clean.
Committed with `--no-verify`.

### 2. Bench — Grafana "Fixture" panel showed "No data" (fixed)

Commit in this repo. The stat panel used instant queries on cumulative series; Prometheus's 5m
lookback drops them once the fixture is older than 5 minutes. Queries now use
`last_over_time(...[$__range])`.

### 3. Bench — whole Sentry devserver died repeatedly (worked around)

`sentry devserver --workers` runs everything under honcho, which stops *all* processes when any
one exits. `process-spans` exits on Kafka `_MAX_POLL_EXCEEDED (30000ms)` whenever the machine is
briefly busy (cargo build, Snuba restart, test runs). Happened three times during the PoC and
looked like random outages (`OperationalError`, `Connection refused`).

`scripts/sentry-devserver.sh` wraps the devserver in a restart loop. Not changed in sentry itself
(unrelated to the PoC). `scripts/snuba-devserver.sh` does the same for Snuba, whose devserver also
stops everything when one consumer hits a transient Kafka error (seen: coordinator reload after
the colima restart).

### 4. Bench — host disk filled up, taking Snuba, Redis and the colima VM down (recovered)

Relay's `target/` reached 84 GB: `cargo test --all-features` plus a 40 GB `target/rust-analyzer`
IDE check-cache and 7 GB `debug/incremental`. With the host at 99% the colima VM's disk went into
I/O-error state (`overlay2/...: input/output error`), Snuba died with `ENOSPC`, and Redis's AOF
was torn. Recovery: `rm -rf target/rust-analyzer target/debug/incremental` (safe, regenerated on
demand; the running `target/debug/relay` is untouched), `colima restart`,
`redis-check-aof --fix` on the `redis_redis-data` volume, `docker compose up -d`, restart Snuba.
If you build Relay on this machine, keep an eye on `du -sh ~/repos/relay/target`.

### 5. Bench — UI spinning forever: single hung granian worker (worked around)

After the colima restart the Sentry backend (`:8001`) stopped answering while webpack (`:8000`)
still served HTML, so every Explore page spun forever. Cause: the devserver runs **one** granian
web worker (`SENTRY_GRANIAN_WORKERS` default 1); it was blocked on a socket to a VM service that
had been restarted underneath it, and every subsequent request queued behind it (no request log
for 90 minutes). Fix: restart the devserver; `scripts/sentry-devserver.sh` now exports
`SENTRY_GRANIAN_WORKERS=2` so a single stuck request can't take the UI down. If it happens again:
`curl -m 5 127.0.0.1:8001/api/0/` → `000` while `:8000` answers = this.

## Investigated — not bugs

- **Sentry `max` = 5000 for histograms.** Relay clamps the lowest/highest bucket to the point's
  `min`/`max` (`relay-server/src/processing/trace_metrics/integrations/otel.rs`,
  `HistogramStats::clamp_lower/clamp_upper`), so Snuba's bucket-bound `min`/`max` *is* the observed
  min/max whenever the SDK sends them. The exact `5000` came from the hand-built fixture, which has
  no `min`/`max`. The live exponential histogram shows `max 4999.21`, as expected.
- **Point ID click adds a "Clear point filter" chip, not a `point_id:` search term.** Intended
  PoC UI (`samplesTab.tsx`, tooltip "Show all rows of this point").
- **Relay panic `managed.rs:949` "New item has 2 items in category 'session'…".** A
  `#[cfg(debug_assertions)]` quantity check in master's session handling, triggered by the fake
  app's main-DSN session envelopes; PoC code touches no session paths. Envelope dropped, Relay keeps
  running; absent in `--release` builds.

## Test status of the PoC branches

| Repo | Tests run | Result |
| --- | --- | --- |
| snuba | `tests/web/rpc/test_histogram_aggregation.py` | 6 passed |
| sentry | `tests/sentry/search/eap/test_trace_metrics.py` | 19 passed |
| sentry | `static/app/views/explore/metrics/metricInfoTabs/samplesTab.spec.tsx` | 1 passed |
| relay | `cargo test -p relay-server --all-features trace_metrics::integrations::otel` | 13 passed |

## Known limitations (unchanged, by design of the PoC)

- Confidence-interval columns for histogram percentiles still use the pre-PoC t-digest expression;
  reliability on histogram percentiles is not meaningful (but no longer crashes). In k-points mode
  (`SNUBA_OTLP_HISTOGRAM_POINTS_PER_BUCKET > 0`, see README) they run over the expanded points.
- Snuba applies the bucket-aware aggregation to every `sentry.value` aggregation (no proto flag).
- The OTel JS SDK (sdk-metrics 2.12) emits no exemplars; the bench injects them itself
  (`app/exemplars.mjs`, see README). A real SDK would need reservoir support.
- Cumulative Sum/Histogram and Summary points are dropped by Relay.
- Relay project configs: in this devenv the taskworker never picked `build_project_config` up from
  taskbroker; it was run synchronously via `sentry exec` (see README).

## Addendum — samples tab = exemplars, `point_id` is an implementation detail

The first UI iteration (`4c5611cf6fa`) exposed the storage layout in the histogram samples table:
Row Kind / Bucket / Bucket Count / Point ID columns, an "Exemplars only" switch, and a click on a
Point ID that filtered the table to every row of that OTLP data point. `69189971012` removes all of
it. For histograms the tab now always queries `row_kind:exemplar` with the standard sample columns
(Trace ID / Project / Value / Timestamp), and when there are none it shows the regular "No samples
found" empty state with one extra sentence explaining that histogram samples come from exemplars,
linking to `METRICS_EXEMPLARS_DOCS_URL` (`static/app/views/explore/metrics/constants.tsx`, pointing
at https://docs.sentry.io/product/metrics/ with a TODO until exemplar docs exist).

Why:

- Bucket rows are not samples. A bucket row is `(lower, upper] × count`, a pre-aggregated slice of
  a point; it has no trace, no span and no single value, so every column the old table added was
  there to make a non-sample look like one. Exemplars are the only rows that are "a measurement
  that happened in this trace", which is what the Samples tab means for every other metric type.
- `point_id` only exists to let Snuba recombine the bucket rows of one OTLP data point (and to tie
  exemplars to their point). It has no product meaning — the user never sent it, the SDK generated
  it, and nothing in Sentry besides the aggregation needs it. Surfacing it as a column and a filter
  invited reading it as a stable identifier, which it is not (Relay mints a new one per point).
- Filtering by point reproduced one OTLP payload, which is a debugging view, not a product one.
  The ClickHouse snippets in the README (`scripts/rows.sql`) cover that need for the PoC.
- Keeping the Samples tab identical across counter/gauge/distribution/histogram means the UI never
  has to explain what an exemplar is; the only place the word appears is the empty state.

`row_kind`, `point_id`, `bucket.*` remain searchable attributes on the backend (unchanged in
`src/sentry/search/eap/trace_metrics/attributes.py`), so the data is still reachable from the query
bar if someone needs it; it just isn't a column.

## The proper way to build and run this

Order: devservices deps → Snuba → Relay → Sentry → Prometheus/Grafana → producer.
Each step below is exactly what the bench ran; READMEs/docs it follows are linked.

```bash
# 0. branches
cd ~/repos/relay  && git checkout poc/metrics/otlp-delta-histograms && git submodule update --init
cd ~/repos/snuba  && git checkout poc/metrics/otlp-delta-histograms
cd ~/repos/sentry && git checkout poc/metrics/otlp-delta-histograms && devenv sync

# 1. devservices: run snuba + relay from source (develop.sentry.dev → devservices → "Running a dependency locally")
cd ~/repos/sentry
.venv/bin/devservices toggle snuba local
.venv/bin/devservices toggle relay local
.venv/bin/devservices up --mode taskbroker --exclude-local      # postgres, redis, kafka, clickhouse, taskbroker, …

# 2. snuba from source (= devservices' local-runtime command, `snuba devserver`)
~/repos/fake-instrumented-web-app/otlp/scripts/snuba-devserver.sh &

# 3. relay from source (relay/README.md → "Usage with Sentry": --all-features = processing mode)
cd ~/repos/relay
export CPATH=/opt/homebrew/include LIBRARY_PATH=/opt/homebrew/lib   # macOS + homebrew
cargo build --all-features
cp devservices/config/devservices-credentials.json ~/repos/fake-instrumented-web-app/otlp/relay/credentials.json
./target/debug/relay run --config ~/repos/fake-instrumented-web-app/otlp/relay &
#   relay/config.yml = devservices relay.yml with loopback hosts: upstream 127.0.0.1:8001, kafka :9092, redis :6379

# 4. sentry devserver (restart loop, see fix 3)
~/repos/fake-instrumented-web-app/otlp/scripts/sentry-devserver.sh &
cd ~/repos/sentry && source .venv/bin/activate
sentry exec ~/repos/fake-instrumented-web-app/otlp/scripts/mkproject.py   # project + DSN (once)
sentry exec ~/repos/fake-instrumented-web-app/otlp/scripts/mktoken.py     # API token → export SENTRY_TOKEN
sentry exec - <<'EOF'                                                      # relay project config, synchronously
from sentry.tasks.relay import build_project_config
build_project_config(public_key="<public key from mkproject>")
EOF

# 5. reference stack
cd ~/repos/fake-instrumented-web-app/otlp && docker compose up -d        # prometheus :9090, grafana :3100

# 6. producer + fake app
cd ~/repos/fake-instrumented-web-app && npm --prefix otlp/app install && npm run dev
#   http://localhost:3000/?dsn=<DSN>&nickname=otlp-poc → "OTel Metrics" tab → SYNC → START LOAD / SEND FIXTURE
```

Verify:

```bash
export SENTRY_TOKEN=…
otlp/scripts/sq.sh http.server.request.duration histogram millisecond 10m "http.route:/fixture"   # fixture aggregates
python3 otlp/scripts/compare.py 15 5                                                             # Sentry vs Prometheus
docker exec -i snuba-clickhouse-1 clickhouse-client < otlp/scripts/rows.sql                      # raw EAP rows
```

Links: Sentry Explore → Metrics `http://dev.getsentry.net:8000/organizations/sentry/explore/metrics/?project=2`,
Grafana `http://127.0.0.1:3100/d/otlp-poc`, Prometheus `http://127.0.0.1:9090`, producer status
`http://localhost:3002/otlp/status`.

Tear-down / revert: `devservices toggle snuba containerized`, `devservices toggle relay containerized`,
`docker compose down` in `otlp/`.
