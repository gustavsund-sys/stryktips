import * as cheerio from 'cheerio';
import { parseTipPage } from './parser';
import type { ExpertPick, Tip } from '../types';

export const REKATOCHKLART_INDEX = 'https://www.rekatochklart.com/tips/stryktipset/';

export function parseRekatochklart(html: string, url: string) {
  const $ = cheerio.load(html); const markedPicks: ExpertPick[] = [];
  $('table tr').each((_, element) => {
    const row = $(element); const matchNumber = Number(row.find('.match-index').text().replace(/\D/g, ''));
    const teams = row.find('.match-name').text().replace(/\s+/g, ' ').trim().split(/\s+[–—-]\s+/);
    const resultClass = row.find('.results').attr('class') ?? ''; const marked = resultClass.match(/(?:^|\s)matchres(1X2|1X|X2|12|1|X|2)(?:\s|$)/i)?.[1]?.toUpperCase() as Tip | undefined;
    if (!Number.isInteger(matchNumber) || matchNumber < 1 || matchNumber > 13 || teams.length !== 2 || !marked) return;
    markedPicks.push({ matchNumber, homeTeam: teams[0], awayTeam: teams[1], tip: marked, expert: 'Rekatochklart', source: 'rekatochklart', sourceUrl: url });
  });
  if (markedPicks.length) return markedPicks.sort((a, b) => a.matchNumber - b.matchNumber);
  return parseTipPage(html, { source: 'rekatochklart', url, defaultExpert: 'Rekatochklart', selectors: ['[data-match]', '.stryktips-match', '.match-row', 'article h3', 'article p', 'article li', 'table tr'] });
}
