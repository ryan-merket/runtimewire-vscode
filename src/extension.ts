import * as vscode from "vscode";
import { StatusBar } from "./statusBar";
import {
  getAdsOnly,
  getApiBase,
  getCategories,
  getDeviceId,
  getNewsCount,
  getProminent,
  getRefreshMs,
  withIdeRef,
} from "./config";
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

/** When paused, the rotation halts and the entry shows a muted "paused" label. */
let paused = false;
/** Persisted so a pause survives an editor reload. */
const PAUSED_KEY = "runtimewire.paused";
/** One-time flag so the discovery hint shows only on first run. */
const HINT_KEY = "runtimewire.onboarded";

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
  const adsOnly = getAdsOnly();
  const { rows, fetchedAny } = await buildFeed(
    base,
    key,
    getNewsCount(),
    getCategories(),
    adsOnly,
  );
  if (rows.length) {
    rotation = rows;
    if (rotIdx >= rotation.length) rotIdx = 0;
  } else if (fetchedAny || adsOnly) {
    // Clear the rotation (next advance() shows the status-only fallback label)
    // when EITHER:
    //   - the fetch succeeded but the topic filter matched nothing (so we never
    //     keep showing a muted topic), OR
    //   - we're in ads-only mode and no ad filled — ads-only must NEVER fall
    //     back to stale news rows, so an unfilled slot shows the plain label.
    // (Outside ads-only, a true ad/news fetch failure leaves `rotation`
    // untouched for resilience.)
    rotation = [];
    rotIdx = 0;
  }
}

/** Advance the status bar to the next row; arm the impression timer for ads. */
function advance(ctx: vscode.ExtensionContext, status: StatusBar): void {
  // While paused the ticker freezes on its muted "paused" label — don't rotate
  // or arm any impression timers.
  if (paused) return;
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
    void vscode.env.openExternal(vscode.Uri.parse(withIdeRef(item.link, getApiBase())));
  }
}

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
  const status = new StatusBar();
  ctx.subscriptions.push(status);

  // Restore the persisted pause state + the prominent-background preference.
  paused = ctx.globalState.get<boolean>(PAUSED_KEY) === true;
  status.setPaused(paused);
  status.setProminent(getProminent());

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
      const base = getApiBase();
      void vscode.env.openExternal(vscode.Uri.parse(withIdeRef(`${base}/publisher`, base)));
    }),
    vscode.commands.registerCommand("runtimewire.openCurrent", () => {
      if (!current) return void openMenu(ctx);
      if (current.kind === "news") openNews(current.item);
      else void openSlot(ctx, current.slot);
    }),
    vscode.commands.registerCommand("runtimewire.menu", () => void openMenu(ctx)),
    vscode.commands.registerCommand("runtimewire.togglePause", async () => {
      paused = !paused;
      await ctx.globalState.update(PAUSED_KEY, paused);
      // Pausing must cancel any pending sponsored-impression dwell timer, or an
      // ad shown just before the pause would still fire an impression while the
      // ticker is frozen (a measurement/billing integrity bug).
      if (paused && adDwellTimer) {
        clearTimeout(adDwellTimer);
        adDwellTimer = undefined;
      }
      status.setPaused(paused);
      // Resuming should show a headline immediately rather than waiting for the
      // next rotation tick.
      if (!paused) advance(ctx, status);
    }),
  );

  // React to settings changes (api base / cadence / news count / topics /
  // prominence). Re-apply the background immediately and rebuild the feed so a
  // new topic filter takes effect without waiting for the next refresh tick.
  ctx.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration("runtimewire")) return;
      status.setProminent(getProminent());
      void rebuildRotation(ctx).then(() => {
        if (!paused) advance(ctx, status);
      });
      if (feedTimer) clearInterval(feedTimer);
      feedTimer = setInterval(() => void rebuildRotation(ctx), getRefreshMs());
    }),
  );

  void refreshAll();
  feedTimer = setInterval(() => void rebuildRotation(ctx), getRefreshMs());
  balanceTimer = setInterval(() => void updateBalance(), 30_000);
  rotateTimer = setInterval(() => advance(ctx, status), ROTATE_MS);

  // First-run discovery hint: several reviewers didn't realise the status-bar
  // entry is clickable. Show this once, then never again.
  if (!ctx.globalState.get<boolean>(HINT_KEY)) {
    void ctx.globalState.update(HINT_KEY, true);
    void vscode.window
      .showInformationMessage(
        "RuntimeWire is in your status bar — click it to read full headlines, filter topics, pause, or sign in to earn a revenue share.",
        "Open menu",
      )
      .then((choice) => {
        if (choice === "Open menu") void vscode.commands.executeCommand("runtimewire.menu");
      });
  }

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

  items.push({
    id: "pause",
    label: paused ? "$(play) Resume ticker" : "$(debug-pause) Pause ticker",
    description: paused ? "Currently paused" : undefined,
  });

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
    case "pause":
      await vscode.commands.executeCommand("runtimewire.togglePause");
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
