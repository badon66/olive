import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./styles/index.css";
import App from "./App";

// The service worker answers every navigation from its precached app shell, so
// a new deploy is NOT picked up on the visit that downloads it — the old shell
// renders first and the new worker only takes over on the *next* load. Without
// this you are permanently one page-load behind production.
//
// `immediate` activates a newly installed worker straight away; vite-plugin-pwa's
// autoUpdate register then reloads the page once that worker takes control.
// The interval matters for how Olive is actually used: left open on the portrait
// monitor for hours, a tab that never navigates would otherwise never look for a
// new build.
const UPDATE_CHECK_MS = 60 * 60 * 1000; // hourly

registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    setInterval(() => void registration.update(), UPDATE_CHECK_MS);
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
