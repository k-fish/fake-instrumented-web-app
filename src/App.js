import React, { Fragment, useState } from "react";
import logo from "./sentry-logo.svg";
import "./App.css";

import { logger } from "@sentry/browser";
import * as Sentry from "@sentry/browser";
const { error, info, fmt } = logger;

const longBody = `Added item to shopping cart: Xbox One X 500 GB 2018 Payment failure detected | userId=12345 | orderId=67890 | paymentMethod="Credit Card" |
amount=199.99 | retryCount=2 | errorCode="PAYMENT_TIMEOUT" | timestamp="2024-11-15T14:32:07Z" |
Request failed after 3 seconds, network timeout at /payments/process endpoint, initiated by user action. |
correlationId=1234567890`;

/* eslint-disable no-undef */
function App() {
  const [extraData, setExtraData] = useState([{ key: "", value: "" }]);

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

    info(fmt`info: ${longBody} query:${query} ip:${ip} card:${card}`, {
      user,
      payInfo,
      ip,
      card,
      ...code,
      attributes,
    });

    // Immediate flush
    Sentry.flush(2000).then(() => {
      console.log('Log sent to Sentry');
    });
  }

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

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo pixelated" alt="sentry logo" />
        {/* <p className="glitch-text" data-text="SENTRY TEST APP">SENTRY TEST APP</p>
        <p className="glitch-text" data-text="ERROR MONITORING SYSTEM">ERROR MONITORING SYSTEM</p> */}
        
        <div className="extra-data-section">
          <h3>Extra Data</h3>
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
          <button data-button-size="sm" onClick={addExtraDataRow}>Add</button>
        </div>

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
