import { createRoot } from "react-dom/client";
import type { DigitalLifeBridge } from "./shared/ipc";
import { setupPreviewBridge } from "./preview-bridge";
import { createTauriBridge, isTauriShell } from "./tauri-bridge";
import { App } from "./app/App";
import { themeController } from "./app/utils/theme";
import "./styles/index.css";

if (typeof window !== "undefined" && !window.digitalLife) {
  if (isTauriShell()) {
    window.digitalLife = createTauriBridge();
    document.documentElement.dataset.shell = "tauri";
  } else {
    setupPreviewBridge();
    document.documentElement.dataset.shell = "browser";
  }
}

async function syncTauriWindowIcon(): Promise<void> {
  if (typeof window === "undefined" || !isTauriShell()) {
    return;
  }

  try {
    const response = await fetch("/logo-chatgpt.png", { cache: "force-cache" });
    if (!response.ok) {
      return;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setIcon(bytes);
  } catch {
    // Best-effort only. Tauri still falls back to bundled icons.
  }
}

void syncTauriWindowIcon();

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

createRoot(container).render(<App />);
