import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  llamafile: {
    getStatus: () => ipcRenderer.invoke("llamafile:get-status"),
    getPort: () => ipcRenderer.invoke("llamafile:get-port"),
  },
});
