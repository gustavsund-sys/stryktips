import * as cheerio from 'cheerio'; import type { ExpertPick, Tip } from '../types';
export const UNDERSTRECKAT_INDEX = 'https://understreckat.se/stryktipset';
const validTips = new Set<Tip>(['1','X','2','1X','X2','12','1X2']);
export function parseUnderstreckat(html: string, url: string): ExpertPick[] {
  const $ = cheerio.load(html); const expertText = $('main,article,body').first().text().match(/Av\s+([^·\n]+)/i)?.[1]?.trim() || 'Redaktionen'; const picks: ExpertPick[] = [];
  $('section[id^="match-"]').each((_, element) => { const heading = $(element).find('h2').first().text().replace(/\s+/g,' ').trim().match(/^(1[0-3]|[1-9])\.\s+(.+?)\s+[–—-]\s+(.+)$/); const tip = $(element).find('span').filter((__, span) => validTips.has($(span).text().replace(/\s+/g,'').toUpperCase() as Tip)).first().text().replace(/\s+/g,'').toUpperCase() as Tip; if (heading && validTips.has(tip)) picks.push({ matchNumber:Number(heading[1]), homeTeam:heading[2].trim(), awayTeam:heading[3].trim(), tip, expert:`Understreckat / ${expertText}`, source:'understreckat', sourceUrl:url }); });
  if (picks.length) return picks.sort((a,b) => a.matchNumber-b.matchNumber);
  $('h2').each((_, element) => { const match = $(element).text().replace(/\s+/g,' ').trim().match(/^(1[0-3]|[1-9])\.\s+(.+?)\s+[–—-]\s+(.+)$/); if (!match) return; let next = $(element).next(); let tip: Tip | undefined; while (next.length && next[0].tagName !== 'h2') { const value = next.text().replace(/\s+/g,'').toUpperCase() as Tip; if (validTips.has(value)) { tip = value; break; } next = next.next(); } if (tip) picks.push({ matchNumber:Number(match[1]), homeTeam:match[2].trim(), awayTeam:match[3].trim(), tip, expert:`Understreckat / ${expertText}`, source:'understreckat', sourceUrl:url }); });
  return picks.sort((a,b) => a.matchNumber-b.matchNumber);
}
