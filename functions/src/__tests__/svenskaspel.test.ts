import { describe, expect, it } from 'vitest';
import { buildOfficialRoundId, parseSvenskaSpelApi } from '../scrapers/svenskaspel';
describe('Svenska Spel-adapter', () => {
  it('läser aktuell omgång direkt från JSON-API:t', () => {
    const payload = { draws: [{ productId: 1, drawState: 'Open', drawNumber: 4968, regCloseTime: '2026-08-29T15:59:00+02:00', drawEvents: Array.from({ length: 13 }, (_, index) => ({ eventNumber: index + 1, match: { participants: [{ type: 'home', name: `Hemma ${index + 1}` }, { type: 'away', name: `Borta ${index + 1}` }] }, svenskaFolket: { one: '40', x: '30', two: '30', date: '2026-08-26T08:00:00+02:00' }, odds: index === 0 ? { one: '2,10', x: '3,20', two: '3,40' } : null })) }] };
    const coupon = parseSvenskaSpelApi(payload);
    expect(coupon).toMatchObject({ officialRoundId: 'draw-4968', drawNumber: 4968, roundDate: '2026-08-29', regCloseTime: '2026-08-29T15:59:00+02:00' });
    expect(coupon.matches).toHaveLength(13);
    expect(coupon.matches[0]).toEqual({ matchNumber: 1, homeTeam: 'Hemma 1', awayTeam: 'Borta 1', distribution: { '1': 40, X: 30, '2': 30 }, odds: { '1': 2.1, X: 3.2, '2': 3.4 } });
  });
  it('avvisar ett ofullständigt API-svar', () => { expect(() => parseSvenskaSpelApi({ draws: [{ productId: 1, drawState: 'Open', drawNumber: 1, regCloseTime: '2026-08-29T15:59:00+02:00', drawEvents: [] }] })).toThrow(/0\/13/); });
  it('accepterar komplett kupong även när odds ännu saknas', () => {
    const payload = { draws: [{ productId: 1, drawState: 'Open', drawNumber: 4968, regCloseTime: '2026-08-29T15:59:00+02:00', drawEvents: Array.from({ length: 13 }, (_, index) => ({ eventNumber: index + 1, match: { participants: [{ type: 'home', name: `H${index}` }, { type: 'away', name: `B${index}` }] }, svenskaFolket: { one: '40', x: '30', two: '30' }, odds: { one: null, x: null, two: null } })) }] };
    expect(parseSvenskaSpelApi(payload).matches.every((match) => match.odds === undefined)).toBe(true);
  });
  it('bygger en stabil reservnyckel utan drawNumber', () => {
    const matches = Array.from({ length: 13 }, (_, index) => ({ matchNumber: index + 1, homeTeam: `H${index}`, awayTeam: `B${index}`, distribution: { '1': 40, X: 30, '2': 30 } as const }));
    expect(buildOfficialRoundId(undefined, '2026-08-29T15:59:00+02:00', matches)).toBe(buildOfficialRoundId(undefined, '2026-08-29T15:59:00+02:00', matches));
  });
});
