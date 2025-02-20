import React, { Fragment } from "react";
import logo from "./logo.svg";
import "./App.css";

import { _experiment_log } from "@sentry/browser";
const { error, log } = _experiment_log;

const longBody = `Added item to shopping cart: Xbox One X 500 GB 2018 Payment failure detected | userId=12345 | orderId=67890 | paymentMethod="Credit Card" |
amount=199.99 | retryCount=2 | errorCode="PAYMENT_TIMEOUT" | timestamp="2024-11-15T14:32:07Z" |
Request failed after 3 seconds, network timeout at /payments/process endpoint, initiated by user action. |
correlationId=1234567890`;

/* eslint-disable no-undef */
function App() {
  function callMethodThatDoesntExist() {
    const methodName = "capture";
    error("Method doesn't exist", { methodName });
  }

  function callLog() {
    const user = 123;
    log(longBody, { user });
  }

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>Test Application</p>
        <p>
          <button onClick={callMethodThatDoesntExist}>Capture Error Log</button>
          <button onClick={callLog}>Capture Error Log</button>
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
