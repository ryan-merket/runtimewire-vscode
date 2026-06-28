import * as vscode from "vscode";
import { randomUUID } from "node:crypto";

/** Public RuntimeWire origin. RSS lives at `${base}/rss`, API at `${base}/api`. */
export const DEFAULT_API_BASE = "https://runtimewire.com";

// Keep VERSION in lockstep with `version` in package.json — it is baked into
// the network User-Agent.
export const VERSION = "0.5.2";

/** Host-editor family this build can run in (all VS Code-compatible). */
export type IdeKind = "vscode" | "vscodium" | "antigravity";

/**
 * Cached host-editor family for this session: "antigravity" for Google's
 * Antigravity IDE, "vscodium" for VSCodium / other Code-OSS forks, otherwise
 * "vscode" (Microsoft VS Code). The SAME compiled extension runs in all three —
 * they're all VS Code-compatible editors that load it from Open VSX / VSIX —
 * only how it reports itself differs.
 */
let cachedIde: IdeKind | undefined;

/**
 * Detect which VS Code-compatible host the extension is running in, so traffic
 * is attributed honestly in analytics:
 *   - Antigravity (Google's agentic IDE, a VS Code fork) reports an `appName`
 *     of "Antigravity". It may ALSO be a Code-OSS build (a `*-oss` scheme), so
 *     it MUST be checked before the VSCodium/Code-OSS test or it would be
 *     misclassified as VSCodium.
 *   - VSCodium / Code-OSS builds report an `appName` of "VSCodium" and/or a
 *     `*-oss` uri scheme.
 *   - Everything else is treated as Microsoft VS Code.
 * The result is cached because it never changes while the editor is running.
 *
 * Used for the link `utm_source` tag, the network User-Agent, AND the
 * ad-serving `ide` param so advertisers can target VSCodium or Antigravity
 * specifically. The ad-serving `placement` stays "vscode" (the shared editor
 * inventory bucket), and the server treats `ide=vscodium`/`antigravity` as also
 * matching `vscode`-targeted inventory, so existing campaigns keep filling
 * sponsored slots for VSCodium and Antigravity users with no revenue
 * regression.
 */
export function detectIde(): IdeKind {
  if (cachedIde) return cachedIde;
  let kind: IdeKind = "vscode";
  try {
    const appName = (vscode.env.appName || "").toLowerCase();
    const scheme = (vscode.env.uriScheme || "").toLowerCase();
    if (appName.includes("antigravity") || scheme.includes("antigravity")) {
      kind = "antigravity";
    } else if (appName.includes("codium") || scheme.includes("oss")) {
      kind = "vscodium";
    }
  } catch {
    /* env unavailable -> default to vscode */
  }
  cachedIde = kind;
  return cachedIde;
}

/** Traffic-source tag carried on RuntimeWire links opened from the IDE. */
export function getIdeUtmSource(): string {
  return detectIde();
}

/** Network User-Agent for all extension requests; names the host editor. */
export function getUserAgent(): string {
  const ide = detectIde();
  const label =
    ide === "antigravity"
      ? "Antigravity companion"
      : ide === "vscodium"
        ? "VSCodium companion"
        : "VS Code companion";
  return `runtimewire-vscode/${VERSION} (${label}; ${process.platform})`;
}

/**
 * Tag a RuntimeWire-owned URL with our IDE traffic source so status-bar
 * headline/dashboard clicks are attributable in site analytics
 * (`?utm_source=vscode`, `vscodium`, or `antigravity`, which the article
 * pageview beacon forwards). Links to any other origin — third-party article URLs, ad
 * destinations — are returned untouched, and an existing `utm_source` is never
 * clobbered.
 */
export function withIdeRef(rawUrl: string, base: string): string {
  try {
    const target = new URL(rawUrl);
    const ownHost = new URL(base).hostname.toLowerCase().replace(/^www\./, "");
    const targetHost = target.hostname.toLowerCase().replace(/^www\./, "");
    if (targetHost !== ownHost) return rawUrl;
    if (!target.searchParams.has("utm_source")) {
      target.searchParams.set("utm_source", getIdeUtmSource());
    }
    return target.toString();
  } catch {
    return rawUrl;
  }
}

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

/**
 * Lower-cased RuntimeWire category slugs to limit the ticker to (e.g. `ai`,
 * `startups`). An empty list means "show every topic". Filtering happens
 * client-side against each headline's primary category.
 */
export function getCategories(): string[] {
  const raw = cfg().get<string[]>("categories");
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => String(c).toLowerCase().trim())
    .filter((c) => c.length > 0);
}

/** Whether to render the status-bar entry with a high-contrast background. */
export function getProminent(): boolean {
  return cfg().get<boolean>("prominent") === true;
}

/**
 * When true, the ticker hides RuntimeWire news headlines entirely and shows
 * ONLY the sponsored slot. The news fetch is skipped, so the rotation is
 * sponsored-only (and falls back to the plain status label when no ad fills).
 */
export function getAdsOnly(): boolean {
  return cfg().get<boolean>("adsOnly") === true;
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
