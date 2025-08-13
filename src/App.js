import React, { Fragment } from "react";
import logo from "./sentry-logo.svg";
import "./App.css";

import { logger } from "@sentry/browser";
const { error, info, fmt } = logger;

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
    const payInfo = { payment: { paymentId: 1312, paymentType: "card" } };
    const code = { "code.line.number": 115.0 };
    const ip = "31.41.115.122";
    const card = "4111111111111111";
    const query = "something something 31.41.115.122 " + card;
    info(fmt`info: ${longBody} query:${query} ip:${ip} card:${card}`, {
      user,
      payInfo,
      ip,
      card,
      ...code,
    });
  }

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo pixelated" alt="sentry logo" />
        <p className="glitch-text" data-text="SENTRY TEST APP">SENTRY TEST APP</p>
        <p className="glitch-text" data-text="ERROR MONITORING SYSTEM">ERROR MONITORING SYSTEM</p>
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
