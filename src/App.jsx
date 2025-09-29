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
  const [metricName, setMetricName] = useState('');
  const [metricType, setMetricType] = useState('count');
  const [metricValue, setMetricValue] = useState('');
  const [metricUnit, setMetricUnit] = useState('');
  const [metricNameHistory, setMetricNameHistory] = useState(() => {
    const saved = localStorage.getItem('metricNameHistory');
    return saved ? JSON.parse(saved) : [];
  });
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    localStorage.setItem('extraData', JSON.stringify(extraData));
  }, [extraData]);
  
  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);
  
  useEffect(() => {
    localStorage.setItem('metricNameHistory', JSON.stringify(metricNameHistory));
  }, [metricNameHistory]);

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
      // Convert value appropriately - sets use string values, others use numeric
      let processedValue;
      if (metricType === 'set') {
        if (!metricValue.trim()) {
          console.error('Set metric requires a valid identifier');
          return;
        }
        processedValue = metricValue.trim();
      } else {
        processedValue = parseFloat(metricValue);
        if (isNaN(processedValue)) {
          console.error('Numeric metrics require a valid numeric value');
          return;
        }
      }
      
      // Call the appropriate Sentry metrics method
      if (Sentry.metrics) {
        switch (metricType) {
          case 'count':
            Sentry.metrics.count(metricName, processedValue, attributes);
            break;
          case 'gauge':
            if (metricUnit) {
              Sentry.metrics.gauge(metricName, processedValue, metricUnit, attributes);
            } else {
              Sentry.metrics.gauge(metricName, processedValue, attributes);
            }
            break;
          case 'histogram':
            if (metricUnit) {
              Sentry.metrics.histogram(metricName, processedValue, metricUnit, attributes);
            } else {
              Sentry.metrics.histogram(metricName, processedValue, attributes);
            }
            break;
          case 'distribution':
            if (metricUnit) {
              Sentry.metrics.distribution(metricName, processedValue, metricUnit, attributes);
            } else {
              Sentry.metrics.distribution(metricName, processedValue, attributes);
            }
            break;
          case 'set':
            // For sets, the value should be a string identifier
            Sentry.metrics.set(metricName, processedValue, attributes);
            break;
          default:
            console.error('Unknown metric type:', metricType);
            return;
        }
        
        console.log('Metric sent to Sentry:', {
          name: metricName,
          type: metricType,
          value: processedValue,
          unit: metricUnit,
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
          unit: metricUnit,
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
    
    // Add unit for types that support it
    if (metricUnit && ['gauge', 'histogram', 'distribution'].includes(metricType)) {
      payload.unit = metricUnit;
    }
    
    return payload;
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
                        <option value="histogram">Histogram</option>
                        <option value="distribution">Distribution</option>
                        <option value="set">Set</option>
                      </select>
                    </div>
                    
                    {['gauge', 'histogram', 'distribution'].includes(metricType) && (
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
                    )}
                    
                    <div className="metric-input-group">
                      <label>{metricType === 'set' ? 'Identifier:' : 'Value:'}</label>
                      <input
                        type={metricType === 'set' ? 'text' : 'number'}
                        placeholder={metricType === 'set' ? 'Enter unique identifier' : 'Enter numeric value'}
                        value={metricValue}
                        onChange={(e) => setMetricValue(e.target.value)}
                        className="metric-input"
                      />
                      {metricType === 'set' && (
                        <small className="metric-help-text">
                          For sets, provide a unique string identifier (e.g., user-123, session-abc)
                        </small>
                      )}
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
