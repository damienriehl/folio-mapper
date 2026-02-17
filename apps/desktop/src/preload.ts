import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  llamafile: {
    getStatus: () => ipcRenderer.invoke("llamafile:get-status"),
    getPort: () => ipcRenderer.invoke("llamafile:get-port"),
    listModels: () => ipcRenderer.invoke("llamafile:list-models"),
    downloadModel: (modelId: string) => ipcRenderer.invoke("llamafile:download-model", modelId),
    deleteModel: (modelId: string) => ipcRenderer.invoke("llamafile:delete-model", modelId),
    setActiveModel: (modelId: string) => ipcRenderer.invoke("llamafile:set-active-model", modelId),
    getActiveModel: () => ipcRenderer.invoke("llamafile:get-active-model"),
  },
});
