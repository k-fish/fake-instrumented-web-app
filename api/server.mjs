import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as Sentry from "@sentry/node";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DSN_FILE = path.join(__dirname, "..", ".backend_sentry_dsn");
const PORT = 3001;

function readDsn() {
  try {
    return fs.readFileSync(DSN_FILE, "utf-8").trim();
  } catch {
    return "";
  }
}

function writeDsn(dsn) {
  fs.writeFileSync(DSN_FILE, dsn, "utf-8");
}

let sentryInitialized = false;

function initSentry() {
  const dsn = readDsn();
  if (dsn) {
    Sentry.init({
      dsn,
      tracesSampleRate: 1.0,
      enableLogs: true,
    });
    sentryInitialized = true;
    console.log(`[api] Sentry initialized: ${dsn.substring(0, 50)}...`);
  } else {
    console.log("[api] No DSN configured, Sentry not initialized");
  }
}

initSentry();

// --- Fake service helpers with instrumented spans ---

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function dbQuery(query) {
  return Sentry.startSpan({ name: query, op: "db" }, async () => {
    await wait(5 + Math.random() * 40);
    return { rows: Math.floor(Math.random() * 100) };
  });
}

async function cacheGet(key) {
  return Sentry.startSpan(
    { name: `cache.get ${key}`, op: "cache" },
    async () => {
      await wait(2 + Math.random() * 15);
      return { hit: Math.random() > 0.3 };
    }
  );
}

async function queuePublish(event) {
  return Sentry.startSpan(
    { name: `queue.publish ${event}`, op: "queue.process" },
    async () => {
      await wait(5 + Math.random() * 20);
    }
  );
}

async function serialize(label) {
  return Sentry.startSpan(
    { name: `serialize ${label}`, op: "serialize" },
    async () => {
      await wait(1 + Math.random() * 10);
    }
  );
}

// --- Route handlers ---

async function handleGetDsn(_req, res) {
  respond(res, 200, { dsn: readDsn() });
}

async function handlePostDsn(req, res) {
  const body = await readBody(req);
  const { dsn } = JSON.parse(body);
  writeDsn(dsn || "");
  initSentry();
  respond(res, 200, { dsn: readDsn(), status: "updated" });
}

async function handleUsers(_req, res) {
  return Sentry.startSpan(
    { name: "GET /api/users", op: "http.server" },
    async () => {
      const cache = await cacheGet("users:list");
      const result = await dbQuery(
        "SELECT id, name, email FROM users ORDER BY created_at DESC LIMIT 25"
      );
      await serialize("response body");
      respond(res, 200, {
        users: result.rows,
        cached: cache.hit,
        timestamp: Date.now(),
      });
    }
  );
}

async function handleCheckout(_req, res) {
  return Sentry.startSpan(
    { name: "GET /api/checkout", op: "http.server" },
    async () => {
      await cacheGet("cart:user:123");
      await dbQuery(
        "SELECT p.*, ci.quantity FROM cart_items ci JOIN products p ON ci.product_id = p.id WHERE ci.user_id = %s"
      );
      await dbQuery(
        "INSERT INTO orders (user_id, total, status) VALUES (%s, %s, %s)"
      );
      await queuePublish("order.created");
      await serialize("order confirmation");
      respond(res, 200, {
        order_id: `ORD-${Date.now()}`,
        status: "created",
        timestamp: Date.now(),
      });
    }
  );
}

async function handleSearch(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const q = url.searchParams.get("q") || "test";

  return Sentry.startSpan(
    { name: "GET /api/search", op: "http.server" },
    async () => {
      await cacheGet(`search:${q}`);
      await dbQuery(
        `SELECT * FROM products WHERE name ILIKE '%${q}%' OR description ILIKE '%${q}%' LIMIT 20`
      );
      await serialize("search results");
      respond(res, 200, {
        query: q,
        results: Math.floor(Math.random() * 50),
        timestamp: Date.now(),
      });
    }
  );
}

async function handleThisMightFail(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const failureRate = parseInt(
    url.searchParams.get("failure_rate") || "50",
    10
  );

  return Sentry.startSpan(
    { name: "GET /api/this_might_fail", op: "http.server" },
    async () => {
      await dbQuery("SELECT * FROM volatile_data WHERE status = 'pending'");
      await wait(10 + Math.random() * 40);

      if (Math.random() * 100 < failureRate) {
        const err = new Error(
          `Processing failed (${failureRate}% failure rate)`
        );
        err.extra = { failure_rate: failureRate, endpoint: "/api/this_might_fail" };
        Sentry.captureException(err);
        await Sentry.flush(200);
        respond(res, 500, {
          error: err.message,
          failure_rate: failureRate,
        });
        return;
      }

      respond(res, 200, {
        success: true,
        failure_rate: failureRate,
        timestamp: Date.now(),
      });
    }
  );
}

// --- HTTP plumbing ---

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function respond(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  try {
    switch (true) {
      case pathname === "/api/dsn" && req.method === "GET":
        return await handleGetDsn(req, res);
      case pathname === "/api/dsn" && req.method === "POST":
        return await handlePostDsn(req, res);
      case pathname === "/api/users":
        return await handleUsers(req, res);
      case pathname === "/api/checkout":
        return await handleCheckout(req, res);
      case pathname === "/api/search":
        return await handleSearch(req, res);
      case pathname === "/api/this_might_fail":
        return await handleThisMightFail(req, res);
      default:
        respond(res, 404, { error: "Not found" });
    }
  } catch (err) {
    Sentry.captureException(err);
    respond(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`[api] Server running on http://localhost:${PORT}`);
});
