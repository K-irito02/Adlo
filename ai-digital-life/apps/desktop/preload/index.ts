import { contextBridge, ipcRenderer } from "electron";
import type { DigitalLifeBridge } from "../shared/ipc";

const api: DigitalLifeBridge = {
  app: {
    getInfo: () => ipcRenderer.invoke("app:getInfo"),
    getHealth: () => ipcRenderer.invoke("app:getHealth")
  },
  workspace: {
    listRecent: () => ipcRenderer.invoke("workspace:listRecent"),
    open: (workspacePath: string) => ipcRenderer.invoke("workspace:open", workspacePath)
  },
  retrieval: {
    getStatus: () => ipcRenderer.invoke("retrieval:getStatus")
  }
};

contextBridge.exposeInMainWorld("digitalLife", api);
