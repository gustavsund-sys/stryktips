import * as cheerio from 'cheerio';
import type { ExpertPick, Tip } from '../types';

export const TIPSMEDOSS_INDEX = 'https://tipsmedoss.com/category/stryktipsforslag/';
export const TIPSMEDOSS_API = 'https://tipsmedoss.com/wp-json/wp/v2/posts?search=Stryktipset&per_page=10&_fields=link,date,title,content';
const validTips = new Set<Tip>(['1', 'X', '2', '1X', 'X2', '12', '1X2']);
const rowPattern = /^(1[0-3]|[1-9])\.\s+(.+?)\s+[–—-]\s+(.+?),\s*(1\s*X\s*2|1\s*X|X\s*2|1\s*2|1|X|2)\s*$/i;

export function parseTipsmedoss(html: string, url: string): ExpertPick[] {
  const $ = cheerio.load(html); const author = $('meta[name="author"]').attr('content')?.trim() || $('.vcard .fn').first().text().replace(/^av\s+/i, '').trim() || 'Redaktionen';
  const picks: ExpertPick[] = [];
  $('.entry-content p, article p').each((_, element) => {
    const match = $(element).text().replace(/\s+/g, ' ').trim().match(rowPattern); if (!match) return;
    const tip = match[4].replace(/\s+/g, '').toUpperCase() as Tip; if (!validTips.has(tip)) return;
    picks.push({ matchNumber: Number(match[1]), homeTeam: match[2].trim(), awayTeam: match[3].trim(), tip, expert: `Tipsmedoss / ${author}`, source: 'tipsmedoss', sourceUrl: url });
  });
  return picks.sort((a, b) => a.matchNumber - b.matchNumber);
}
