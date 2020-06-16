import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import * as serviceWorker from './serviceWorker';

import * as Sentry from '@sentry/browser';
import { Integrations as ApmIntegrations } from '@sentry/apm';

Sentry.init({
  dsn: "https://4319117d362641cda31914679645d2b6@o408219.ingest.sentry.io/5278709",
  integrations: [
    new ApmIntegrations.Tracing(),
  ],
  tracesSampleRate: 1.0,
});

const timeout = (wait) => new Promise(resolve => setTimeout(resolve, wait));

const fakeTracingFunction = async (time, maxJitter = 0) => {
  let jitterLabel = maxJitter ? '-jitter' : '';
  const transaction = Sentry.startTransaction({name: `test-transaction-${time}${jitterLabel}`});
  const span = transaction.startChild({op: 'functionX'}); // This function returns a Span

  const jitter = parseInt(maxJitter * Math.random(), 10);
  await timeout(time + jitter);

  span.finish(); // Remember that only finished spans will be sent with the transaction
  transaction.finish(); // Finishing the transaction will send it to Sentry
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

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById('root')
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
