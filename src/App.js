import React from 'react';
import logo from './logo.svg';
import './App.css';

/* eslint-disable no-undef */
function App() {
  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.js</code> and save to reload.
        </p>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>

        <button onClick={methodDoesNotExist}>Broken Button</button>;
      </header>
    </div>
  );
}
/* eslint-enable no-undef */

export default App;
