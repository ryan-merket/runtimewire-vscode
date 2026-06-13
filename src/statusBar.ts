import * as vscode from "vscode";

export type BalanceState =
  | { kind: "signedOut" }
  | { kind: "offline" }
  | { kind: "signedIn"; todayMicros: number; lifetimeMicros: number };

function usd(micros: number): string {
  return `$${(Math.max(0, micros) / 1_000_000).toFixed(2)}`;
}

function truncate(s: string, max = 52): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** What the status bar is currently showing as its primary label. */
type Showing =
  | { kind: "news"; text: string }
  | { kind: "ad"; text: string };

/**
 * Status-bar entry — the extension's only surface (no webview). It rotates
 * through live RuntimeWire headlines and the occasional clearly-labelled
 * sponsored slot, filling the idle dead air while you wait on an agent. Clicking
 * it opens the RuntimeWire menu (read any headline, open the ad, sign in,
 * earnings dashboard). Earnings / sign-in state live in the tooltip and the menu
 * so the headline always stays in view.
 */
export class StatusBar {
  private readonly item: vscode.StatusBarItem;
  private balance: BalanceState = { kind: "signedOut" };
  private showing: Showing | null = null;

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
    this.showing = title ? { kind: "news", text: truncate(title) } : null;
    this.render();
  }

  /** Show a clearly-labelled sponsored slot. */
  setSponsored(brand: string, title: string): void {
    const label = brand ? `Sponsored · ${brand} — ${title}` : `Sponsored · ${title}`;
    this.showing = { kind: "ad", text: truncate(label, 56) };
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
    if (this.showing) {
      const icon = this.showing.kind === "ad" ? "$(megaphone)" : "$(pulse)";
      const kindLabel = this.showing.kind === "ad" ? "sponsored" : "live AI news";
      this.item.text = `${icon} ${this.showing.text}`;
      this.item.tooltip = new vscode.MarkdownString(
        `**RuntimeWire** — ${kindLabel}\n\n${this.balanceLine()}\n\n_Click to read & manage._`,
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
