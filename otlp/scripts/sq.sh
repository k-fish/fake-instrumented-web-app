#!/bin/bash
# usage: sq.sh <metric> <type> <unit> <period> [extra query]
TOKEN=${SENTRY_TOKEN:?set SENTRY_TOKEN (see mktoken.py)}
M=$1; T=$2; U=$3; P=${4:-1h}; Q=${5:-}
args=(--data-urlencode "dataset=tracemetrics" --data-urlencode "project=2" --data-urlencode "statsPeriod=$P" --data-urlencode "query=metric.name:$M metric.type:$T $Q" --data-urlencode "referrer=api.explore.metrics")
for f in count sum avg p50 p95 p99 min max; do args+=(--data-urlencode "field=$f(value,$M,$T,$U)"); done
curl -s -G "http://127.0.0.1:8001/api/0/organizations/sentry/events/" -H "Authorization: Bearer $TOKEN" "${args[@]}"
