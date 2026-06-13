import * as vscode from "vscode";
import { StatusBar } from "./statusBar";
import { getApiBase, getDeviceId, getNewsCount, getRefreshMs } from "./config";
import { getKey, clearKey } from "./secrets";
import { signIn } from "./auth";
import { publisherBalance, publisherLedger, type LedgerEntry } from "./api";
import { buildFeed, type FeedRow } from "./feed";
import { reportImpression, reportClick, type Slot } from "./ads";
import type { NewsItem } from "./rss";

let feedTimer: ReturnType<typeof setInterval> | undefined;
let balanceTimer: ReturnType<typeof setInterval> | undefined;
let rotateTimer: ReturnType<typeof setInterval> | undefined;
let adDwellTimer: ReturnType<typeof setTimeout> | undefined;

/** How often the status-bar entry advances to the next feed row. */
const ROTATE_MS = 8000;
/**
 * A sponsored slot must sit in the status bar for this long before it counts as
 * a qualifying impression — the same "seen for N seconds" gate the website uses,
 * so a slot that flashes past during a quick rotation is never billed.
 */
const AD_IMPRESSION_MS = 5000;

/** The combined headline + sponsored-slot rotation backing the status bar. */
let rotation: FeedRow[] = [];
let rotIdx = 0;
/** The row currently shown in the status bar (so a click opens the right thing). */
let current: FeedRow | null = null;

/** Sum the developer's revenue-share entries dated today (local time). */
function sumToday(ledger: LedgerEntry[] | null): number {
  if (!ledger) return 0;
  const now = new Date();
  const y = now.getFullYear();
  const mo = now.getMonth();
  const d = now.getDate();
  let sum = 0;
  for (const e of ledger) {
    if (!e.createdAt || typeof e.developerShareMicros !== "number") continue;
    if (e.state === "reversed") continue;
    const dt = new Date(e.createdAt);
    if (Number.isNaN(dt.getTime())) continue;
    if (dt.getFullYear() === y && dt.getMonth() === mo && dt.getDate() === d) {
      sum += e.developerShareMicros;
    }
  }
  return sum;
}

/** Pull a fresh batch of headlines + one sponsored slot (fail-soft). */
async function rebuildRotation(ctx: vscode.ExtensionContext): Promise<void> {
  const base = getApiBase();
  const key = (await getKey(ctx)) ?? null;
  const { rows } = await buildFeed(base, key, getNewsCount());
  if (rows.length) {
    rotation = rows;
    if (rotIdx >= rotation.length) rotIdx = 0;
  }
}

/** Advance the status bar to the next row; arm the impression timer for ads. */
function advance(ctx: vscode.ExtensionContext, status: StatusBar): void {
  if (adDwellTimer) {
    clearTimeout(adDwellTimer);
    adDwellTimer = undefined;
  }
  if (!rotation.length) {
    current = null;
    status.setHeadline(null);
    return;
  }
  const item = rotation[rotIdx % rotation.length] ?? null;
  rotIdx = (rotIdx + 1) % rotation.length;
  current = item;
  if (!item) return;

  if (item.kind === "news") {
    status.setHeadline(item.item.title);
    return;
  }

  status.setSponsored(item.slot.unit.brand, item.slot.unit.title);
  const slot = item.slot;
  // Start the dwell clock when the ad is ACTUALLY shown — not at serve time —
  // so the reported on-screen time reflects real status-bar visibility, not the
  // seconds it spent waiting its turn in the rotation.
  slot.shownAt = Date.now();
  // Only credit an impression once the slot has dwelled in the status bar.
  adDwellTimer = setTimeout(() => void fireImpression(ctx, slot), AD_IMPRESSION_MS);
}

/** Report a qualifying impression for a sponsored slot (fire-and-forget). */
async function fireImpression(ctx: vscode.ExtensionContext, slot: Slot): Promise<void> {
  const key = (await getKey(ctx)) ?? null;
  await reportImpression(getApiBase(), key, getDeviceId(ctx), slot);
}

/** Report a click on a sponsored slot and open its resolved destination. */
async function openSlot(ctx: vscode.ExtensionContext, slot: Slot): Promise<void> {
  const key = (await getKey(ctx)) ?? null;
  const url = await reportClick(getApiBase(), key, getDeviceId(ctx), slot);
  if (url && /^https?:\/\//i.test(url)) {
    void vscode.env.openExternal(vscode.Uri.parse(url));
  }
}

/** Open an editorial headline in the browser (no ad tracking). */
function openNews(item: NewsItem): void {
  if (item.link && /^https?:\/\//i.test(item.link)) {
    void vscode.env.openExternal(vscode.Uri.parse(item.link));
  }
}

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
  const status = new StatusBar();
  ctx.subscriptions.push(status);

  const updateBalance = async (): Promise<void> => {
    const base = getApiBase();
    const key = (await getKey(ctx)) ?? null;
    if (!key) {
      status.setBalance({ kind: "signedOut" });
      return;
    }
    const bal = await publisherBalance(base, key);
    if (!bal) {
      status.setBalance({ kind: "offline" });
      return;
    }
    const lifetimeMicros = bal.pendingMicros + bal.clearedMicros;
    const ledger = await publisherLedger(base, key, 200);
    status.setBalance({ kind: "signedIn", todayMicros: sumToday(ledger), lifetimeMicros });
  };

  const refreshAll = async (): Promise<void> => {
    await Promise.all([rebuildRotation(ctx), updateBalance()]);
    advance(ctx, status);
  };

  ctx.subscriptions.push(
    vscode.commands.registerCommand("runtimewire.refresh", () => void refreshAll()),
    vscode.commands.registerCommand("runtimewire.signIn", async () => {
      if (await signIn(ctx)) await refreshAll();
    }),
    vscode.commands.registerCommand("runtimewire.signOut", async () => {
      await clearKey(ctx);
      await refreshAll();
      vscode.window.showInformationMessage("RuntimeWire: signed out.");
    }),
    vscode.commands.registerCommand("runtimewire.openDashboard", () => {
      void vscode.env.openExternal(vscode.Uri.parse(`${getApiBase()}/publisher`));
    }),
    vscode.commands.registerCommand("runtimewire.openCurrent", () => {
      if (!current) return void openMenu(ctx);
      if (current.kind === "news") openNews(current.item);
      else void openSlot(ctx, current.slot);
    }),
    vscode.commands.registerCommand("runtimewire.menu", () => void openMenu(ctx)),
  );

  // React to settings changes (api base / cadence / news count).
  ctx.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("runtimewire")) return;
      void rebuildRotation(ctx);
      if (feedTimer) clearInterval(feedTimer);
      feedTimer = setInterval(() => void rebuildRotation(ctx), getRefreshMs());
    }),
  );

  void refreshAll();
  feedTimer = setInterval(() => void rebuildRotation(ctx), getRefreshMs());
  balanceTimer = setInterval(() => void updateBalance(), 30_000);
  rotateTimer = setInterval(() => advance(ctx, status), ROTATE_MS);

  ctx.subscriptions.push({ dispose: clearTimers });
}

type MenuItem = vscode.QuickPickItem & { id?: string; row?: FeedRow };

/** The full RuntimeWire reader + account menu — a native quick pick (no webview). */
async function openMenu(ctx: vscode.ExtensionContext): Promise<void> {
  const key = await getKey(ctx);
  const items: MenuItem[] = [];

  for (const row of rotation) {
    if (row.kind === "news") {
      items.push({
        id: "news",
        row,
        label: `$(rss) ${row.item.title}`,
        description: row.item.category ?? undefined,
      });
    } else {
      items.push({
        id: "ad",
        row,
        label: `$(megaphone) ${row.slot.unit.brand}: ${row.slot.unit.title}`,
        description: "Sponsored",
      });
    }
  }

  if (items.length) {
    items.push({ label: "", kind: vscode.QuickPickItemKind.Separator });
  }

  if (key) {
    items.push(
      { id: "dashboard", label: "$(dashboard) Open earnings dashboard" },
      { id: "refresh", label: "$(refresh) Refresh now" },
      { id: "signOut", label: "$(sign-out) Sign out" },
    );
  } else {
    items.push(
      { id: "signIn", label: "$(account) Sign in", description: "Start earning a revenue share" },
      { id: "dashboard", label: "$(dashboard) Open earnings dashboard" },
      { id: "refresh", label: "$(refresh) Refresh now" },
    );
  }

  const pick = await vscode.window.showQuickPick(items, {
    title: "RuntimeWire — headlines & earnings",
  });
  if (!pick) return;

  switch (pick.id) {
    case "news":
      if (pick.row?.kind === "news") openNews(pick.row.item);
      break;
    case "ad":
      if (pick.row?.kind === "ad") await openSlot(ctx, pick.row.slot);
      break;
    case "signIn":
      await vscode.commands.executeCommand("runtimewire.signIn");
      break;
    case "signOut":
      await vscode.commands.executeCommand("runtimewire.signOut");
      break;
    case "dashboard":
      await vscode.commands.executeCommand("runtimewire.openDashboard");
      break;
    case "refresh":
      await vscode.commands.executeCommand("runtimewire.refresh");
      break;
  }
}

function clearTimers(): void {
  if (feedTimer) clearInterval(feedTimer);
  if (balanceTimer) clearInterval(balanceTimer);
  if (rotateTimer) clearInterval(rotateTimer);
  if (adDwellTimer) clearTimeout(adDwellTimer);
}

export function deactivate(): void {
  clearTimers();
}
