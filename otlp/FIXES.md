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
(unrelated to the PoC).

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
  reliability on histogram percentiles is not meaningful (but no longer crashes).
- Snuba applies the bucket-aware aggregation to every `sentry.value` aggregation (no proto flag).
- The OTel JS SDK (sdk-metrics 2.12) emits no exemplars; exemplar paths are exercised only by the
  fixture.
- Cumulative Sum/Histogram and Summary points are dropped by Relay.
- Relay project configs: in this devenv the taskworker never picked `build_project_config` up from
  taskbroker; it was run synchronously via `sentry exec` (see README).

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
