import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import log from "electron-log";
import { BackendManager } from "./backend-manager";
import { LlamafileManager } from "./llamafile-manager";
import { findFreePort } from "./port-finder";

const isDev = process.argv.includes("--dev");

let mainWindow: BrowserWindow | null = null;
let backendManager: BackendManager | null = null;
let llamafileManager: LlamafileManager | null = null;

async function createWindow(port: number): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: "FOLIO Mapper",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    await mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function registerLlamafileIPC(): void {
  ipcMain.handle("llamafile:get-status", () => {
    return llamafileManager?.getStatus() ?? { state: "idle" };
  });

  ipcMain.handle("llamafile:get-port", () => {
    return llamafileManager?.getPort() ?? null;
  });

  ipcMain.handle("llamafile:list-models", () => {
    return llamafileManager?.listModels() ?? [];
  });

  ipcMain.handle("llamafile:download-model", async (_event, modelId: string) => {
    if (!llamafileManager) throw new Error("Llamafile manager not initialized");
    await llamafileManager.downloadModel(modelId);
  });

  ipcMain.handle("llamafile:delete-model", (_event, modelId: string) => {
    if (!llamafileManager) throw new Error("Llamafile manager not initialized");
    llamafileManager.deleteModel(modelId);
  });

  ipcMain.handle("llamafile:set-active-model", async (_event, modelId: string) => {
    if (!llamafileManager) throw new Error("Llamafile manager not initialized");
    llamafileManager.setActiveModel(modelId);
    // Restart llamafile if currently running
    const status = llamafileManager.getStatus();
    if (status.state === "ready") {
      await llamafileManager.restart();
    }
  });

  ipcMain.handle("llamafile:get-active-model", () => {
    return llamafileManager?.getActiveModel() ?? null;
  });
}

async function startApp(): Promise<void> {
  const port = isDev ? 8000 : await findFreePort();

  if (!isDev) {
    backendManager = new BackendManager(port);
    backendManager.start(process.resourcesPath);

    log.info(`Waiting for backend on port ${port}...`);
    await backendManager.waitForReady();
    log.info("Backend is ready");
  }

  // Register IPC handlers before window creation
  registerLlamafileIPC();

  await createWindow(port);

  // Start llamafile setup in background (non-blocking)
  const llamafilePort = await findFreePort();
  llamafileManager = new LlamafileManager(app.getPath("userData"), llamafilePort);
  llamafileManager.setup().catch((err) => {
    log.error("[llamafile] Background setup failed:", err);
  });
}

app.whenReady().then(() => {
  startApp().catch((err) => {
    log.error("Failed to start:", err);
    app.quit();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

let isQuitting = false;
app.on("before-quit", (e) => {
  if (isQuitting) return;
  e.preventDefault();
  isQuitting = true;

  const cleanup = async () => {
    if (llamafileManager) {
      await llamafileManager.stop();
    }
    if (backendManager) {
      await backendManager.stop();
    }
  };

  cleanup()
    .catch((err) => log.error("Cleanup error:", err))
    .finally(() => app.quit());
});
