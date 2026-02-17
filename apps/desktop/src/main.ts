import { app, BrowserWindow } from "electron";
import * as path from "path";
import log from "electron-log";
import { BackendManager } from "./backend-manager";
import { findFreePort } from "./port-finder";

const isDev = process.argv.includes("--dev");

let mainWindow: BrowserWindow | null = null;
let backendManager: BackendManager | null = null;

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

async function startApp(): Promise<void> {
  const port = isDev ? 8000 : await findFreePort();

  if (!isDev) {
    backendManager = new BackendManager(port);
    backendManager.start(process.resourcesPath);

    log.info(`Waiting for backend on port ${port}...`);
    await backendManager.waitForReady();
    log.info("Backend is ready");
  }

  await createWindow(port);
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

app.on("before-quit", async () => {
  if (backendManager) {
    await backendManager.stop();
  }
});
