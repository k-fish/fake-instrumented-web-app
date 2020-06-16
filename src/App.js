import React from 'react';
import logo from './logo.svg';
import './App.css';

/* eslint-disable no-undef */
function App() {
  function callMethodThatDoesntExist() {
    foo();
  }

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Test Application
        </p>
        <p>
          <button onClick={callMethodThatDoesntExist}>Broken Button</button>
        </p>
      </header>
    </div>
  );
}
/* eslint-enable no-undef */

export default App;
