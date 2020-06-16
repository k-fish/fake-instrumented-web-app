import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import * as serviceWorker from './serviceWorker';

import * as Sentry from '@sentry/browser';
import { Integrations as ApmIntegrations } from '@sentry/apm';

Sentry.init({
  dsn: 'http://6e416ae2cdef4f56aeeabd91924898b9@localhost:8000/2',
  integrations: [
    new ApmIntegrations.Tracing(),
  ],
  tracesSampleRate: 0.99,
});

const timeout = (wait) => new Promise(resolve => setTimeout(resolve, wait));

const fakeTracingFunction = async () => {
  const transaction = Sentry.startTransaction({name: 'test-transaction'});
  const span = transaction.startChild({op: 'functionX'}); // This function returns a Span

  await timeout(2000);

  span.finish(); // Remember that only finished spans will be sent with the transaction
  transaction.finish(); // Finishing the transaction will send it to Sentry
};

fakeTracingFunction();

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
