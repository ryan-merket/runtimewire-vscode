import * as vscode from "vscode";

/**
 * The publisher `rwpub_…` key is stored in VS Code SecretStorage (backed by the
 * OS keychain), never in settings or globalState.
 */
const SECRET_KEY = "runtimewire.publisherKey";

export function getKey(ctx: vscode.ExtensionContext): Promise<string | undefined> {
  return Promise.resolve(ctx.secrets.get(SECRET_KEY)).then((v) =>
    v && v.trim() ? v.trim() : undefined,
  );
}

export function setKey(ctx: vscode.ExtensionContext, key: string): Thenable<void> {
  return ctx.secrets.store(SECRET_KEY, key.trim());
}

export function clearKey(ctx: vscode.ExtensionContext): Thenable<void> {
  return ctx.secrets.delete(SECRET_KEY);
}
