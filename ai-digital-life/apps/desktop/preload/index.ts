import { contextBridge, ipcRenderer } from "electron";
import type { DigitalLifeBridge } from "../shared/ipc";

const api: DigitalLifeBridge = {
  app: {
    getInfo: () => ipcRenderer.invoke("app:getInfo"),
    getHealth: () => ipcRenderer.invoke("app:getHealth"),
    getDiagnostics: () => ipcRenderer.invoke("app:getDiagnostics"),
    updatePreferences: (patch) => ipcRenderer.invoke("app:updatePreferences", patch)
  },
  workspace: {
    listRecent: () => ipcRenderer.invoke("workspace:listRecent"),
    open: (workspacePath: string) => ipcRenderer.invoke("workspace:open", workspacePath)
  },
  retrieval: {
    getStatus: () => ipcRenderer.invoke("retrieval:getStatus")
  },
  task: {
    getSnapshot: () => ipcRenderer.invoke("task:getSnapshot"),
    getCheckpointPreview: (checkpointId) => ipcRenderer.invoke("task:getCheckpointPreview", checkpointId),
    restoreCheckpoint: (checkpointId) => ipcRenderer.invoke("task:restoreCheckpoint", checkpointId),
    decideApproval: (input) => ipcRenderer.invoke("task:decideApproval", input)
  }
};

contextBridge.exposeInMainWorld("digitalLife", api);
