import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import Toaster from "./components/Toaster";
import { applyDarkModeAtBoot } from "./lib/darkMode";
import { initSentry } from "./lib/sentry";

// StrictMode disabled: double-running effects races with Firebase auth restoration on full page reload.
applyDarkModeAtBoot();
initSentry();
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
    <Toaster />
  </ErrorBoundary>,
);
