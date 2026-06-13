/**
 * Tiny zero-dependency RSS parser tailored to RuntimeWire's own first-party
 * feed. It is deliberately forgiving: any malformed item is skipped rather than
 * throwing, so a feed hiccup degrades to fewer stories instead of a crash.
 */

export type NewsItem = {
  title: string;
  link: string;
  creator: string | null;
  category: string | null;
  pubDate: Date | null;
};

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function pick(block: string, tag: string): string | null {
  // Matches <tag ...>value</tag> or <ns:tag>value</ns:tag>.
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = re.exec(block);
  if (!m) return null;
  const v = decodeEntities(m[1] ?? "");
  return v || null;
}

export function parseRss(xml: string): NewsItem[] {
  if (!xml || typeof xml !== "string") return [];
  const items: NewsItem[] = [];
  const itemRe = /<item\b[\s\S]*?<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[0];
    const title = pick(block, "title");
    const link = pick(block, "link");
    if (!title || !link) continue;
    const dateStr = pick(block, "pubDate");
    let pubDate: Date | null = null;
    if (dateStr) {
      const d = new Date(dateStr);
      pubDate = Number.isNaN(d.getTime()) ? null : d;
    }
    items.push({
      title,
      link,
      creator: pick(block, "dc:creator") ?? pick(block, "author"),
      category: pick(block, "category"),
      pubDate,
    });
  }
  return items;
}
