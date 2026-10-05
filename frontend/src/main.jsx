import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { configureSessionRuntime, getSessionRuntime } from './api/runtimeFetch.mjs';

// Production must match the strict backend. Development stays legacy until its
// tested cutover; explicit candidate/native flags always take precedence.
const sessionAuth = typeof __COOKBOOK_SESSION_AUTH__ !== 'undefined'
  ? __COOKBOOK_SESSION_AUTH__ : import.meta.env.PROD;
if (sessionAuth && !getSessionRuntime()) {
  configureSessionRuntime({ transport: 'browser' });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Native builds own their packaged shell; a web service worker can hide updates.
// Do not unregister unrelated workers or clear any browser data.
if ("serviceWorker" in navigator && !window.Capacitor?.isNativePlatform?.()) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support degrades gracefully — the app works fine without it.
    });
  });
}
