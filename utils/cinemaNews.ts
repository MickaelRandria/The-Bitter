import type { FilNews, FilMedia } from './cinemaFil';

export interface NewsSource { name: string; url: string; hosts: string[]; mediaType: FilMedia }
export const CINEMA_NEWS_SOURCES: NewsSource[] = [
  { name: 'franceinfo', url: 'https://www.francetvinfo.fr/culture/cinema.rss', hosts: ['www.francetvinfo.fr', 'www.franceinfo.fr'], mediaType: 'movie' },
  { name: 'franceinfo', url: 'https://www.francetvinfo.fr/culture/series.rss', hosts: ['www.francetvinfo.fr', 'www.franceinfo.fr'], mediaType: 'tv' },
  { name: 'Le Monde', url: 'https://www.lemonde.fr/cinema/rss_full.xml', hosts: ['www.lemonde.fr'], mediaType: 'movie' },
];

function plain(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ')
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, raw) => {
      const n = raw[0].toLowerCase() === 'x' ? parseInt(raw.slice(1), 16) : Number(raw);
      return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
    })
    .replace(/&(amp|quot|apos|lt|gt|nbsp);/g, (_, key) => ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' })[key])
    .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
function field(xml: string, tag: string): string {
  return plain(xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1] || '');
}
function safeHttps(value: string, hosts?: string[]): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (hosts && !hosts.includes(url.hostname))) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^xtor$/i.test(key)) url.searchParams.delete(key);
    return url.href;
  } catch { return null; }
}
function newsId(url: string): string {
  let hash = 14695981039346656037n;
  for (const char of url) { hash ^= BigInt(char.codePointAt(0)!); hash = BigInt.asUintN(64, hash * 1099511628211n); }
  return `news:${hash.toString(16).padStart(16, '0')}`;
}

/** Flux RSS connus uniquement ; aucun HTML provenant des éditeurs n'est rendu. */
export function parseCinemaRss(xml: string, source: NewsSource, now = Date.now()): FilNews[] {
  if (xml.length > 1_000_000 || !/<rss\b/i.test(xml)) return [];
  const items: FilNews[] = [], seen = new Set<string>();
  for (const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const item = match[1], title = field(item, 'title'), url = safeHttps(field(item, 'link'), source.hosts);
    const timestamp = Date.parse(field(item, 'pubDate'));
    if (!title || !url || seen.has(url) || !Number.isFinite(timestamp) || timestamp > now + 3_600_000 || now - timestamp > 30 * 86_400_000) continue;
    const media = item.match(/<(?:enclosure|media:content|media:thumbnail)\b([^>]*)/i)?.[1] || '';
    const image = safeHttps(plain(media.match(/\burl=["']([^"']+)["']/i)?.[1] || ''));
    seen.add(url);
    items.push({ id: newsId(url), kind: 'news', mediaType: source.mediaType, title: title.slice(0, 250),
      description: field(item, 'description').slice(0, 230), image, source: source.name,
      sourceUrl: url, publishedAt: new Date(timestamp).toISOString(), reason: 'news' });
    if (items.length >= 20) break;
  }
  return items;
}
