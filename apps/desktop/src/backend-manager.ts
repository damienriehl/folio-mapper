import { ChildProcess, spawn } from "child_process";
import * as crypto from "crypto";
import * as http from "http";
import * as path from "path";
import log from "electron-log";

const HEALTH_POLL_INTERVAL_MS = 500;
const STARTUP_TIMEOUT_MS = 60_000; // 60s for first-run FOLIO ontology download

export class BackendManager {
  private process: ChildProcess | null = null;
  private port: number;
  private _localToken: string | null = null;

  constructor(port: number) {
    this.port = port;
  }

  /** The local auth token emitted by the backend on startup. */
  get localToken(): string | null {
    return this._localToken;
  }

  start(resourcesPath: string): void {
    const backendExe = path.join(
      resourcesPath,
      "backend",
      process.platform === "win32" ? "run_desktop.exe" : "run_desktop"
    );
    const webDir = path.join(resourcesPath, "web");

    // Generate auth token and pass to backend via env var
    this._localToken = crypto.randomBytes(32).toString("base64url");
    log.info(`Starting backend: ${backendExe} --port ${this.port} --web-dir ${webDir}`);

    this.process = spawn(backendExe, ["--port", String(this.port), "--web-dir", webDir], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, FOLIO_MAPPER_LOCAL_TOKEN: this._localToken },
    });

    this.process.stdout?.on("data", (data: Buffer) => {
      log.info(`[backend] ${data.toString().trimEnd()}`);
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      log.warn(`[backend] ${data.toString().trimEnd()}`);
    });

    this.process.on("exit", (code) => {
      log.info(`Backend exited with code ${code}`);
      this.process = null;
    });
  }

  waitForReady(): Promise<void> {
    const url = `http://127.0.0.1:${this.port}/api/health`;

    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const poll = () => {
        if (Date.now() - startTime > STARTUP_TIMEOUT_MS) {
          reject(new Error(`Backend failed to start within ${STARTUP_TIMEOUT_MS / 1000}s`));
          return;
        }

        http
          .get(url, (res) => {
            if (res.statusCode === 200) {
              resolve();
            } else {
              setTimeout(poll, HEALTH_POLL_INTERVAL_MS);
            }
          })
          .on("error", () => {
            setTimeout(poll, HEALTH_POLL_INTERVAL_MS);
          });
      };

      poll();
    });
  }

  async stop(): Promise<void> {
    if (!this.process) return;

    log.info("Stopping backend...");

    if (process.platform === "win32") {
      // On Windows, kill the entire process tree (PyInstaller may spawn children)
      spawn("taskkill", ["/PID", String(this.process.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else {
      this.process.kill("SIGTERM");
    }

    // Wait briefly for graceful shutdown
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
  }
}
