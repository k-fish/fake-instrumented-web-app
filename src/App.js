import React, { Fragment, useState, useEffect } from "react";
import "./App.css";
import DSNPicker from "./DSNPicker";

import { logger } from "@sentry/browser";
import * as Sentry from "@sentry/browser";
const { error, info, fmt } = logger;

const longBody = `Added item to shopping cart: Xbox One X 500 GB 2018 Payment failure detected | userId=12345 | orderId=67890 | paymentMethod="Credit Card" |
amount=199.99 | retryCount=2 | errorCode="PAYMENT_TIMEOUT" | timestamp="2024-11-15T14:32:07Z" |
Request failed after 3 seconds, network timeout at /payments/process endpoint, initiated by user action. |
correlationId=1234567890`;

/* eslint-disable no-undef */
function App() {
  const [extraData, setExtraData] = useState(() => {
    const saved = localStorage.getItem('extraData');
    return saved ? JSON.parse(saved) : [{ key: "", value: "" }];
  });
  const [logSeverity, setLogSeverity] = useState('info');
  const [fullText, setFullText] = useState(longBody);

  useEffect(() => {
    localStorage.setItem('extraData', JSON.stringify(extraData));
  }, [extraData]);

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
    logFunction(fmt`${logSeverity}: ${fullText} query:${query} ip:${ip} card:${card}`, logPayload);

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

  return (
    <div className="App">
      <header className="App-header">
        <svg className="App-logo pixelated" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 66" width="150" height="150">
          <path d="M29,2.26a4.67,4.67,0,0,0-8,0L14.42,13.53A32.21,32.21,0,0,1,32.17,40.19H27.55A27.68,27.68,0,0,0,12.09,17.47L6,28a15.92,15.92,0,0,1,9.23,12.17H4.62A.76.76,0,0,1,4,39.06l2.94-5a10.74,10.74,0,0,0-3.36-1.9l-2.91,5a4.54,4.54,0,0,0,1.69,6.24A4.66,4.66,0,0,0,4.62,44H19.15a19.4,19.4,0,0,0-8-17.31l2.31-4A23.87,23.87,0,0,1,23.76,44H36.07a35.88,35.88,0,0,0-16.41-31.8l4.67-8a.77.77,0,0,1,1.05-.27c.53.29,20.29,34.77,20.66,35.17a.76.76,0,0,1-.68,1.13H40.6q.09,1.91,0,3.81h4.78A4.59,4.59,0,0,0,50,39.43a4.49,4.49,0,0,0-.62-2.28Z" transform="translate(11, 11)" fill="#362d59"></path>
        </svg>
        {/* <p className="glitch-text" data-text="SENTRY TEST APP">SENTRY TEST APP</p>
        <p className="glitch-text" data-text="ERROR MONITORING SYSTEM">ERROR MONITORING SYSTEM</p> */}
        
        <div className="extra-data-section">
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
              <h4>Extra Data</h4>
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
        </div>

        <DSNPicker />

        <p>
          <button onClick={callMethodThatDoesntExist}>CAPTURE ERROR</button>
          <button onClick={callLog}>CAPTURE LOG</button>
        </p>
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
