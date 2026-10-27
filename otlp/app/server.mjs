import http from "node:http";

import { readConfig, resolvePrometheusTarget, resolveSentryTarget, writeConfig } from "./config.mjs";
import { FIXTURE, sendFixture } from "./fixture.mjs";
import { createLoadGenerator } from "./load.mjs";
import { createPipeline } from "./otel.mjs";

const PORT = Number(process.env.OTLP_APP_PORT || 3002);

let pipeline = null;
let load = null;
let lastFixture = null;

async function rebuildPipeline() {
  if (load) {
    load.stop();
  }
  if (pipeline) {
    await pipeline.shutdown();
  }
  const config = readConfig();
  pipeline = createPipeline(config);
  load = createLoadGenerator(pipeline, { requestsPerSecond: config.requestsPerSecond || 20 });
  console.log(
    `[otlp] pipeline ready: sentry=${pipeline.sentry?.metricsUrl || "(no dsn)"} prometheus=${pipeline.prometheus.metricsUrl}`
  );
}

function status() {
  const config = readConfig();
  return {
    config,
    sentry: resolveSentryTarget(config),
    prometheus: resolvePrometheusTarget(config),
    load: { running: load?.running || false, ...load?.counts },
    exports: pipeline?.stats || null,
    lastFixture,
    fixture: FIXTURE,
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function respond(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    respond(res, 204, {});
    return;
  }
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);

  try {
    switch (`${req.method} ${pathname}`) {
      case "GET /otlp/status":
        return respond(res, 200, status());
      case "POST /otlp/config": {
        const patch = JSON.parse((await readBody(req)) || "{}");
        writeConfig(patch);
        await rebuildPipeline();
        return respond(res, 200, status());
      }
      case "POST /otlp/load/start":
        load.start();
        return respond(res, 200, status());
      case "POST /otlp/load/stop":
        load.stop();
        return respond(res, 200, status());
      case "POST /otlp/fixture":
        lastFixture = await sendFixture(readConfig());
        return respond(res, 200, status());
      default:
        return respond(res, 404, { error: "Not found" });
    }
  } catch (error) {
    console.error("[otlp]", error);
    respond(res, 500, { error: error.message });
  }
});

await rebuildPipeline();

server.listen(PORT, () => {
  console.log(`[otlp] producer running on http://localhost:${PORT}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    load?.stop();
    await pipeline?.shutdown();
    process.exit(0);
  });
}
