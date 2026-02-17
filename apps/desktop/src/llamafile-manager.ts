import { ChildProcess, spawn } from "child_process";
import * as fs from "fs";
import * as https from "https";
import * as http from "http";
import * as path from "path";
import log from "electron-log";
import type { ModelCatalogEntry, ModelStatus } from "./model-catalog";
import { MODEL_CATALOG } from "./model-catalog";

const GITHUB_API_RELEASES =
  "https://api.github.com/repos/mozilla-ai/llamafile/releases/latest";
const READY_POLL_INTERVAL_MS = 1000;
const READY_TIMEOUT_MS = 120_000;
const MIN_MODEL_SIZE = 100_000_000; // 100MB — any real GGUF is much larger

export type LlamafileState =
  | "idle"
  | "preparing"
  | "downloading-runtime"
  | "downloading-model"
  | "starting"
  | "ready"
  | "error";

export interface LlamafileStatus {
  state: LlamafileState;
  progress?: { bytesDownloaded: number; bytesTotal: number };
  runtimeVersion?: string;
  modelName?: string;
  error?: string;
}

interface VersionInfo {
  version: string;
  updated: string;
}

interface LlamafileConfig {
  activeModelId: string | null;
}

export class LlamafileManager {
  private process: ChildProcess | null = null;
  private activeRequest: http.ClientRequest | null = null;
  private port: number;
  private basePath: string;
  private status: LlamafileStatus = { state: "idle" };
  private modelDownloadProgress: Map<string, { bytesDownloaded: number; bytesTotal: number }> = new Map();
  private modelDownloadRequests: Map<string, http.ClientRequest> = new Map();

  constructor(basePath: string, port: number) {
    this.basePath = basePath;
    this.port = port;
  }

  getStatus(): LlamafileStatus {
    return { ...this.status };
  }

  getPort(): number {
    return this.port;
  }

  // --- Config persistence ---

  private getConfigPath(): string {
    return path.join(this.basePath, "llamafile-config.json");
  }

  private loadConfig(): LlamafileConfig {
    try {
      const configPath = this.getConfigPath();
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, "utf-8")) as LlamafileConfig;
      }
    } catch {
      // Corrupted config, use defaults
    }
    return { activeModelId: null };
  }

  private saveConfig(config: LlamafileConfig): void {
    fs.writeFileSync(this.getConfigPath(), JSON.stringify(config, null, 2));
  }

  // --- Active model ---

  getActiveModel(): string | null {
    return this.loadConfig().activeModelId;
  }

  setActiveModel(modelId: string): void {
    const entry = MODEL_CATALOG.find((m) => m.id === modelId);
    if (!entry) throw new Error(`Unknown model: ${modelId}`);

    const modelPath = path.join(this.basePath, "models", entry.filename);
    if (!fs.existsSync(modelPath)) {
      throw new Error(`Model not downloaded: ${entry.name}`);
    }

    const config = this.loadConfig();
    config.activeModelId = modelId;
    this.saveConfig(config);
    log.info(`[llamafile] Active model set to: ${entry.name}`);
  }

  private getActiveModelEntry(): ModelCatalogEntry {
    const config = this.loadConfig();
    if (config.activeModelId) {
      const entry = MODEL_CATALOG.find((m) => m.id === config.activeModelId);
      if (entry) return entry;
    }
    // Default to first recommended or first model
    return MODEL_CATALOG.find((m) => m.recommended) || MODEL_CATALOG[0];
  }

  // --- Model listing ---

  listModels(): ModelStatus[] {
    const modelsDir = path.join(this.basePath, "models");
    const config = this.loadConfig();

    return MODEL_CATALOG.map((entry) => {
      const modelPath = path.join(modelsDir, entry.filename);
      let downloaded = false;
      if (fs.existsSync(modelPath)) {
        const stats = fs.statSync(modelPath);
        downloaded = stats.size > MIN_MODEL_SIZE;
      }

      const progress = this.modelDownloadProgress.get(entry.id);
      const isDownloading = this.modelDownloadRequests.has(entry.id);

      return {
        id: entry.id,
        name: entry.name,
        filename: entry.filename,
        description: entry.description,
        sizeBytes: entry.sizeBytes,
        recommended: entry.recommended,
        downloaded,
        active: config.activeModelId === entry.id ||
          (!config.activeModelId && !!entry.recommended && downloaded),
        downloadState: isDownloading ? "downloading" as const : downloaded ? "complete" as const : "idle" as const,
        downloadProgress: progress ? { ...progress } : undefined,
      };
    });
  }

  // --- Model download/delete ---

  async downloadModel(modelId: string): Promise<void> {
    const entry = MODEL_CATALOG.find((m) => m.id === modelId);
    if (!entry) throw new Error(`Unknown model: ${modelId}`);

    if (this.modelDownloadRequests.has(modelId)) {
      throw new Error(`Already downloading: ${entry.name}`);
    }

    const modelsDir = path.join(this.basePath, "models");
    fs.mkdirSync(modelsDir, { recursive: true });

    const modelPath = path.join(modelsDir, entry.filename);
    log.info(`[llamafile] Downloading model ${entry.name}...`);

    await this.downloadModelFile(modelId, entry.url, modelPath, entry.sizeBytes);

    // Validate
    const downloadedSize = fs.statSync(modelPath).size;
    if (downloadedSize < MIN_MODEL_SIZE) {
      fs.unlinkSync(modelPath);
      throw new Error(
        `Model download appears corrupt (${(downloadedSize / 1024 / 1024).toFixed(1)} MB). ` +
        `Expected at least ${MIN_MODEL_SIZE / 1024 / 1024} MB.`
      );
    }

    log.info(`[llamafile] Model ${entry.name} downloaded (${(downloadedSize / 1024 / 1024 / 1024).toFixed(1)} GB)`);
  }

  deleteModel(modelId: string): void {
    const entry = MODEL_CATALOG.find((m) => m.id === modelId);
    if (!entry) throw new Error(`Unknown model: ${modelId}`);

    // Cancel download if in progress
    const req = this.modelDownloadRequests.get(modelId);
    if (req) {
      req.destroy();
      this.modelDownloadRequests.delete(modelId);
      this.modelDownloadProgress.delete(modelId);
    }

    const modelPath = path.join(this.basePath, "models", entry.filename);
    const tmpPath = modelPath + ".tmp";

    if (fs.existsSync(modelPath)) {
      fs.unlinkSync(modelPath);
      log.info(`[llamafile] Deleted model: ${entry.name}`);
    }
    if (fs.existsSync(tmpPath)) {
      fs.unlinkSync(tmpPath);
    }

    // Clear active model if this was active
    const config = this.loadConfig();
    if (config.activeModelId === modelId) {
      config.activeModelId = null;
      this.saveConfig(config);
    }
  }

  /**
   * Full lifecycle: download runtime + model, then start the server.
   * Designed to be called without awaiting (non-blocking).
   */
  async setup(): Promise<void> {
    try {
      this.status = { state: "preparing" };
      this.cleanupTmpFiles();
      await this.ensureRuntime();
      await this.ensureModel();
      await this.start();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`[llamafile] Setup failed: ${msg}`);
      this.status = { state: "error", error: msg };
    }
  }

  private cleanupTmpFiles(): void {
    for (const dir of ["llamafile", "models"]) {
      const fullDir = path.join(this.basePath, dir);
      if (!fs.existsSync(fullDir)) continue;
      for (const file of fs.readdirSync(fullDir)) {
        if (file.endsWith(".tmp")) {
          try {
            fs.unlinkSync(path.join(fullDir, file));
            log.info(`[llamafile] Cleaned up partial download: ${dir}/${file}`);
          } catch { /* ignore */ }
        }
      }
    }
  }

  async ensureRuntime(): Promise<void> {
    const llamafileDir = path.join(this.basePath, "llamafile");
    fs.mkdirSync(llamafileDir, { recursive: true });

    const versionFile = path.join(llamafileDir, "version.json");
    let currentVersion: string | null = null;
    if (fs.existsSync(versionFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(versionFile, "utf-8")) as VersionInfo;
        currentVersion = data.version;
      } catch {
        // Corrupted file, re-download
      }
    }

    // Fetch latest release info from GitHub
    this.status = { state: "downloading-runtime" };
    log.info("[llamafile] Checking for latest runtime version...");

    const releaseInfo = await this.fetchJson(GITHUB_API_RELEASES) as {
      tag_name: string;
      assets: Array<{ name: string; browser_download_url: string; size: number }>;
    };

    const latestVersion = releaseInfo.tag_name;
    const binaryName = process.platform === "win32" ? "llamafile" : "llamafile";
    const localBinaryName =
      process.platform === "win32"
        ? `llamafile-${latestVersion}.exe`
        : `llamafile-${latestVersion}`;
    const localBinaryPath = path.join(llamafileDir, localBinaryName);

    if (currentVersion === latestVersion && fs.existsSync(localBinaryPath)) {
      log.info(`[llamafile] Runtime ${latestVersion} already present`);
      this.status = {
        ...this.status,
        runtimeVersion: latestVersion,
      };
      return;
    }

    // Find the right asset (the plain "llamafile" binary)
    const asset = releaseInfo.assets.find(
      (a) => a.name === binaryName || a.name === `${binaryName}-${latestVersion}`
    );
    if (!asset) {
      throw new Error(
        `Could not find llamafile binary in release ${latestVersion}. ` +
        `Available assets: ${releaseInfo.assets.map((a) => a.name).join(", ")}`
      );
    }

    log.info(`[llamafile] Downloading runtime ${latestVersion} (${asset.name})...`);
    await this.downloadFile(asset.browser_download_url, localBinaryPath, asset.size);

    // Make executable on non-Windows
    if (process.platform !== "win32") {
      fs.chmodSync(localBinaryPath, 0o755);
    }

    // Write version info
    const versionInfo: VersionInfo = {
      version: latestVersion,
      updated: new Date().toISOString(),
    };
    fs.writeFileSync(versionFile, JSON.stringify(versionInfo, null, 2));

    // Clean up old versions
    for (const file of fs.readdirSync(llamafileDir)) {
      if (file.startsWith("llamafile-") && file !== localBinaryName && file !== "version.json") {
        try {
          fs.unlinkSync(path.join(llamafileDir, file));
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    log.info(`[llamafile] Runtime ${latestVersion} ready`);
    this.status = { state: "preparing", runtimeVersion: latestVersion };
  }

  async ensureModel(): Promise<void> {
    const modelsDir = path.join(this.basePath, "models");
    fs.mkdirSync(modelsDir, { recursive: true });

    const activeEntry = this.getActiveModelEntry();
    const modelPath = path.join(modelsDir, activeEntry.filename);

    if (fs.existsSync(modelPath)) {
      const stats = fs.statSync(modelPath);
      if (stats.size > MIN_MODEL_SIZE) {
        log.info(`[llamafile] Model already present: ${activeEntry.filename}`);
        this.status = {
          ...this.status,
          modelName: activeEntry.name,
        };
        return;
      }
    }

    this.status = {
      state: "downloading-model",
      runtimeVersion: this.status.runtimeVersion,
    };
    log.info(`[llamafile] Downloading model ${activeEntry.name}...`);

    await this.downloadFile(activeEntry.url, modelPath, activeEntry.sizeBytes);

    // Validate downloaded model isn't a truncated/error file
    const downloadedSize = fs.statSync(modelPath).size;
    if (downloadedSize < MIN_MODEL_SIZE) {
      fs.unlinkSync(modelPath);
      throw new Error(
        `Model download appears corrupt (${(downloadedSize / 1024 / 1024).toFixed(1)} MB). ` +
        `Expected at least ${MIN_MODEL_SIZE / 1024 / 1024} MB. Will retry on next launch.`
      );
    }

    // Set as active model
    const config = this.loadConfig();
    if (!config.activeModelId) {
      config.activeModelId = activeEntry.id;
      this.saveConfig(config);
    }

    log.info(`[llamafile] Model download complete (${(downloadedSize / 1024 / 1024 / 1024).toFixed(1)} GB)`);
    this.status = {
      ...this.status,
      state: "preparing",
      modelName: activeEntry.name,
    };
  }

  async start(): Promise<void> {
    const llamafileDir = path.join(this.basePath, "llamafile");
    const modelsDir = path.join(this.basePath, "models");

    // Find the runtime binary
    const versionFile = path.join(llamafileDir, "version.json");
    const { version } = JSON.parse(fs.readFileSync(versionFile, "utf-8")) as VersionInfo;
    const binaryName =
      process.platform === "win32"
        ? `llamafile-${version}.exe`
        : `llamafile-${version}`;
    const binaryPath = path.join(llamafileDir, binaryName);

    const activeEntry = this.getActiveModelEntry();
    const modelPath = path.join(modelsDir, activeEntry.filename);

    if (!fs.existsSync(binaryPath)) {
      throw new Error(`Runtime binary not found: ${binaryPath}`);
    }
    if (!fs.existsSync(modelPath)) {
      throw new Error(`Model not found: ${modelPath}`);
    }

    this.status = {
      state: "starting",
      runtimeVersion: version,
      modelName: activeEntry.name,
    };
    log.info(`[llamafile] Starting server on port ${this.port}...`);

    const args = [
      "--server",
      "--nobrowser",
      "--host", "127.0.0.1",
      "--port", String(this.port),
      "-m", modelPath,
      "-ngl", "999",
    ];

    this.process = spawn(binaryPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.process.stdout?.on("data", (data: Buffer) => {
      log.info(`[llamafile] ${data.toString().trimEnd()}`);
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      log.warn(`[llamafile] ${data.toString().trimEnd()}`);
    });

    this.process.on("exit", (code) => {
      log.info(`[llamafile] Process exited with code ${code}`);
      this.process = null;
      if (this.status.state !== "error") {
        this.status = { ...this.status, state: "idle" };
      }
    });

    // Poll until the server responds
    await this.waitForReady();

    this.status = {
      state: "ready",
      runtimeVersion: version,
      modelName: activeEntry.name,
    };
    log.info("[llamafile] Server is ready");
  }

  async stop(): Promise<void> {
    // Abort any in-progress download
    if (this.activeRequest) {
      this.activeRequest.destroy();
      this.activeRequest = null;
      log.info("[llamafile] Aborted in-progress download");
    }

    if (!this.process) return;

    log.info("[llamafile] Stopping server...");

    if (process.platform === "win32") {
      spawn("taskkill", ["/PID", String(this.process.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      this.process.kill("SIGTERM");
    }

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (this.process) {
          this.process.kill("SIGKILL");
        }
        resolve();
      }, 5000);

      if (this.process) {
        this.process.on("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      } else {
        clearTimeout(timeout);
        resolve();
      }
    });

    this.process = null;
    this.status = { state: "idle" };
  }

  /** Restart the server (stop + start). Used after model switch. */
  async restart(): Promise<void> {
    await this.stop();
    try {
      this.status = { state: "preparing" };
      await this.start();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`[llamafile] Restart failed: ${msg}`);
      this.status = { state: "error", error: msg };
    }
  }

  private waitForReady(): Promise<void> {
    const url = `http://127.0.0.1:${this.port}/v1/models`;

    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const poll = () => {
        if (Date.now() - startTime > READY_TIMEOUT_MS) {
          reject(new Error(`Llamafile failed to start within ${READY_TIMEOUT_MS / 1000}s`));
          return;
        }

        http
          .get(url, (res) => {
            if (res.statusCode === 200) {
              res.resume();
              resolve();
            } else {
              res.resume();
              setTimeout(poll, READY_POLL_INTERVAL_MS);
            }
          })
          .on("error", () => {
            setTimeout(poll, READY_POLL_INTERVAL_MS);
          });
      };

      poll();
    });
  }

  private fetchJson(url: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const doRequest = (requestUrl: string, redirectCount: number) => {
        if (redirectCount > 5) {
          reject(new Error("Too many redirects"));
          return;
        }

        const parsedUrl = new URL(requestUrl);
        const options = {
          hostname: parsedUrl.hostname,
          path: parsedUrl.pathname + parsedUrl.search,
          headers: { "User-Agent": "FOLIO-Mapper-Desktop" },
        };

        https
          .get(options, (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              doRequest(res.headers.location, redirectCount + 1);
              return;
            }

            if (res.statusCode !== 200) {
              reject(new Error(`HTTP ${res.statusCode} fetching ${requestUrl}`));
              return;
            }

            let body = "";
            res.on("data", (chunk: Buffer) => {
              body += chunk.toString();
            });
            res.on("end", () => {
              try {
                resolve(JSON.parse(body));
              } catch (e) {
                reject(new Error(`Invalid JSON from ${requestUrl}`));
              }
            });
          })
          .on("error", reject);
      };

      doRequest(url, 0);
    });
  }

  private downloadFile(
    url: string,
    destPath: string,
    knownSize?: number
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tmpPath = destPath + ".tmp";

      const doDownload = (downloadUrl: string, redirectCount: number) => {
        if (redirectCount > 10) {
          reject(new Error("Too many redirects"));
          return;
        }

        const parsedUrl = new URL(downloadUrl);
        const options: http.RequestOptions = {
          hostname: parsedUrl.hostname,
          path: parsedUrl.pathname + parsedUrl.search,
          headers: { "User-Agent": "FOLIO-Mapper-Desktop" },
        };

        const onResponse = (res: http.IncomingMessage) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            doDownload(res.headers.location, redirectCount + 1);
            return;
          }

          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} downloading ${downloadUrl}`));
            return;
          }

          const totalBytes = knownSize ||
            (res.headers["content-length"]
              ? parseInt(res.headers["content-length"], 10)
              : 0);
          let downloadedBytes = 0;

          const file = fs.createWriteStream(tmpPath);

          res.on("data", (chunk: Buffer) => {
            downloadedBytes += chunk.length;
            if (totalBytes > 0) {
              this.status = {
                ...this.status,
                progress: {
                  bytesDownloaded: downloadedBytes,
                  bytesTotal: totalBytes,
                },
              };
            }
          });

          res.pipe(file);

          file.on("finish", () => {
            file.close(() => {
              fs.renameSync(tmpPath, destPath);
              this.status = { ...this.status, progress: undefined };
              resolve();
            });
          });

          file.on("error", (err: Error) => {
            file.close(() => {
              try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
              reject(err);
            });
          });
        };

        const onError = (err: Error) => {
          try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
          reject(err);
        };

        const req = parsedUrl.protocol === "https:"
          ? https.get(options, onResponse)
          : http.get(options, onResponse);
        this.activeRequest = req;
        req.on("error", onError);
      };

      doDownload(url, 0);
    }).then(() => {
      this.activeRequest = null;
    }, (err) => {
      this.activeRequest = null;
      throw err;
    });
  }

  /** Download a model file with per-model progress tracking. */
  private downloadModelFile(
    modelId: string,
    url: string,
    destPath: string,
    knownSize?: number
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tmpPath = destPath + ".tmp";

      const doDownload = (downloadUrl: string, redirectCount: number) => {
        if (redirectCount > 10) {
          reject(new Error("Too many redirects"));
          return;
        }

        const parsedUrl = new URL(downloadUrl);
        const options: http.RequestOptions = {
          hostname: parsedUrl.hostname,
          path: parsedUrl.pathname + parsedUrl.search,
          headers: { "User-Agent": "FOLIO-Mapper-Desktop" },
        };

        const onResponse = (res: http.IncomingMessage) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            doDownload(res.headers.location, redirectCount + 1);
            return;
          }

          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} downloading ${downloadUrl}`));
            return;
          }

          const totalBytes = knownSize ||
            (res.headers["content-length"]
              ? parseInt(res.headers["content-length"], 10)
              : 0);
          let downloadedBytes = 0;

          const file = fs.createWriteStream(tmpPath);

          res.on("data", (chunk: Buffer) => {
            downloadedBytes += chunk.length;
            if (totalBytes > 0) {
              this.modelDownloadProgress.set(modelId, {
                bytesDownloaded: downloadedBytes,
                bytesTotal: totalBytes,
              });
            }
          });

          res.pipe(file);

          file.on("finish", () => {
            file.close(() => {
              fs.renameSync(tmpPath, destPath);
              this.modelDownloadProgress.delete(modelId);
              this.modelDownloadRequests.delete(modelId);
              resolve();
            });
          });

          file.on("error", (err: Error) => {
            file.close(() => {
              this.modelDownloadProgress.delete(modelId);
              this.modelDownloadRequests.delete(modelId);
              try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
              reject(err);
            });
          });
        };

        const onError = (err: Error) => {
          this.modelDownloadProgress.delete(modelId);
          this.modelDownloadRequests.delete(modelId);
          try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
          reject(err);
        };

        const req = parsedUrl.protocol === "https:"
          ? https.get(options, onResponse)
          : http.get(options, onResponse);
        this.modelDownloadRequests.set(modelId, req);
        req.on("error", onError);
      };

      doDownload(url, 0);
    });
  }
}
