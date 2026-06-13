import { USER_AGENT } from "./config";
import { parseRss, type NewsItem } from "./rss";

const TIMEOUT_MS = 9000;

/** All network calls share this fail-soft fetch: timeout + never throws. */
async function request(
  url: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  const res = await request(url, init);
  if (!res || !res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function authHeaders(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}` };
}

// ---- Public reader feed ----

export async function fetchNews(base: string): Promise<NewsItem[]> {
  const res = await request(`${base}/rss`, {
    headers: { Accept: "application/rss+xml, application/xml, text/xml" },
  });
  if (!res || !res.ok) return [];
  try {
    return parseRss(await res.text());
  } catch {
    return [];
  }
}

// ---- Site native ad units (anti-fraud CPM, no auth) ----

export type AdUnit = {
  id: number;
  brand: string;
  title: string;
  body: string;
  imageUrl: string | null;
  ctaLabel: string;
  placement: string;
};

export type ServeUnitResponse = {
  filled: boolean;
  unit?: AdUnit;
  token?: string;
  expiresAt?: string;
  /** True for first-party "house" promos served when no paid ad fills the slot. */
  house?: boolean;
  /** House-ad destination (may be a site-relative path like `/advertise`). */
  ctaUrl?: string;
  /**
   * Publisher revenue-share attribution, folded into the SAME serve response
   * when the request carries a valid publisher key AND a paid unit was served.
   * Lets a signed-in client skip the separate /publisher/serve round trip.
   */
  attribution?: ServeAttribution;
};

/**
 * Serve the best unit for the IDE surface. Sends rich context (surface/device/
 * ide). When a publisher `key` is provided, the publisher attribution token is
 * folded into the response (no separate /publisher/serve call needed).
 */
export function serveUnit(base: string, key?: string | null): Promise<ServeUnitResponse | null> {
  return getJson<ServeUnitResponse>(
    `${base}/api/public/units?placement=vscode&surface=ide&ide=vscode&device=desktop`,
    key ? { headers: authHeaders(key) } : undefined,
  );
}

export function seenUnit(base: string, token: string): Promise<{ ok?: boolean } | null> {
  return getJson(`${base}/api/public/units/seen`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

export function tapUnit(base: string, token: string): Promise<{ ok?: boolean; url?: string } | null> {
  return getJson(`${base}/api/public/units/tap`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
}

// ---- Publisher revenue share (Bearer rwpub_… key) ----

export type PublisherMe = {
  id?: number;
  email?: string;
  status?: string;
  handle?: string | null;
};

export type ServeAttribution = {
  serveToken: string;
  jti?: string;
  expiresAt?: string;
  grossImpressionMicros?: number;
};

export type PublisherBalance = {
  pendingMicros: number;
  clearedMicros: number;
  reversedMicros: number;
};

export type LedgerEntry = {
  type?: string;
  developerShareMicros?: number;
  state?: string;
  createdAt?: string;
};

export function publisherMe(base: string, key: string): Promise<PublisherMe | null> {
  return getJson<PublisherMe>(`${base}/api/publisher/me`, { headers: authHeaders(key) });
}

export function publisherServe(
  base: string,
  key: string,
  articleSlug?: string,
): Promise<ServeAttribution | null> {
  return getJson<ServeAttribution>(`${base}/api/publisher/serve`, {
    method: "POST",
    headers: { ...authHeaders(key), "Content-Type": "application/json" },
    body: JSON.stringify(articleSlug ? { articleSlug } : {}),
  });
}

export type PublisherEventInput = {
  eventId: string;
  type: "impression" | "click";
  serveToken: string;
  deviceId?: string;
  onScreenMs?: number;
};

export function publisherEvent(
  base: string,
  key: string,
  input: PublisherEventInput,
): Promise<{ status?: string } | null> {
  return getJson(`${base}/api/publisher/events`, {
    method: "POST",
    headers: { ...authHeaders(key), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function publisherBalance(base: string, key: string): Promise<PublisherBalance | null> {
  return getJson<PublisherBalance>(`${base}/api/publisher/balance`, { headers: authHeaders(key) });
}

export function publisherLedger(
  base: string,
  key: string,
  limit = 200,
): Promise<LedgerEntry[] | null> {
  return getJson<LedgerEntry[] | { entries?: LedgerEntry[] }>(
    `${base}/api/publisher/ledger?limit=${limit}`,
    { headers: authHeaders(key) },
  ).then((r) => {
    if (!r) return null;
    if (Array.isArray(r)) return r;
    return Array.isArray(r.entries) ? r.entries : [];
  });
}
