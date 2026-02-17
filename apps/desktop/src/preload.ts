import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
});
