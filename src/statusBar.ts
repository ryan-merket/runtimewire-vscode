import * as vscode from "vscode";

export type BalanceState =
  | { kind: "signedOut" }
  | { kind: "offline" }
  | { kind: "signedIn"; todayMicros: number; lifetimeMicros: number };

function usd(micros: number): string {
  return `$${(Math.max(0, micros) / 1_000_000).toFixed(2)}`;
}

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function truncate(s: string, max = 52): string {
  const t = clean(s);
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/**
 * What the status bar is currently showing. We keep BOTH the truncated `short`
 * label (the status bar can only fit ~50 chars) and the `full` text so the
 * hover tooltip can always show the complete headline — the status bar truncates
 * mid-sentence and there was previously no way to read the rest.
 */
type Showing =
  | { kind: "news"; short: string; full: string }
  | { kind: "ad"; short: string; full: string };

/**
 * Status-bar entry — the extension's only surface (no webview). It rotates
 * through live RuntimeWire headlines and the occasional clearly-labelled
 * sponsored slot, filling the idle dead air while you wait on an agent. Clicking
 * it opens the RuntimeWire menu (read any headline, open the ad, pause, sign in,
 * earnings dashboard). Earnings / sign-in state live in the tooltip and the menu
 * so the headline always stays in view.
 */
export class StatusBar {
  private readonly item: vscode.StatusBarItem;
  private balance: BalanceState = { kind: "signedOut" };
  private showing: Showing | null = null;
  private paused = false;
  private prominent = false;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = "runtimewire.menu";
    this.render();
    this.item.show();
  }

  /** Update the earnings / connection state (shown in the tooltip + menu). */
  setBalance(state: BalanceState): void {
    this.balance = state;
    this.render();
  }

  /** Show a news headline, or null to clear the ticker. */
  setHeadline(title: string | null): void {
    if (!title) {
      this.showing = null;
      this.render();
      return;
    }
    const full = clean(title);
    this.showing = { kind: "news", short: truncate(full), full };
    this.render();
  }

  /** Show a clearly-labelled sponsored slot. */
  setSponsored(brand: string, title: string): void {
    const label = brand ? `Sponsored · ${brand} — ${title}` : `Sponsored · ${title}`;
    const full = clean(label);
    this.showing = { kind: "ad", short: truncate(full, 56), full };
    this.render();
  }

  /** Pause/resume the rotation. When paused the entry stays put but goes quiet. */
  setPaused(paused: boolean): void {
    this.paused = paused;
    this.render();
  }

  /** Toggle a high-contrast background so the entry is easier to spot. */
  setProminent(prominent: boolean): void {
    this.prominent = prominent;
    this.render();
  }

  private balanceLine(): string {
    if (this.balance.kind === "signedIn") {
      return `Your revenue share — ${usd(this.balance.todayMicros)} today · ${usd(this.balance.lifetimeMicros)} lifetime`;
    }
    if (this.balance.kind === "offline") {
      return "RuntimeWire backend is temporarily unreachable";
    }
    return "Sign in to RuntimeWire to earn a revenue share";
  }

  private render(): void {
    // Optional high-contrast background (best-effort visibility boost — the
    // status-bar font size itself is controlled by the editor and can't be
    // changed by an extension).
    this.item.backgroundColor = this.prominent
      ? new vscode.ThemeColor("statusBarItem.warningBackground")
      : undefined;

    if (this.paused) {
      this.item.text = "$(debug-pause) RuntimeWire paused";
      this.item.tooltip = new vscode.MarkdownString(
        `**RuntimeWire** — ticker paused\n\n${this.balanceLine()}\n\n_Click to resume._`,
      );
      return;
    }

    if (this.showing) {
      const icon = this.showing.kind === "ad" ? "$(megaphone)" : "$(pulse)";
      const kindLabel = this.showing.kind === "ad" ? "sponsored" : "live AI news";
      this.item.text = `${icon} ${this.showing.short}`;
      // Full, untruncated headline first so hovering always reveals the rest.
      this.item.tooltip = new vscode.MarkdownString(
        `${this.showing.full}\n\n**RuntimeWire** — ${kindLabel}\n\n${this.balanceLine()}\n\n_Click to read & manage._`,
      );
      return;
    }

    // Nothing loaded yet — fall back to a status-only label.
    if (this.balance.kind === "signedIn") {
      this.item.text = `$(pulse) RuntimeWire (${usd(this.balance.todayMicros)} today · ${usd(this.balance.lifetimeMicros)})`;
    } else if (this.balance.kind === "offline") {
      this.item.text = "$(pulse) RuntimeWire offline";
    } else {
      this.item.text = "$(pulse) RuntimeWire";
    }
    this.item.tooltip = this.balanceLine();
  }

  dispose(): void {
    this.item.dispose();
  }
}
