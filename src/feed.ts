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
 */
export async function buildFeed(
  base: string,
  key: string | null,
  newsCount: number,
): Promise<{ rows: FeedRow[]; slots: Slot[] }> {
  const [news, slots] = await Promise.all([
    fetchNews(base),
    fetchSlots(base, key, 1),
  ]);

  const rows: FeedRow[] = news
    .slice(0, newsCount)
    .map((item) => ({ kind: "news" as const, item }));

  if (slots[0]) {
    const at = Math.min(2, rows.length);
    rows.splice(at, 0, { kind: "ad", slot: slots[0] });
  }

  return { rows, slots };
}
