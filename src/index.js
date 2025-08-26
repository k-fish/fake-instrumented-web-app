import React from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import App from "./App";
import * as serviceWorker from "./serviceWorker";

import * as Sentry from "@sentry/browser";

const ADD_RANDOM_TAGS = false;

const SENTRY_INTEGRATIONS = [
  // Sentry.browserTracingIntegration(),
];
const randomCharacters = () =>
  Math.random()
    .toString(36)
    .replace(/[^a-z]+/g, "")
    .substr(0, 5);

const dsnEU = `https://e548fcedc35a3a0d2bd712212f3df50b@o4507154197774336.ingest.de.sentry.io/4509078681747536`;
const dsnl2 =
  "http://e0bc3e6090a4f8a822108aff6fd15a86@sentry.dev.getsentry.net:8000/2";
const dsnl =
  "http://072dda62717bd34a1457af2c28e7494b@sentry.dev.getsentry.net:8000/4";
const dsn4 =
  "https://0a7473685132dfcf2fbb9352c32d308d@sentry.my.sentry.io/4508728444321793";
const dsnkfish =
  "https://b8793daed00c88032f55a4649b1e85a8@o1.ingest.us.sentry.io/4508892109012993"; // test-kfish logs
const dsnabhi =
  "https://1238b05a4527146d02d1608e205128e7@o447951.ingest.us.sentry.io/4508920403722240";
const dsnnewl =
  "http://ca8c0eadaed7c908e266b0506371cf78@sentry.dev.getsentry.net:8000/2";
// const dsnlocal =
//   "http://ca8c0eadaed7c908e266b0506371cf78@sentry.dev.getsentry.net:80/2";
// const dsnLocalViaProxy = "http://6ffbcc9a36d21d024ee8b2d487c7f0d3@sentry.dev.getsentry.net:8000/2";
const dsnmagikrop = "https://73acf70525a17b22d278f2514e483e48@o408219.ingest.us.sentry.io/4509878521167872"
const dsnprod = "https://b8793daed00c88032f55a4649b1e85a8@o1.ingest.us.sentry.io/4508892109012993"
const dsnLocalViaProxy = "http://6ffbcc9a36d21d024ee8b2d487c7f0d3@sentry.dev.getsentry.net:3001/2";
// const dsnlocal =
//   "http://6ffbcc9a36d21d024ee8b2d487c7f0d3@sentry.dev.getsentry.net:3001/2";

const dsn = dsnmagikrop;

Sentry.init({
  dsn: dsn,
  Integrations: SENTRY_INTEGRATIONS,
  // Tracing
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
  // Set 'tracePropagationTargets' to control for which URLs distributed tracing should be enabled
  tracePropagationTargets: ["localhost", /^https:\/\/yourserver\.io\/api/],
  enableLogs: true,
});

// Set device context via setContext
Sentry.setContext("device", {
  uuid: "new-test-uuid",
});

const timeout = (wait) => new Promise((resolve) => setTimeout(resolve, wait));

const getTransactionTags = () => {
  if (ADD_RANDOM_TAGS) {
    return {
      [`test-tag--${randomCharacters()}`]: `test-value--${randomCharacters()}`,
    };
  }
  return {};
};

const fakeTracingFunction = async (time, maxJitter = 0) => {
  let jitterLabel = maxJitter ? "-jitter" : "";
  // const transaction = Sentry.startTransaction({
  //   name: `test-transaction-${time}${jitterLabel}`,
  //   tags: getTransactionTags()
  // });
  // const span = transaction.startChild({op: 'functionX'}); // This function returns a Span
  //
  // const jitter = parseInt(maxJitter * Math.random(), 10);
  // await timeout(time + jitter);
  //
  // span.finish(); // Remember that only finished spans will be sent with the transaction
  // transaction.finish(); // Finishing the transaction will send it to Sentry
};

fakeTracingFunction(1, 2000);
fakeTracingFunction(10, 90);
fakeTracingFunction(100);
fakeTracingFunction(200);
fakeTracingFunction(300);
fakeTracingFunction(400);
fakeTracingFunction(500);
fakeTracingFunction(1000);
fakeTracingFunction(1000, 400); // for misery 1200 w/ jitter
fakeTracingFunction(1500);
fakeTracingFunction(2000);
fakeTracingFunction(3000, 7000);

const container = document.getElementById("root");
const root = createRoot(container);
root.render(<App />);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
