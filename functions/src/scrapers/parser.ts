import * as cheerio from 'cheerio';
import type { ExpertPick, SourceId, Tip } from '../types';

const VALID_TIPS = new Set<Tip>(['1', 'X', '2', '1X', 'X2', '12', '1X2']);
const rowPattern = /(?:^|\s)(?:match\s*)?(1[0-3]|[1-9])[.:)]?\s+(.+?)\s+(?:-|–|—|mot)\s+(.+?)\s+(1X2|1X|X2|12|1|X|2)(?=\s|$)/i;

export interface ParserOptions { source: SourceId; url: string; defaultExpert: string; selectors: string[]; }

function clean(value: string): string { return value.replace(/\s+/g, ' ').trim(); }

export function parseTipPage(html: string, options: ParserOptions): ExpertPick[] {
  const $ = cheerio.load(html); const picks: ExpertPick[] = []; const seen = new Set<string>();
  const selector = options.selectors.join(',');
  $(selector).each((_, element) => {
    const node = $(element); const text = clean(node.text()); const match = text.match(rowPattern);
    if (!match) return;
    const matchNumber = Number(match[1]); const tip = match[4].toUpperCase() as Tip;
    if (!VALID_TIPS.has(tip)) return;
    const container = node.closest('[data-expert], article, section');
    const expert = clean(node.attr('data-expert') || container.attr('data-expert') || container.find('.author,.expert,.byline,[rel="author"]').first().text() || options.defaultExpert);
    const key = `${expert}:${matchNumber}`; if (seen.has(key)) return; seen.add(key);
    picks.push({ matchNumber, homeTeam: clean(match[2]), awayTeam: clean(match[3]), tip, expert, source: options.source, sourceUrl: options.url });
  });
  return picks.sort((a, b) => a.matchNumber - b.matchNumber || a.expert.localeCompare(b.expert));
}

export function validatePicks(picks: ExpertPick[]): void {
  if (!picks.length) throw new Error('PARSER_ERROR: inga experttips hittades');
  const groups = new Map<string, ExpertPick[]>();
  for (const pick of picks) { const key = `${pick.source}:${pick.expert}`; groups.set(key, [...(groups.get(key) ?? []), pick]); }
  for (const [expert, expertPicks] of groups) {
    const numbers = new Set(expertPicks.map((pick) => pick.matchNumber));
    if (expertPicks.length !== 13 || numbers.size !== 13 || [...numbers].some((n) => n < 1 || n > 13)) throw new Error(`PARSER_ERROR: ${expert} gav ${numbers.size}/13 unika matcher`);
    if (expertPicks.some((pick) => !pick.homeTeam || !pick.awayTeam || !VALID_TIPS.has(pick.tip))) throw new Error(`PARSER_ERROR: ofullständig data för ${expert}`);
  }
}
