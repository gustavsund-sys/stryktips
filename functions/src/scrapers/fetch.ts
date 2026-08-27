import * as cheerio from 'cheerio';

// Några WordPress-/CDN-skydd returnerar en tom kontrollsida till uppenbara bot-UA:n,
// trots HTTP 200. Vi hämtar samma publika HTML som en vanlig, modern webbläsare.
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'sv-SE,sv;q=0.9,en;q=0.7', 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`HTTP_${response.status}: ${url}`);
  return response.text();
}

export function findCurrentArticle(indexHtml: string, baseUrl: string): string {
  const $ = cheerio.load(indexHtml); const base = new URL(baseUrl);
  const candidates = $('a[href]').map((_, element) => {
    try {
      const url = new URL($(element).attr('href')!, base); const path = url.pathname.toLowerCase();
      if (url.origin !== base.origin || url.hash || url.href === base.href || /resultat/.test(path) || !/stryktips/.test(`${path} ${$(element).text().toLowerCase()}`)) return null;
      let score = 0;
      if (/\/speltips\/stryktipset-/.test(path)) score += 30;
      if (/\/tips\/stryktipset\/[^/]+/.test(path)) score += 30;
      if (/\/stryktipset\/v\d{1,2}-\d{4}/.test(path)) score += 30;
      if (/\/stryktipsforslag\/stryktipset-/.test(path)) score += 30;
      if (/\/fotboll\/stryktipset-/.test(path)) score += 30;
      if (/analys|tips|vecka|v\d/.test(`${path} ${$(element).text().toLowerCase()}`)) score += 10;
      return score ? { url: url.toString(), score } : null;
    } catch { return null; }
  }).get().filter((item): item is { url: string; score: number } => Boolean(item)).sort((a, b) => b.score - a.score);
  if (!candidates.length) throw new Error('ARTICLE_NOT_FOUND');
  return candidates[0].url;
}
