import * as cheerio from 'cheerio';

const USER_AGENT = 'StryktipsetExpertkonsensus/1.0 (+contact: configure-before-deploy)';

export async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' }, signal: AbortSignal.timeout(15_000) });
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
      if (/analys|tips|vecka|v\d/.test(`${path} ${$(element).text().toLowerCase()}`)) score += 10;
      return score ? { url: url.toString(), score } : null;
    } catch { return null; }
  }).get().filter((item): item is { url: string; score: number } => Boolean(item)).sort((a, b) => b.score - a.score);
  if (!candidates.length) throw new Error('ARTICLE_NOT_FOUND');
  return candidates[0].url;
}
