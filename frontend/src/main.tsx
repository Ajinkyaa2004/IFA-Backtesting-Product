import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { initSentry } from "./lib/sentry";

// StrictMode disabled: double-running effects races with Firebase auth restoration on full page reload.
initSentry();
createRoot(document.getElementById("root")!).render(<App />);
