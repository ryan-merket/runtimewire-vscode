import { randomUUID } from "node:crypto";
import { serveUnit, seenUnit, tapUnit, publisherEvent, type AdUnit } from "./api";

/**
 * Resolve a house-ad `ctaUrl` (often a site-relative path like `/advertise`)
 * to an absolute URL against the configured API base. Returns null if it can't
 * be made into a valid http(s) URL.
 */
function resolveHouseUrl(base: string, ctaUrl: string | undefined): string | null {
  if (!ctaUrl) return null;
  try {
    const url = new URL(ctaUrl, base.endsWith("/") ? base : `${base}/`);
    return /^https?:$/i.test(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * A single sponsored slot to interleave into the news list. It carries BOTH
 * tracking handles:
 *   - `siteToken`     — the anti-fraud CPM serve token (counts toward the
 *                       advertiser's paid CPM via /public/units seen + tap).
 *   - `pubServeToken` — the publisher revenue-share attribution token (only set
 *                       when signed in), reported via /publisher/events.
 * The same serve token is reused for impression + click (the server's
 * (jti, type) uniqueness allows exactly one of each).
 */
export type Slot = {
  /** Stable id used to map a click/impression back to this slot. */
  id: string;
  unit: AdUnit;
  /**
   * Anti-fraud CPM serve token for a PAID unit, or null for a first-party
   * "house" promo (which carries no token and is never billed — it renders as
   * a plain CTA linking to `houseCtaUrl`).
   */
  siteToken: string | null;
  /** True when this slot is an unbilled first-party house promo. */
  house: boolean;
  /** Absolute destination for a house slot's CTA (null for paid units). */
  houseCtaUrl: string | null;
  pubServeToken: string | null;
  eventBase: string;
  shownAt: number;
  impressed: boolean;
  clicked: boolean;
};

/**
 * Fetch up to `count` sponsored slots. Returns [] on any failure (no ads is a
 * normal state, never an error). When `key` is set, each slot also mints a
 * publisher attribution token so impressions/clicks earn a revenue share.
 */
export async function fetchSlots(
  base: string,
  key: string | null,
  count: number,
): Promise<Slot[]> {
  const slots: Slot[] = [];
  for (let i = 0; i < count; i++) {
    // ONE call does it all: passing the publisher key folds the revenue-share
    // attribution token into this same serve response (no separate
    // /publisher/serve round trip).
    const served = await serveUnit(base, key).catch(() => null);
    if (!served || !served.filled || !served.unit) continue;

    // A first-party house promo carries no serve token: render it as a plain,
    // unbilled CTA linking to `ctaUrl` (never call seen/tap, never attribute a
    // revenue share). A paid unit always carries a token and is billable.
    const isHouse = served.house === true || !served.token;

    // The publisher attribution token is folded into the serve response (only
    // present for a PAID unit when signed in).
    const pubServeToken = !isHouse && key ? (served.attribution?.serveToken ?? null) : null;
    slots.push({
      id: randomUUID(),
      unit: served.unit,
      siteToken: isHouse ? null : (served.token ?? null),
      house: isHouse,
      houseCtaUrl: isHouse ? resolveHouseUrl(base, served.ctaUrl) : null,
      pubServeToken,
      eventBase: randomUUID(),
      shownAt: Date.now(),
      impressed: false,
      clicked: false,
    });
  }
  return slots;
}

/**
 * Record an impression once per slot: the site CPM "seen" beacon plus, when
 * signed in, a publisher impression event with the real on-screen dwell time.
 * Fully fire-and-forget — failures never surface.
 */
export async function reportImpression(
  base: string,
  key: string | null,
  deviceId: string,
  slot: Slot,
): Promise<void> {
  if (slot.impressed) return;
  slot.impressed = true;
  // House promos are unbilled — there is no serve token to "see".
  if (slot.house || !slot.siteToken) return;
  const onScreenMs = Math.max(0, Date.now() - slot.shownAt);
  try {
    await seenUnit(base, slot.siteToken);
  } catch {
    /* ignore */
  }
  if (key && slot.pubServeToken) {
    try {
      await publisherEvent(base, key, {
        eventId: `${slot.eventBase}-imp`,
        type: "impression",
        serveToken: slot.pubServeToken,
        deviceId,
        onScreenMs,
      });
    } catch {
      /* ignore */
    }
  }
}

/**
 * Record a click and return the destination URL to open. Fires the site CPM
 * "tap" beacon (authoritative source of the click URL) and, when signed in, a
 * publisher click event. Returns null when no URL could be resolved.
 */
export async function reportClick(
  base: string,
  key: string | null,
  deviceId: string,
  slot: Slot,
): Promise<string | null> {
  slot.clicked = true;
  // House promos are unbilled: no tap beacon, just open the promo destination.
  if (slot.house || !slot.siteToken) return slot.houseCtaUrl;
  let url: string | null = null;
  try {
    const tap = await tapUnit(base, slot.siteToken);
    url = tap?.url ?? null;
  } catch {
    /* ignore */
  }
  if (key && slot.pubServeToken) {
    try {
      await publisherEvent(base, key, {
        eventId: `${slot.eventBase}-clk`,
        type: "click",
        serveToken: slot.pubServeToken,
        deviceId,
      });
    } catch {
      /* ignore */
    }
  }
  return url;
}
