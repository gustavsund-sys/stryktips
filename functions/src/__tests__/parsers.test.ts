import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBettingstugan } from '../scrapers/bettingstugan';
import { parseRekatochklart } from '../scrapers/rekatochklart';
import { validatePicks } from '../scrapers/parser';
import { parseUnderstreckat } from '../scrapers/understreckat';
import { parseTipsmedoss } from '../scrapers/tipsmedoss';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
describe('källparser', () => {
  it('läser 13 matcher från Rekatochklart', () => { const picks = parseRekatochklart(fixture('rekatochklart.html'), 'https://example.test/rk'); expect(() => validatePicks(picks)).not.toThrow(); expect(picks).toHaveLength(13); expect(picks[1]).toMatchObject({ matchNumber: 2, homeTeam: 'Burnley', awayTeam: 'Sunderland', tip: 'X2', expert: 'Anna RK' }); });
  it('läser och normaliserar 13 Bettingstugan-rader', () => { const picks = parseBettingstugan(fixture('bettingstugan.html'), 'https://example.test/bs'); expect(() => validatePicks(picks)).not.toThrow(); expect(picks).toHaveLength(13); expect(picks[7].tip).toBe('12'); });
  it('vägrar publicera en ofullständig kupong', () => { const picks = parseRekatochklart('<article><p>1. A - B 1</p></article>', 'https://example.test'); expect(() => validatePicks(picks)).toThrow(/1\/13/); });
  it('läser Understreckats publicerade system som en separat expert', () => { const picks = parseUnderstreckat(fixture('understreckat.html'), 'https://understreckat.se/stryktipset/v33-2026'); expect(() => validatePicks(picks)).not.toThrow(); expect(picks).toHaveLength(13); expect(picks[0]).toMatchObject({ tip:'1X', expert:'Understreckat / Redaktionen', source:'understreckat' }); });
  it('låter inte sidmetadata följa med i Understreckats expertnamn', () => { const html = fixture('understreckat.html').replace('Av Redaktionen · 5 min läsning', 'Av RedaktionenMatcher13Systemet768 rader'); const picks = parseUnderstreckat(html, 'https://understreckat.se/stryktipset/v34-2026'); expect(picks[0].expert).toBe('Understreckat / Redaktionen'); });
  it('läser Tipsmedoss veckoförslag och normaliserar tecken med mellanrum', () => { const picks = parseTipsmedoss(fixture('tipsmedoss.html'), 'https://tipsmedoss.com/2026/stryktipsforslag/stryktipset-22-8/'); expect(() => validatePicks(picks)).not.toThrow(); expect(picks).toHaveLength(13); expect(picks[0]).toMatchObject({ tip:'12', expert:'Tipsmedoss / Kamil Sytniowski', source:'tipsmedoss' }); });
});
