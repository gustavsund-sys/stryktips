import { readFileSync } from 'node:fs'; import { join } from 'node:path'; import { describe, expect, it } from 'vitest';
import { parseSvenskaSpel } from '../scrapers/svenskaspel';
const html = readFileSync(join(__dirname, 'fixtures', 'svenskaspel.html'), 'utf8');
describe('Svenska Spel-adapter', () => {
  it('läser officiell kupong, streck och odds', () => { const coupon = parseSvenskaSpel(html); expect(coupon.matches).toHaveLength(13); expect(coupon.roundDate).toBe('2026-08-22'); expect(coupon.matches[0]).toEqual({ matchNumber: 1, homeTeam: 'Lag 1', awayTeam: 'Lag 2', distribution: { '1': 40, X: 30, '2': 30 }, odds: { '1': 2.1, X: 3.2, '2': 3.4 } }); });
  it('avvisar trasig streckdata', () => { expect(() => parseSvenskaSpel(html.replace('["40","30","30"]', '["80","30","30"]'))).toThrow(/strecksummering/); });
});
