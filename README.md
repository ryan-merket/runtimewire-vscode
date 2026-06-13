# RuntimeWire for VS Code

The latest AI news right in your **status bar** — perfect for the minutes you
spend waiting on **Claude Code**, **Codex**, or any agent to finish. A single
status-bar entry rotates through fresh [RuntimeWire](https://runtimewire.com)
headlines plus **one** clearly-labelled native sponsored slot you can **earn a
revenue share from** by signing in. No sidebar, no panel, no webview — just one
glanceable line.

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
- **Fail-soft** — a network blip, empty feed, or missing ad never breaks the
  ticker. Anonymous mode always works; you just don't earn until you sign in.

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

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `runtimewire.apiBase` | `https://runtimewire.com` | RuntimeWire origin to read news + ads from. |
| `runtimewire.newsCount` | `5` | How many headlines to rotate beside the sponsored slot (4–6). |
| `runtimewire.refreshSeconds` | `180` | How often headlines + the sponsor refresh. |

## Privacy

The extension talks only to your configured RuntimeWire origin. Anonymous mode
sends no account information. When signed in, it reports ad impressions and clicks
to attribute your revenue share — the same anti-fraud serving the website uses. It
**never** reads your code, prompts, completions, or any chat content. Your
publisher key is stored in VS Code SecretStorage (your OS keychain), never in
plaintext settings.

## Development

```bash
npm install
npm run compile      # tsc -> dist/
npm run package      # build a .vsix (needs: npx @vscode/vsce)
```

Press `F5` in VS Code to launch an Extension Development Host for live testing.

## License

MIT
