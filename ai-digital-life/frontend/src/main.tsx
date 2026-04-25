import React from "react";
import { createRoot } from "react-dom/client";
import type { DigitalLifeBridge } from "./shared/ipc";
import { setupMockBridge } from "./mock-bridge";
import { App } from "./app/App";
import { themeController } from "./app/theme";
import "./styles/index.css";

if (typeof window !== "undefined" && !window.digitalLife) {
  setupMockBridge();
}

declare global {
  interface Window {
    digitalLife: DigitalLifeBridge;
  }
}

void themeController.hydrate();

const container = document.getElementById("app");
if (!container) {
  throw new Error("App root not found.");
}

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
