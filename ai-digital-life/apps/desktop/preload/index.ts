import { contextBridge, ipcRenderer } from "electron";
import type { DigitalLifeBridge } from "../shared/ipc";

const api: DigitalLifeBridge = {
  app: {
    getInfo: () => ipcRenderer.invoke("app:getInfo"),
    getHealth: () => ipcRenderer.invoke("app:getHealth"),
    getDiagnostics: () => ipcRenderer.invoke("app:getDiagnostics"),
    getModelHealth: () => ipcRenderer.invoke("app:getModelHealth"),
    updatePreferences: (patch) => ipcRenderer.invoke("app:updatePreferences", patch)
  },
  workspace: {
    listRecent: () => ipcRenderer.invoke("workspace:listRecent"),
    open: (workspacePath: string) => ipcRenderer.invoke("workspace:open", workspacePath),
    readFile: (relativePath: string) => ipcRenderer.invoke("workspace:readFile", relativePath),
    search: (query: string) => ipcRenderer.invoke("workspace:search", query),
    outline: (relativePath: string) => ipcRenderer.invoke("workspace:outline", relativePath),
    onFileChanged: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: unknown) => {
        listener(payload as Parameters<typeof listener>[0]);
      };
      ipcRenderer.on("workspace:fileChanged", handler);
      return () => {
        ipcRenderer.removeListener("workspace:fileChanged", handler);
      };
    }
  },
  retrieval: {
    getStatus: () => ipcRenderer.invoke("retrieval:getStatus")
  },
  conversation: {
    createSession: (title?: string) => ipcRenderer.invoke("conversation:createSession", title),
    listSessions: () => ipcRenderer.invoke("conversation:listSessions"),
    getSession: (sessionId: string) => ipcRenderer.invoke("conversation:getSession", sessionId),
    sendMessage: (input) => ipcRenderer.invoke("conversation:sendMessage", input),
    cancelMessage: (runId: string) => ipcRenderer.invoke("conversation:cancelMessage", runId)
  },
  agent: {
    startRun: (input) => ipcRenderer.invoke("agent:startRun", input),
    getRun: (runId: string) => ipcRenderer.invoke("agent:getRun", runId),
    retryRun: (runId: string) => ipcRenderer.invoke("agent:retryRun", runId),
    abortRun: (runId: string) => ipcRenderer.invoke("agent:abortRun", runId)
  },
  patch: {
    getPatchSet: (patchSetId: string) => ipcRenderer.invoke("patch:getPatchSet", patchSetId),
    setHunkDecision: (input) => ipcRenderer.invoke("patch:setHunkDecision", input),
    applyPatchSet: (patchSetId: string) => ipcRenderer.invoke("patch:applyPatchSet", patchSetId),
    rollbackPatchSet: (patchSetId: string) => ipcRenderer.invoke("patch:rollbackPatchSet", patchSetId)
  },
  command: {
    getProfiles: () => ipcRenderer.invoke("command:getProfiles"),
    run: (input) => ipcRenderer.invoke("command:run", input)
  },
  task: {
    getSnapshot: () => ipcRenderer.invoke("task:getSnapshot"),
    getCheckpointPreview: (checkpointId) => ipcRenderer.invoke("task:getCheckpointPreview", checkpointId),
    restoreCheckpoint: (checkpointId) => ipcRenderer.invoke("task:restoreCheckpoint", checkpointId),
    decideApproval: (input) => ipcRenderer.invoke("task:decideApproval", input)
  }
};

contextBridge.exposeInMainWorld("digitalLife", api);
