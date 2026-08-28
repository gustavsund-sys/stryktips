import * as cheerio from 'cheerio';
import type { ExpertPick, Tip } from '../types';

export const TIPPER_INDEX = 'https://tipper.se/stryktipset';
const validTips = new Set<Tip>(['1', 'X', '2', '1X', 'X2', '12', '1X2']);
const rowPattern = /(1[0-3]|[1-9])\.\s+(.+?)\s+[–—-]\s+(.+?)\s+(1X2|1X|X2|12|1|X|2)(?=\s+(?:1[0-3]|[1-9])\.|\s*\/|$)/gi;

export function parseTipper(html: string, url: string): ExpertPick[] {
  const $ = cheerio.load(html);
  const expertMarker = $('strong').filter((_, element) => /^Expert:\s*/i.test($(element).text().trim())).first();
  if (!expertMarker.length) return [];
  const expert = expertMarker.text().replace(/^Expert:\s*/i, '').trim() || 'Huvudanalys';
  const blocks: string[] = []; let current = expertMarker.parent().next();
  while (current.length) {
    if (/^Expert:\s*/i.test(current.find('strong').first().text().trim())) break;
    const block = current.clone(); block.find('br').replaceWith(' '); blocks.push(block.text()); current = current.next();
  }
  const text = blocks.join(' ').replace(/\s+/g, ' ').trim(); const systemStart = text.search(/Systemförslag/i);
  if (systemStart < 0) return [];
  const system = text.slice(systemStart); const picks: ExpertPick[] = [];
  for (const match of system.matchAll(rowPattern)) {
    const tip = match[4].toUpperCase() as Tip; if (!validTips.has(tip)) continue;
    picks.push({ matchNumber: Number(match[1]), homeTeam: match[2].trim(), awayTeam: match[3].trim(), tip, expert: `Tipper / ${expert}`, source: 'tipper', sourceUrl: url });
  }
  return picks.sort((a, b) => a.matchNumber - b.matchNumber);
}
