import * as vscode from "vscode";
import { getApiBase } from "./config";
import { publisherMe } from "./api";
import { setKey } from "./secrets";

/** Path the user lands on after Google sign-in to copy their rwpub_ key. */
function dashboardStartUrl(base: string): string {
  return `${base}/api/publisher/google/start?return=/publisher`;
}

/**
 * Interactive sign-in: open the browser to the Google publisher sign-in, then
 * accept the pasted `rwpub_…` key and validate it before storing it in
 * SecretStorage. Returns true when a valid key was stored.
 */
export async function signIn(ctx: vscode.ExtensionContext): Promise<boolean> {
  const base = getApiBase();

  const choice = await vscode.window.showInformationMessage(
    "Sign in to RuntimeWire with Google, then copy your publisher key (it starts with rwpub_) from the dashboard.",
    "Open sign-in",
    "I already have my key",
  );
  if (!choice) return false;
  if (choice === "Open sign-in") {
    await vscode.env.openExternal(vscode.Uri.parse(dashboardStartUrl(base)));
  }

  const entered = await vscode.window.showInputBox({
    title: "RuntimeWire publisher key",
    prompt: "Paste your rwpub_… key from the RuntimeWire publisher dashboard",
    password: true,
    ignoreFocusOut: true,
    placeHolder: "rwpub_…",
    validateInput: (v) =>
      v && v.trim() && !v.trim().startsWith("rwpub_")
        ? "That doesn't look like a publisher key (expected an rwpub_… value)."
        : null,
  });

  const key = entered?.trim();
  if (!key) return false;
  if (!key.startsWith("rwpub_")) {
    vscode.window.showWarningMessage("That doesn't look like a publisher key (expected an rwpub_… value).");
    return false;
  }

  const me = await publisherMe(base, key);
  if (!me) {
    vscode.window.showErrorMessage("That key was rejected. Double-check it and try again.");
    return false;
  }

  await setKey(ctx, key);
  vscode.window.showInformationMessage(
    `RuntimeWire: signed in as ${me.email ?? me.handle ?? `publisher #${me.id ?? "?"}`}. You're now earning a revenue share.`,
  );
  return true;
}
