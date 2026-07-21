import React, { useState, useCallback } from "react";
import * as Sentry from "@sentry/browser";
import "./App.css";

const ROUTES = ["home", "products", "checkout", "settings", "error"];

const ROUTE_ENDPOINTS = {
  home: { method: "GET", path: "/api/home/feed" },
  products: { method: "GET", path: "/api/products?category=all&limit=50" },
  checkout: { method: "POST", path: "/api/checkout/validate" },
  settings: { method: "GET", path: "/api/user/settings" },
  error: { method: "GET", path: "/api/admin/debug" },
};

const PRODUCTS = [
  { name: "Wireless Keyboard", price: 79.99, sku: "KB-001" },
  { name: "USB-C Hub", price: 49.99, sku: "HB-042" },
  { name: "Monitor Stand", price: 129.99, sku: "MS-113" },
  { name: "Mechanical Numpad", price: 39.99, sku: "NP-007" },
  { name: "Desk Lamp", price: 59.99, sku: "DL-021" },
  { name: "Cable Organizer", price: 19.99, sku: "CO-088" },
];

function Interactive() {
  const params = new URLSearchParams(window.location.search);
  const initialRoute = params.get("route") || "home";

  const [currentRoute, setCurrentRoute] = useState(initialRoute);
  const [loading, setLoading] = useState(false);
  const [loadingRoute, setLoadingRoute] = useState("");

  const navigateTo = useCallback(
    async (route) => {
      if (route === currentRoute || loading) return;

      setLoading(true);
      setLoadingRoute(route);

      const urlParams = new URLSearchParams(window.location.search);
      urlParams.set("route", route);
      window.history.pushState(
        {},
        "",
        `${window.location.pathname}?${urlParams.toString()}`
      );

      const endpoint = ROUTE_ENDPOINTS[route];
      const delay = 400 + Math.random() * 1200;

      await Sentry.startSpan(
        { name: `${endpoint.method} ${endpoint.path}`, op: "http.client" },
        async () => {
          await Sentry.startSpan(
            {
              name: `SELECT * FROM pages WHERE slug = '${route}'`,
              op: "db",
            },
            () => new Promise((r) => setTimeout(r, delay * 0.3))
          );
          await Sentry.startSpan(
            { name: `cache.get page:${route}:content`, op: "cache" },
            () => new Promise((r) => setTimeout(r, delay * 0.15))
          );
          await new Promise((r) => setTimeout(r, delay * 0.55));
        }
      );

      setCurrentRoute(route);
      setLoading(false);
      setLoadingRoute("");
    },
    [currentRoute, loading]
  );

  async function handleAddToCart(product) {
    await Sentry.startSpan(
      { name: "POST /api/cart/add", op: "http.client" },
      async () => {
        await Sentry.startSpan(
          {
            name: `INSERT INTO cart_items (sku, qty) VALUES ('${product.sku}', 1)`,
            op: "db",
          },
          () => new Promise((r) => setTimeout(r, 200 + Math.random() * 300))
        );
      }
    );
  }

  async function handlePlaceOrder() {
    await Sentry.startSpan(
      { name: "POST /api/checkout/process", op: "http.client" },
      async () => {
        await Sentry.startSpan(
          {
            name: "SELECT u.*, a.* FROM users u JOIN addresses a ON u.id = a.user_id WHERE u.id = %s",
            op: "db",
          },
          () => new Promise((r) => setTimeout(r, 150 + Math.random() * 200))
        );
        await Sentry.startSpan(
          { name: "queue.publish order.created", op: "queue.process" },
          () => new Promise((r) => setTimeout(r, 100 + Math.random() * 150))
        );
        await new Promise((r) => setTimeout(r, 300 + Math.random() * 400));
      }
    );
  }

  function triggerCapturedError() {
    try {
      const obj = null;
      obj.process();
    } catch (e) {
      Sentry.captureException(e);
    }
  }

  function triggerUnhandledError() {
    throw new Error("Unhandled crash on /error page");
  }

  function renderCurrentRoute() {
    switch (currentRoute) {
      case "home":
        return (
          <div className="interactive-page">
            <h2>Dashboard</h2>
            <div className="interactive-stats">
              <div className="stat-card">
                <span className="stat-value">1,247</span>
                <span className="stat-label">Orders</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">$48.2k</span>
                <span className="stat-label">Revenue</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">342</span>
                <span className="stat-label">Users</span>
              </div>
              <div className="stat-card">
                <span className="stat-value">99.2%</span>
                <span className="stat-label">Uptime</span>
              </div>
            </div>
          </div>
        );

      case "products":
        return (
          <div className="interactive-page">
            <h2>Products</h2>
            <div className="interactive-products">
              {PRODUCTS.map((p) => (
                <div key={p.sku} className="product-card">
                  <span className="product-sku">{p.sku}</span>
                  <span className="product-name">{p.name}</span>
                  <span className="product-price">${p.price}</span>
                  <button
                    className="product-btn"
                    onClick={() => handleAddToCart(p)}
                  >
                    Add to Cart
                  </button>
                </div>
              ))}
            </div>
          </div>
        );

      case "checkout":
        return (
          <div className="interactive-page">
            <h2>Checkout</h2>
            <div className="interactive-form">
              <input
                type="text"
                placeholder="Full Name"
                className="interactive-input"
              />
              <input
                type="text"
                placeholder="Email"
                className="interactive-input"
              />
              <input
                type="text"
                placeholder="Card Number"
                className="interactive-input"
              />
              <input
                type="text"
                placeholder="Expiry (MM/YY)"
                className="interactive-input"
              />
              <button className="interactive-submit" onClick={handlePlaceOrder}>
                Place Order
              </button>
            </div>
          </div>
        );

      case "settings":
        return (
          <div className="interactive-page">
            <h2>Settings</h2>
            <div className="interactive-settings">
              <div className="setting-row">
                <span>Dark Mode</span>
                <span className="setting-badge on">ON</span>
              </div>
              <div className="setting-row">
                <span>Notifications</span>
                <span className="setting-badge off">OFF</span>
              </div>
              <div className="setting-row">
                <span>Two-Factor Auth</span>
                <span className="setting-badge on">ON</span>
              </div>
              <div className="setting-row">
                <span>Analytics</span>
                <span className="setting-badge on">ON</span>
              </div>
            </div>
          </div>
        );

      case "error":
        return (
          <div className="interactive-page">
            <h2>Danger Zone</h2>
            <p className="interactive-warning">
              These buttons trigger errors sent to Sentry.
            </p>
            <div className="interactive-error-actions">
              <button className="error-btn captured" onClick={triggerCapturedError}>
                Captured Exception
              </button>
              <button className="error-btn unhandled" onClick={triggerUnhandledError}>
                Unhandled Error
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  }

  return (
    <div className="interactive-app">
      <nav className="interactive-nav">
        <span className="interactive-logo">SentryShop</span>
        <div className="interactive-nav-links">
          {ROUTES.map((route) => (
            <button
              key={route}
              className={`interactive-nav-btn ${currentRoute === route ? "active" : ""} ${route === "error" ? "danger" : ""}`}
              onClick={() => navigateTo(route)}
            >
              {route}
            </button>
          ))}
        </div>
      </nav>

      <main className="interactive-main">
        {loading ? (
          <div className="interactive-loading">
            <div className="interactive-spinner" />
            <p>Fetching /{loadingRoute}...</p>
          </div>
        ) : (
          renderCurrentRoute()
        )}
      </main>
    </div>
  );
}

export default Interactive;
