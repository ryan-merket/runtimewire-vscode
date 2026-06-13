import * as vscode from "vscode";
import { randomUUID } from "node:crypto";

/** Public RuntimeWire origin. RSS lives at `${base}/rss`, API at `${base}/api`. */
export const DEFAULT_API_BASE = "https://runtimewire.com";

export const VERSION = "0.2.1";
export const USER_AGENT = `runtimewire-vscode/${VERSION} (VS Code companion; ${process.platform})`;

function cfg(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration("runtimewire");
}

/**
 * Resolved API origin with trailing slashes stripped. Because authenticated
 * requests carry the `rwpub_` bearer key, the origin is held to a strict policy
 * regardless of where the setting came from: it must be a valid HTTPS URL (only
 * `localhost`/loopback may use http). Anything else falls back to the default so
 * a bad/hostile value can never redirect signed-in traffic off-origin.
 */
export function getApiBase(): string {
  const raw = (cfg().get<string>("apiBase") || DEFAULT_API_BASE).trim();
  const cleaned = raw.replace(/\/+$/, "");
  if (!cleaned) return DEFAULT_API_BASE;
  try {
    const u = new URL(cleaned);
    const isLoopback =
      u.hostname === "localhost" ||
      u.hostname === "127.0.0.1" ||
      u.hostname === "[::1]";
    if (u.protocol === "https:" || (u.protocol === "http:" && isLoopback)) {
      return cleaned;
    }
  } catch {
    /* fall through to default */
  }
  return DEFAULT_API_BASE;
}

/** Number of news headlines to show beside the single sponsored slot (4–6). */
export function getNewsCount(): number {
  const n = Math.round(cfg().get<number>("newsCount") ?? 5);
  return Math.min(6, Math.max(4, Number.isFinite(n) ? n : 5));
}

/** Feed auto-refresh interval, in milliseconds (>= 60s). */
export function getRefreshMs(): number {
  const s = Math.round(cfg().get<number>("refreshSeconds") ?? 180);
  return Math.max(60, Number.isFinite(s) ? s : 180) * 1000;
}

const DEVICE_KEY = "runtimewire.deviceId";

/** Stable per-install id used for revenue-share attribution + fraud checks. */
export function getDeviceId(ctx: vscode.ExtensionContext): string {
  let id = ctx.globalState.get<string>(DEVICE_KEY);
  if (!id) {
    id = randomUUID();
    void ctx.globalState.update(DEVICE_KEY, id);
  }
  return id;
}
