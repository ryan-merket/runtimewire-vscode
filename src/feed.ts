import { fetchNews } from "./api";
import { fetchSlots, type Slot } from "./ads";
import type { NewsItem } from "./rss";

export type FeedRow =
  | { kind: "news"; item: NewsItem }
  | { kind: "ad"; slot: Slot };

/**
 * Build the combined feed: `newsCount` fresh headlines with one native
 * sponsored slot interleaved a few rows down. News and the ad are fetched in
 * parallel; either failing degrades gracefully (fewer rows, or no ad) rather
 * than erroring.
 *
 * When `adsOnly` is true the news fetch is skipped entirely and the feed is
 * sponsored-only — just the single served slot (or no rows when none fills).
 */
export async function buildFeed(
  base: string,
  key: string | null,
  newsCount: number,
  categories: string[] = [],
  adsOnly = false,
): Promise<{ rows: FeedRow[]; slots: Slot[]; fetchedAny: boolean }> {
  if (adsOnly) {
    const slots = await fetchSlots(base, key, 1);
    const rows: FeedRow[] = slots[0] ? [{ kind: "ad" as const, slot: slots[0] }] : [];
    // `fetchedAny` mirrors the news path: true only when the serve actually
    // filled. On an empty/failed serve we report false so the caller keeps the
    // prior rotation rather than blanking the ticker on a transient blip.
    return { rows, slots, fetchedAny: slots.length > 0 };
  }

  const [news, slots] = await Promise.all([
    fetchNews(base),
    fetchSlots(base, key, 1),
  ]);

  // Topic filter: when the user has chosen categories, keep only headlines whose
  // primary category matches. Empty selection = show everything. We respect the
  // filter strictly (we never resurface a muted topic) — if a narrow topic has
  // no recent stories the ticker simply waits for the next matching headline.
  const wanted = new Set(categories.map((c) => c.toLowerCase()));
  const chosen =
    wanted.size === 0
      ? news
      : news.filter((n) => n.category != null && wanted.has(n.category.toLowerCase()));

  const rows: FeedRow[] = chosen
    .slice(0, newsCount)
    .map((item) => ({ kind: "news" as const, item }));

  if (slots[0]) {
    const at = Math.min(2, rows.length);
    rows.splice(at, 0, { kind: "ad", slot: slots[0] });
  }

  // `fetchedAny` distinguishes "the news fetch succeeded but the topic filter
  // excluded everything" (legitimate empty — honor it strictly) from "the fetch
  // failed / returned nothing" (transient — keep the prior rotation).
  return { rows, slots, fetchedAny: news.length > 0 };
}
