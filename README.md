# RuntimeWire for VS Code, VSCodium & Antigravity

The latest AI news right in your **status bar** — perfect for the minutes you
spend waiting on **Claude Code**, **Codex**, **Gemini**, or any agent to finish.
A single status-bar entry rotates through fresh
[RuntimeWire](https://runtimewire.com) headlines plus **one** clearly-labelled
native sponsored slot you can **earn a revenue share from** by signing in. No
sidebar, no panel, no webview — just one glanceable line.

Runs identically in **VS Code**, **VSCodium**, and Google's **Antigravity** IDE
— it uses only the standard, open-source VS Code status-bar API
(`createStatusBarItem`), so the same build loads in every VS Code-compatible
editor with nothing Microsoft-specific to miss. Antigravity is a VS Code fork
that installs extensions from [Open VSX](https://open-vsx.org), so the same
package that ships to VSCodium drops straight into Antigravity's status bar.

This is the editor companion to the [RuntimeWire CLI](https://www.npmjs.com/package/runtimewire).
It never patches Claude Code, Codex, or any other extension, and it never reads
your code — it's a standalone status-bar entry.

## What it does

- **Headline ticker** — the latest AI headlines rotate through one status-bar
  entry. Click it to open the RuntimeWire menu and read any of them.
- **One native sponsor** — a single, clearly labelled `Sponsored · Brand` slot
  is mixed into the rotation (never more than one).
- **Earn a share** — sign in with Google and a cut of sponsor revenue accrues to
  you for impressions (the slot dwelling in your status bar) and clicks. Clicks
  are worth far more than impressions.
- **Live balance** — your earnings show in the status-bar tooltip and menu:
  `$0.42 today · $7.11 lifetime`.
- **Read the whole headline** — long titles are trimmed to fit the status bar;
  hover the entry and the tooltip shows the **full, untruncated headline**.
- **Pause anytime** — mute the ticker with one click (status bar menu or the
  `RuntimeWire: Pause/Resume ticker` command) without uninstalling. It stays
  paused across restarts until you resume.
- **Filter topics** — pick only the topics you care about (AI, startups,
  products, funding, …) via `runtimewire.categories`.
- **Make it pop** — turn on `runtimewire.prominent` for a high-contrast
  background so the entry is easy to spot on a busy status bar.
- **Fail-soft** — a network blip, empty feed, or missing ad never breaks the
  ticker. Anonymous mode always works; you just don't earn until you sign in.

## Install

### VS Code

Search **RuntimeWire** in the Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`)
and click **Install**, or install from the
[Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=runtimewire.runtimewire).

### VSCodium

VSCodium uses the [Open VSX](https://open-vsx.org) registry instead of the
Microsoft Marketplace. Either:

- **From the Extensions view** — search **RuntimeWire** (`Ctrl+Shift+X` /
  `Cmd+Shift+X`) and click **Install** (VSCodium points its Extensions view at
  Open VSX by default), or
- **From a `.vsix` file** — download the latest `runtimewire-*.vsix` from the
  [GitHub releases](https://github.com/ryan-merket/runtimewire-vscode/releases),
  then run **Extensions: Install from VSIX…** from the command palette
  (`Ctrl+Shift+P` / `Cmd+Shift+P`) and select the downloaded file.

### Antigravity

Google's [Antigravity](https://antigravity.google) IDE is a VS Code fork and,
like VSCodium, installs extensions from [Open VSX](https://open-vsx.org). The
same build works there with no extra steps. Either:

- **From the Extensions view** — search **RuntimeWire** (`Ctrl+Shift+X` /
  `Cmd+Shift+X`) and click **Install** (Antigravity points its Extensions view
  at Open VSX), or
- **From a `.vsix` file** — download the latest `runtimewire-*.vsix` from the
  [GitHub releases](https://github.com/ryan-merket/runtimewire-vscode/releases),
  then run **Extensions: Install from VSIX…** from the command palette
  (`Ctrl+Shift+P` / `Cmd+Shift+P`) and select the downloaded file.

The RuntimeWire entry appears in Antigravity's status bar exactly as it does in
VS Code — it sits alongside any other status-bar items (including quota monitors
like Antigravity Pulse), never replacing them.

## Getting started

1. Click the **RuntimeWire** entry in the status bar (bottom-right) to open the
   menu.
2. Choose **Sign in** and authenticate with Google, then copy your publisher key
   (it starts with `rwpub_`) from the dashboard and paste it back into VS Code.
3. Keep coding — impressions and clicks earn automatically.

Before you sign in you'll already see real headlines and sponsored slots — a live
preview. Those preview impressions don't earn you anything; sign in to start
earning your share.

## Status bar

| State | Meaning |
| --- | --- |
| `$(pulse) <headline>` | A live RuntimeWire headline. Click to read it. |
| `$(megaphone) Sponsored · Brand — …` | The native sponsored slot. Click to open it. |
| `RuntimeWire` / `RuntimeWire offline` | Still loading, or the backend is temporarily unreachable. |

Click the entry to open the RuntimeWire menu — read any headline or the sponsor,
sign in/out, open the earnings dashboard, or refresh. The tooltip always shows
your current revenue share.

## Commands

Open the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command | Description |
| --- | --- |
| `RuntimeWire: Sign in` | Authenticate with Google + store your publisher key. |
| `RuntimeWire: Sign out` | Remove the stored key and stop earning. |
| `RuntimeWire: Refresh` | Reload headlines + the sponsored slot now. |
| `RuntimeWire: Open earnings dashboard` | Open your publisher dashboard. |
| `RuntimeWire: Open current headline or sponsor` | Open whatever the status bar is showing. |
| `RuntimeWire: Menu` | Open the full RuntimeWire menu. |
| `RuntimeWire: Pause/Resume ticker` | Mute (or un-mute) the rotation without uninstalling. |

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `runtimewire.apiBase` | `https://runtimewire.com` | RuntimeWire origin to read news + ads from. |
| `runtimewire.newsCount` | `5` | How many headlines to rotate beside the sponsored slot (4–6). |
| `runtimewire.refreshSeconds` | `180` | How often headlines + the sponsor refresh. |
| `runtimewire.categories` | _(all)_ | Only show these topics. Leave empty for all. Options: `ai`, `startups`, `products`, `funding`, `founder-moves`, `exits`, `venture`, `scoops`, `latest`. |
| `runtimewire.prominent` | `false` | Give the status-bar entry a high-contrast background so it's easier to spot. |

## Privacy

The extension talks only to your configured RuntimeWire origin. Anonymous mode
sends no account information. When signed in, it reports ad impressions and clicks
to attribute your revenue share — the same anti-fraud serving the website uses. It
**never** reads your code, prompts, completions, or any chat content. Your
publisher key is stored in VS Code SecretStorage (your OS keychain), never in
plaintext settings.

## License

MIT
