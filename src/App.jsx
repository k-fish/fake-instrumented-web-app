import React, { Fragment, useState, useEffect } from "react";
import "./App.css";
import ConfigPicker from "./ConfigPicker.jsx";

import { logger } from "@sentry/browser";
import * as Sentry from "@sentry/browser";
const { error, info, fmt } = logger;

const longBody = `Added item to shopping cart: Xbox One X 500 GB 2018 Payment failure detected | userId=12345 | orderId=67890 | paymentMethod="Credit Card" |
amount=199.99 | retryCount=2 | errorCode="PAYMENT_TIMEOUT" | timestamp="2024-11-15T14:32:07Z" |
Request failed after 3 seconds, network timeout at /payments/process endpoint, initiated by user action. |
correlationId=1234567890`;

const jsonAttribute = {
  payment: {
    gateway: {
      name: "Stripe",
      id: "stripe_1234567890"
    },
    method: {
      name: "Credit Card",
      id: "card_1234567890"
    },
    amount: 199.99,
    timestamp: "2024-11-15T14:32:07Z"
  },
  user_type: "premium",
  cart: [
      {
        name: "Xbox One X 500 GB 2018",
        price: 199.99,
        quantity: 1
      }
  ]
}

const piiAttributes ={
  user: {
    name: "John Doe",
    email: "john.doe@example.com",
    phone: "1234567890"
  },
  payment: {
    card: {
      number: "4111111111111111",
      expiration: "12/2025",
      cvv: "123"
    }
  }
}

const SPAN_OPS = ['http.client', 'db', 'cache', 'queue.process', 'serialize', 'middleware', 'template.render', 'resource.script'];

const SPAN_DESCRIPTIONS = {
  'http.client': [
    'GET https://api.example.com/v2/users/123',
    'POST https://api.example.com/v2/orders',
    'GET https://cdn.example.com/assets/main.js',
    'PUT https://api.example.com/v2/cart/items/456',
    'DELETE https://api.example.com/v2/sessions/789',
    'GET https://payments.stripe.com/v1/charges',
    'POST https://api.example.com/v2/invoices/batch',
  ],
  db: [
    'SELECT * FROM users WHERE id = %s',
    'INSERT INTO orders (user_id, total) VALUES (%s, %s)',
    'UPDATE inventory SET quantity = quantity - 1 WHERE product_id = %s',
    'SELECT o.*, u.email FROM orders o JOIN users u ON o.user_id = u.id',
    'DELETE FROM sessions WHERE expires_at < NOW()',
    'SELECT COUNT(*) FROM events WHERE timestamp > %s',
  ],
  cache: [
    'cache.get user:123:profile',
    'cache.set session:abc123',
    'cache.delete cart:user:123',
    'cache.get product:456:details',
  ],
  'queue.process': [
    'queue.publish order.created',
    'queue.process email.send',
    'queue.publish payment.processed',
    'queue.process inventory.update',
  ],
  serialize: [
    'serialize response body',
    'deserialize request payload',
    'serialize cache entry',
  ],
  middleware: [
    'AuthenticationMiddleware',
    'RateLimitMiddleware',
    'CORSMiddleware',
    'LoggingMiddleware',
  ],
  'template.render': [
    'render checkout.html',
    'render invoice.pdf',
    'render email/confirmation.mjml',
  ],
  'resource.script': [
    'https://cdn.example.com/js/app.bundle.js',
    'https://cdn.example.com/css/main.css',
    'https://cdn.example.com/img/logo.png',
  ],
};

/* eslint-disable no-undef */
function App() {
  // Shared state for attributes (used by both logs and metrics)
  const [extraData, setExtraData] = useState(() => {
    const saved = localStorage.getItem('extraData');
    return saved ? JSON.parse(saved) : [{ key: "", value: "" }];
  });
  
  // Tab management
  const [activeTab, setActiveTab] = useState(() => {
    const saved = localStorage.getItem('activeTab');
    return saved || 'logs';
  });
  
  // Log-specific state
  const [logSeverity, setLogSeverity] = useState('info');
  const [fullText, setFullText] = useState(longBody);
  
  // Metrics-specific state
  const [metricName, setMetricName] = useState(() => {
    const saved = localStorage.getItem('metricName');
    return saved || '';
  });
  const [metricType, setMetricType] = useState(() => {
    const saved = localStorage.getItem('metricType');
    return saved || 'count';
  });
  const [metricValue, setMetricValue] = useState(() => {
    const saved = localStorage.getItem('metricValue');
    return saved || '';
  });
  const [metricUnit, setMetricUnit] = useState(() => {
    const saved = localStorage.getItem('metricUnit');
    return saved || '';
  });
  const [metricNameHistory, setMetricNameHistory] = useState(() => {
    const saved = localStorage.getItem('metricNameHistory');
    return saved ? JSON.parse(saved) : [];
  });
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  // Raw envelope state
  const [rawEnvelopePayload, setRawEnvelopePayload] = useState(() => {
    const saved = localStorage.getItem('rawEnvelopePayload');
    return saved || '';
  });
  
  // Spans state
  const [spanDuration, setSpanDuration] = useState(() => {
    const saved = localStorage.getItem('spanDuration');
    return saved || '100';
  });
  
  // API tab state
  const [backendDsn, setBackendDsn] = useState('');
  const [apiResponse, setApiResponse] = useState(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [failureRate, setFailureRate] = useState(() => {
    const saved = localStorage.getItem('failureRate');
    return saved || '50';
  });

  useEffect(() => {
    localStorage.setItem('extraData', JSON.stringify(extraData));
  }, [extraData]);
  
  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);
  
  useEffect(() => {
    localStorage.setItem('metricNameHistory', JSON.stringify(metricNameHistory));
  }, [metricNameHistory]);
  
  useEffect(() => {
    localStorage.setItem('metricName', metricName);
  }, [metricName]);
  
  useEffect(() => {
    localStorage.setItem('metricType', metricType);
  }, [metricType]);
  
  useEffect(() => {
    localStorage.setItem('metricValue', metricValue);
  }, [metricValue]);
  
  useEffect(() => {
    localStorage.setItem('metricUnit', metricUnit);
  }, [metricUnit]);
  
  useEffect(() => {
    localStorage.setItem('rawEnvelopePayload', rawEnvelopePayload);
  }, [rawEnvelopePayload]);
  
  useEffect(() => {
    localStorage.setItem('spanDuration', spanDuration);
  }, [spanDuration]);
  
  useEffect(() => {
    if (activeTab === 'api') fetchBackendDsn();
  }, [activeTab]);
  
  useEffect(() => {
    localStorage.setItem('failureRate', failureRate);
  }, [failureRate]);

  function callMethodThatDoesntExist() {
    const methodName = "capture";
    error("Method doesn't exist", { methodName });
  }

  function callLog() {
    const user = 123;
    const payInfo = { payment: { paymentId: 1312, paymentType: "card" } };
    const code = { "code.line.number": 115.0 };
    const ip = "31.41.115.122";
    const card = "4111111111111111";
    const query = "something something 31.41.115.122 " + card;
    
    // Build attributes from extra data
    const attributes = {};
    extraData.forEach(({ key, value }) => {
      if (key.trim() && value.trim()) {
        attributes[key.trim()] = value.trim();
      }
    });

    attributes["this_is_json"] = jsonAttribute;

    const logPayload = {
      user,
      payInfo,
      ip,
      card,
      ...code,
      ...attributes,
    };

    // Use the selected severity level
    const logFunction = logger[logSeverity] || logger.info;

    const randomEndpointWords = ['cart', 'payments', 'auth', 'checkout', 'login', 'logout', 'register', 'profile', 'settings', 'help', 'support', 'contact'];
    const randomEndpointIndex = Math.floor(Math.random() * 5);

    let formatted;
    switch (randomEndpointIndex) {
      case 0:
        formatted = fmt`Auth endpoint: /cart/auth ip:${ip} card:${card}`;
        break;
      case 1:
        formatted = fmt`Auth endpoint: /payments/auth ip:${ip} card:${card}`;
        break;
      case 2:
        formatted = fmt`Auth endpoint: /checkout/auth ip:${ip} card:${card}`;
        break;
      case 3:
        formatted = fmt`Auth endpoint: /login/auth ip:${ip} card:${card}`;
        break;
      case 4:
        formatted = fmt`Auth endpoint: /logout/auth ip:${ip} card:${card}`;
        break;
      default:
        formatted = fmt`Auth endpoint: /register/auth ip:${ip} card:${card}`;
    }


    logFunction(formatted, logPayload);

    // Immediate flush
    Sentry.flush(100).then(() => {
      console.log('Log sent to Sentry');
    });
  }

  // Generate current log payload for preview
  const getCurrentLogPayload = () => {
    const user = 123;
    const payInfo = { payment: { paymentId: 1312, paymentType: "card" } };
    const code = { "code.line.number": 115.0 };
    const ip = "31.41.115.122";
    const card = "4111111111111111";
    const query = "something something 31.41.115.122 " + card;
    
    const attributes = {};
    extraData.forEach(({ key, value }) => {
      if (key.trim() && value.trim()) {
        attributes[key.trim()] = value.trim();
      }
    });

    return {
      message: `${logSeverity}: ${fullText} query:${query} ip:${ip} card:${card}`,
      payload: {
        user,
        payInfo,
        ip,
        card,
        ...code,
        attributes,
      }
    };
  };

  function addExtraDataRow() {
    setExtraData([...extraData, { key: "", value: "" }]);
  }

  function removeExtraDataRow(index) {
    if (extraData.length > 1) {
      setExtraData(extraData.filter((_, i) => i !== index));
    }
  }

  function updateExtraDataRow(index, field, value) {
    const updated = extraData.map((item, i) => 
      i === index ? { ...item, [field]: value } : item
    );
    setExtraData(updated);
  }

  function clearAllData() {
    setExtraData([{ key: "", value: "" }]);
    localStorage.removeItem('extraData');
  }
  
  function handleTabChange(tab) {
    setActiveTab(tab);
  }
  
  function handleMetricNameChange(value) {
    setMetricName(value);
    setShowSuggestions(value.length > 0);
  }
  
  function selectMetricNameSuggestion(suggestion) {
    setMetricName(suggestion);
    setShowSuggestions(false);
  }
  
  function callMetric() {
    if (!metricName || !metricValue) return;
    
    // Add to history if not already there
    if (!metricNameHistory.includes(metricName)) {
      const newHistory = [...metricNameHistory, metricName].slice(-10); // Keep last 10
      setMetricNameHistory(newHistory);
    }
    
    // Build attributes from extra data
    const attributes = {};
    extraData.forEach(({ key, value }) => {
      if (key.trim() && value.trim()) {
        attributes[key.trim()] = value.trim();
      }
    });
    
    try {
      const processedValue = parseFloat(metricValue);
      if (isNaN(processedValue)) {
        console.error('Metrics require a valid numeric value');
        return;
      }
      
      // Call the appropriate Sentry metrics method
      if (Sentry.metrics) {
        const options = { attributes };
        if (metricUnit) {
          options.unit = metricUnit;
        }
        
        switch (metricType) {
          case 'count':
            Sentry.metrics.count(metricName, processedValue, options);
            break;
          case 'gauge':
            Sentry.metrics.gauge(metricName, processedValue, options);
            break;
          case 'distribution':
            Sentry.metrics.distribution(metricName, processedValue, options);
            break;
          default:
            console.error('Unknown metric type:', metricType);
            return;
        }
        
        console.log('Metric sent to Sentry:', {
          name: metricName,
          type: metricType,
          value: processedValue,
          attributes
        });
        
        // Immediate flush
        Sentry.flush(100).then(() => {
          console.log('Metric sent to Sentry');
        });
        
      } else {
        console.warn('Sentry.metrics not available - make sure _enableTraceMetrics is enabled and you are using a compatible SDK version');
        console.log('Metric would be sent:', {
          name: metricName,
          type: metricType,
          value: processedValue,
          attributes
        });
      }
      
    } catch (error) {
      console.error('Error sending metric:', error);
    }
  }
  
  function getFilteredSuggestions() {
    if (!metricName) return [];
    return metricNameHistory.filter(name => 
      name.toLowerCase().includes(metricName.toLowerCase()) && name !== metricName
    );
  }
  
  function getCurrentMetricPayload() {
    const attributes = {};
    extraData.forEach(({ key, value }) => {
      if (key.trim() && value.trim()) {
        attributes[key.trim()] = value.trim();
      }
    });
    
    const payload = {
      name: metricName || 'metric.name',
      type: metricType,
      value: metricValue || '0',
      attributes
    };
    
    if (metricUnit) {
      payload.unit = metricUnit;
    }
    
    return payload;
  }
  
  function normalizeEnvelopePayload(payload) {
    const jsonObjects = [];
    let currentJson = '';
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;
    
    for (const char of payload) {
      if (escapeNext) {
        currentJson += char;
        escapeNext = false;
        continue;
      }
      
      if (char === '\\') {
        escapeNext = true;
        currentJson += char;
        continue;
      }
      
      if (char === '"' && !escapeNext) {
        inString = !inString;
      }
      
      if (!inString) {
        if (char === '{') {
          if (braceCount === 0) {
            currentJson = '{';
          } else {
            currentJson += char;
          }
          braceCount++;
          continue;
        } else if (char === '}') {
          braceCount--;
          currentJson += char;
          if (braceCount === 0 && currentJson.trim()) {
            try {
              const parsed = JSON.parse(currentJson.trim());
              jsonObjects.push(JSON.stringify(parsed));
            } catch (e) {
              console.warn('Failed to parse JSON object, using as-is:', e);
              jsonObjects.push(currentJson.trim());
            }
            currentJson = '';
          }
          continue;
        }
      }
      
      if (braceCount > 0) {
        currentJson += char;
      }
    }
    
    return jsonObjects.join('\n');
  }
  
  function getRawEnvelopePreview() {
    if (!rawEnvelopePayload.trim()) {
      return '(empty)';
    }
    
    try {
      return normalizeEnvelopePayload(rawEnvelopePayload);
    } catch (e) {
      return 'Error normalizing payload';
    }
  }
  
  async function sendRawEnvelope() {
    if (!rawEnvelopePayload.trim()) {
      console.error('Raw envelope payload is empty');
      return;
    }
    
    try {
      const client = Sentry.getClient();
      if (!client) {
        console.error('Sentry client not initialized');
        return;
      }
      
      const dsn = client.getDsn();
      if (!dsn) {
        console.error('No DSN configured');
        return;
      }
      
      const envelopeUrl = `${dsn.protocol}://${dsn.host}/api/${dsn.projectId}/envelope/`;
      
      const normalizedPayload = normalizeEnvelopePayload(rawEnvelopePayload);
      const jsonLines = normalizedPayload.split('\n');
      
      let sentryClient = `sentry.javascript.browser/${Sentry.SDK_VERSION}`;
      if (jsonLines.length > 0) {
        try {
          const sdkInfo = JSON.parse(jsonLines[0]);
          if (sdkInfo.sdk && sdkInfo.sdk.name && sdkInfo.sdk.version) {
            sentryClient = `${sdkInfo.sdk.name}/${sdkInfo.sdk.version}`;
          }
        } catch (e) {
          console.warn('Could not parse SDK info from envelope, using default');
        }
      }
      
      const authHeader = `Sentry sentry_version=7, sentry_key=${dsn.publicKey}, sentry_client=${sentryClient}`;
      
      const response = await fetch(envelopeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-sentry-envelope',
          'X-Sentry-Auth': authHeader,
        },
        body: normalizedPayload,
      });
      
      if (response.ok) {
        console.log('Raw envelope sent successfully');
      } else {
        console.error('Failed to send envelope:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Error sending raw envelope:', error);
    }
  }

  function generateChildSpans(totalDurationMs) {
    const count = 3 + Math.floor(Math.random() * 4); // 3-6 children
    const children = [];
    const usedOps = new Set();
    
    for (let i = 0; i < count; i++) {
      let op;
      do {
        op = SPAN_OPS[Math.floor(Math.random() * SPAN_OPS.length)];
      } while (usedOps.has(op) && usedOps.size < SPAN_OPS.length);
      usedOps.add(op);
      
      const descriptions = SPAN_DESCRIPTIONS[op];
      const description = descriptions[Math.floor(Math.random() * descriptions.length)];
      
      const maxDuration = Math.min(totalDurationMs * 0.8, totalDurationMs - 1);
      const duration = Math.max(1, Math.floor(Math.random() * maxDuration));
      const latestStart = totalDurationMs - duration;
      const startOffset = Math.floor(Math.random() * latestStart);
      
      children.push({ op, description, startOffset, duration });
    }
    
    children.sort((a, b) => a.startOffset - b.startOffset);
    return children;
  }

  function callSpan() {
    const totalDurationMs = parseFloat(spanDuration) || 100;
    const children = generateChildSpans(totalDurationMs);
    
    Sentry.startSpan(
      { name: 'test-transaction', op: 'navigation' },
      (rootSpan) => {
        const rootStart = Date.now();
        
        for (const child of children) {
          const childStartMs = rootStart + child.startOffset;
          const childEndMs = childStartMs + child.duration;
          const childSpan = Sentry.startInactiveSpan({
            name: child.description,
            op: child.op,
            startTime: childStartMs / 1000,
          });
          childSpan.end(childEndMs / 1000);
        }
        
        // End root span after total duration
        setTimeout(() => {
          rootSpan.end();
          Sentry.flush(100).then(() => {
            console.log('Span sent to Sentry');
          });
        }, totalDurationMs);
      }
    );
  }

  async function fetchBackendDsn() {
    try {
      const res = await fetch('/api/dsn');
      const data = await res.json();
      setBackendDsn(data.dsn || '');
    } catch {
      setBackendDsn('(api unreachable)');
    }
  }

  async function syncDsnToBackend() {
    let dsn = '';
    const storedConfig = localStorage.getItem('currentSentryConfig');
    if (storedConfig) {
      try { dsn = JSON.parse(storedConfig).dsn; } catch { /* noop */ }
    }
    if (!dsn) dsn = localStorage.getItem('currentDsn') || '';
    setApiLoading(true);
    try {
      const res = await fetch('/api/dsn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dsn }),
      });
      const data = await res.json();
      setBackendDsn(data.dsn || '');
      setApiResponse(data);
    } catch (e) {
      setApiResponse({ error: e.message });
    }
    setApiLoading(false);
  }

  async function callApiEndpoint(urlPath) {
    setApiLoading(true);
    try {
      const res = await fetch(urlPath);
      const data = await res.json();
      setApiResponse({ status: res.status, ...data });
    } catch (e) {
      setApiResponse({ error: e.message });
    }
    setApiLoading(false);
  }

  function getSpanPreview() {
    const totalDurationMs = parseFloat(spanDuration) || 100;
    const children = generateChildSpans(totalDurationMs);
    return {
      rootSpan: { name: 'test-transaction', op: 'navigation', duration_ms: totalDurationMs },
      children: children.map(c => ({
        op: c.op,
        description: c.description,
        start_offset_ms: c.startOffset,
        duration_ms: c.duration,
      })),
    };
  }

  return (
    <div className="App">
      <header className="App-header">
        <svg className="App-logo pixelated" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 66" width="150" height="150">
          <path d="M29,2.26a4.67,4.67,0,0,0-8,0L14.42,13.53A32.21,32.21,0,0,1,32.17,40.19H27.55A27.68,27.68,0,0,0,12.09,17.47L6,28a15.92,15.92,0,0,1,9.23,12.17H4.62A.76.76,0,0,1,4,39.06l2.94-5a10.74,10.74,0,0,0-3.36-1.9l-2.91,5a4.54,4.54,0,0,0,1.69,6.24A4.66,4.66,0,0,0,4.62,44H19.15a19.4,19.4,0,0,0-8-17.31l2.31-4A23.87,23.87,0,0,1,23.76,44H36.07a35.88,35.88,0,0,0-16.41-31.8l4.67-8a.77.77,0,0,1,1.05-.27c.53.29,20.29,34.77,20.66,35.17a.76.76,0,0,1-.68,1.13H40.6q.09,1.91,0,3.81h4.78A4.59,4.59,0,0,0,50,39.43a4.49,4.49,0,0,0-.62-2.28Z" transform="translate(11, 11)" fill="#362d59"></path>
        </svg>
        {/* <p className="glitch-text" data-text="SENTRY TEST APP">SENTRY TEST APP</p>
        <p className="glitch-text" data-text="ERROR MONITORING SYSTEM">ERROR MONITORING SYSTEM</p> */}
        
        <ConfigPicker />
        
        <div className="extra-data-section">
          {/* Tab Navigation */}
          <div className="tab-navigation">
            <button 
              className={`tab-button ${activeTab === 'logs' ? 'active' : ''}`}
              onClick={() => handleTabChange('logs')}
            >
              Logs
            </button>
            <button 
              className={`tab-button ${activeTab === 'metrics' ? 'active' : ''}`}
              onClick={() => handleTabChange('metrics')}
            >
              Metrics
            </button>
            <button 
              className={`tab-button ${activeTab === 'spans' ? 'active' : ''}`}
              onClick={() => handleTabChange('spans')}
            >
              Spans
            </button>
            <button 
              className={`tab-button ${activeTab === 'api' ? 'active' : ''}`}
              onClick={() => handleTabChange('api')}
            >
              API
            </button>
            <button 
              className={`tab-button ${activeTab === 'raw' ? 'active' : ''}`}
              onClick={() => handleTabChange('raw')}
            >
              Raw
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'logs' && (
            <>
              <div className="input-section">
                <div className="severity-row">
                  <label htmlFor="severity-select">Log Severity:</label>
                  <select 
                    id="severity-select"
                    value={logSeverity} 
                    onChange={(e) => setLogSeverity(e.target.value)}
                    className="severity-dropdown"
                  >
                    <option value="debug">debug</option>
                    <option value="info">info</option>
                    <option value="warn">warn</option>
                    <option value="error">error</option>
                    <option value="fatal">fatal</option>
                  </select>
                </div>
              </div>
              
              <div className="data-content">
                <div className="data-left">
                  <h4>Attributes</h4>
                  {extraData.map((row, index) => (
                    <div key={index} className="extra-data-row">
                      <input
                        type="text"
                        placeholder="Key"
                        value={row.key}
                        onChange={(e) => updateExtraDataRow(index, 'key', e.target.value)}
                      />
                      <input
                        type="text"
                        placeholder="Value"
                        value={row.value}
                        onChange={(e) => updateExtraDataRow(index, 'value', e.target.value)}
                      />
                      <button data-button-size="sm" onClick={() => removeExtraDataRow(index)}>Del</button>
                    </div>
                  ))}
                </div>
                
                <div className="vertical-divider"></div>
                
                <div className="data-right">
                  <h4>Log Payload Preview</h4>
                  <pre className="json-preview">
                    {JSON.stringify(getCurrentLogPayload(), null, 2)}
                  </pre>
                </div>
              </div>
              
              <div className="data-footer">
                <div className="button-row">
                  <button data-button-size="sm" onClick={addExtraDataRow}>Add</button>
                  <button data-button-size="sm" className="clear-button" onClick={clearAllData}>Clear</button>
                </div>
              </div>

              <p>
                <button onClick={callMethodThatDoesntExist}>CAPTURE ERROR</button>
                <button onClick={callLog}>CAPTURE LOG</button>
              </p>
            </>
          )}

          {activeTab === 'metrics' && (
            <>
              <div className="data-content">
                <div className="data-left">
                  <h4>Attributes</h4>
                  {extraData.map((row, index) => (
                    <div key={index} className="extra-data-row">
                      <input
                        type="text"
                        placeholder="Key"
                        value={row.key}
                        onChange={(e) => updateExtraDataRow(index, 'key', e.target.value)}
                      />
                      <input
                        type="text"
                        placeholder="Value"
                        value={row.value}
                        onChange={(e) => updateExtraDataRow(index, 'value', e.target.value)}
                      />
                      <button data-button-size="sm" onClick={() => removeExtraDataRow(index)}>Del</button>
                    </div>
                  ))}
                </div>
                
                <div className="vertical-divider"></div>
                
                <div className="data-right">
                  <h4>Metric Configuration</h4>
                  <div className="metric-form">
                    <div className="metric-input-group">
                      <label>Metric Name:</label>
                      <div className="metric-name-container">
                        <input
                          type="text"
                          placeholder="Enter metric name"
                          value={metricName}
                          onChange={(e) => handleMetricNameChange(e.target.value)}
                          onFocus={() => setShowSuggestions(metricName.length > 0)}
                          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                          className="metric-input"
                        />
                        {showSuggestions && getFilteredSuggestions().length > 0 && (
                          <div className="metric-suggestions">
                            {getFilteredSuggestions().map((suggestion, index) => (
                              <div 
                                key={index}
                                className="suggestion-item"
                                onMouseDown={() => selectMetricNameSuggestion(suggestion)}
                              >
                                {suggestion}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="metric-input-group">
                      <label>Metric Type:</label>
                      <select 
                        value={metricType} 
                        onChange={(e) => setMetricType(e.target.value)}
                        className="metric-select"
                      >
                        <option value="count">Count</option>
                        <option value="gauge">Gauge</option>
                        <option value="distribution">Distribution</option>
                      </select>
                    </div>
                    
                    <div className="metric-input-group">
                      <label>Value:</label>
                      <input
                        type="number"
                        placeholder="Enter numeric value"
                        value={metricValue}
                        onChange={(e) => setMetricValue(e.target.value)}
                        className="metric-input"
                      />
                    </div>
                    
                    <div className="metric-input-group">
                      <label>Unit (optional):</label>
                      <input
                        type="text"
                        placeholder="e.g., millisecond, megabyte, percent"
                        value={metricUnit}
                        onChange={(e) => setMetricUnit(e.target.value)}
                        className="metric-input"
                      />
                    </div>
                    
                    <div className="metric-preview">
                      <h5>Metric Preview:</h5>
                      <pre className="json-preview">
                        {JSON.stringify(getCurrentMetricPayload(), null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="data-footer">
                <div className="button-row">
                  <button data-button-size="sm" onClick={addExtraDataRow}>Add</button>
                  <button data-button-size="sm" className="clear-button" onClick={clearAllData}>Clear</button>
                </div>
              </div>

              <p>
                <button onClick={callMetric}>CAPTURE METRIC</button>
              </p>
            </>
          )}

          {activeTab === 'spans' && (
            <>
              <div className="input-section">
                <div className="severity-row">
                  <label htmlFor="span-duration-input">Total Duration (ms):</label>
                  <input
                    id="span-duration-input"
                    type="number"
                    value={spanDuration}
                    onChange={(e) => setSpanDuration(e.target.value)}
                    className="metric-input"
                    min="1"
                    style={{ width: '120px' }}
                  />
                </div>
              </div>
              
              <div className="data-content">
                <div className="data-left" style={{ flex: 1 }}>
                  <h4>Span Preview</h4>
                  <pre className="json-preview">
                    {JSON.stringify(getSpanPreview(), null, 2)}
                  </pre>
                </div>
              </div>

              <p>
                <button onClick={callSpan}>CAPTURE SPAN</button>
                <button onClick={openInteractive}>INTERACTIVE</button>
              </p>
            </>
          )}

          {activeTab === 'api' && (
            <>
              <div className="input-section">
                <div className="severity-row">
                  <label>Backend DSN:</label>
                  <span className="backend-dsn-value">
                    {backendDsn || '(none)'}
                  </span>
                </div>
              </div>

              <div className="api-section">
                <h4>Endpoints</h4>
                <div className="api-button-grid">
                  <button onClick={syncDsnToBackend} disabled={apiLoading}>
                    SYNC DSN TO BACKEND
                  </button>
                  <button onClick={() => callApiEndpoint('/api/users')} disabled={apiLoading}>
                    GET /api/users
                  </button>
                  <button onClick={() => callApiEndpoint('/api/checkout')} disabled={apiLoading}>
                    GET /api/checkout
                  </button>
                  <button onClick={() => callApiEndpoint('/api/search?q=keyboard')} disabled={apiLoading}>
                    GET /api/search
                  </button>
                  <div className="api-endpoint-row">
                    <button
                      onClick={() => callApiEndpoint(`/api/this_might_fail?failure_rate=${failureRate}`)}
                      disabled={apiLoading}
                      className="might-fail-btn"
                    >
                      GET /api/this_might_fail
                    </button>
                    <input
                      type="number"
                      value={failureRate}
                      onChange={(e) => setFailureRate(e.target.value)}
                      min="0"
                      max="100"
                      className="metric-input failure-rate-input"
                    />
                    <span className="failure-rate-label">% fail</span>
                  </div>
                </div>
              </div>

              {apiResponse && (
                <div className="data-content" style={{ marginTop: '20px' }}>
                  <div className="data-left" style={{ flex: 1 }}>
                    <h4>Last Response {apiLoading && '(loading...)'}</h4>
                    <pre className="json-preview">
                      {JSON.stringify(apiResponse, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === 'raw' && (
            <>
              <div className="data-content">
                <div className="data-left">
                  <h4>Raw Envelope Payload</h4>
                  <textarea
                    className="raw-envelope-input"
                    placeholder={`{"sdk":{"name":"sentry.javascript.browser","version":"10.19.0"}}
{"type":"trace_metric","item_count":1,"content_type":"application/vnd.sentry.items.trace-metric+json"}
{"items":[{"timestamp":1761343560.7496,"trace_id":"c6544b95d59f481599f4b65303bf9be5","name":"app.count","type":"counter","value":10,"attributes":{"version":{"value":"58","type":"string"},"some_ip":{"value":"192.168.1.1","type":"string"},"sentry.sdk.name":{"value":"sentry.javascript.browser","type":"string"},"sentry.sdk.version":{"value":"10.19.0","type":"string"}}}]}`}
                    value={rawEnvelopePayload}
                    onChange={(e) => setRawEnvelopePayload(e.target.value)}
                    rows={15}
                  />
                </div>
                
                <div className="vertical-divider"></div>
                
                <div className="data-right">
                  <h4>Normalized Payload Preview</h4>
                  <pre className="json-preview">
                    {getRawEnvelopePreview()}
                  </pre>
                </div>
              </div>
              
              <p>
                <button onClick={sendRawEnvelope}>SEND RAW ENVELOPE</button>
              </p>
            </>
          )}
        </div>
      </header>
    </div>
  );
}
/* eslint-enable no-undef */

function Button({ children }) {
  Sentry;
  return (
    <button
      onClick={() => {
        Sentry.withScope((scope) => {
          // scope is the current scope inside of this callback!
          scope.setTag("my-tag", "my value");
          // this tag will only be applied to events captured inside of this callback
          // the following event will have the tag:
          scope.captureException(new Error("my error"));
        });
        throw new Error("This is your first error!");
      }}
    >
      {children}
    </button>
  );
}

export default App;
