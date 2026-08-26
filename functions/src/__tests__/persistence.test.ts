import { describe, expect, it } from 'vitest';
import { buildOfficialOnlyRound, omitUndefined, planOfficialCoupon } from '../persistence';
import type { OfficialCoupon } from '../types';

describe('Firestore persistence', () => {
  it('utelämnar undefined rekursivt utan att ändra giltiga värden', () => {
    expect(omitUndefined({
      statuses: {
        rekatochklart: {
          status: 'ERROR',
          lastSuccessfulUpdate: undefined,
        },
      },
      matches: [{ odds: undefined, signs: ['1', undefined, 'X'] }],
      published: false,
    })).toEqual({
      statuses: {
        rekatochklart: { status: 'ERROR' },
      },
      matches: [{ signs: ['1', 'X'] }],
      published: false,
    });
  });

  it('skapar inte samma officiella omgång dubbelt men uppdaterar ändrade streck', () => {
    const coupon: OfficialCoupon = {
      roundDate: '2026-08-29', drawNumber: 4968, officialRoundId: 'draw-4968', regCloseTime: '2026-08-29T15:59:00+02:00', updatedAt: '2026-08-26T08:00:00+02:00', sourceUrl: 'api',
      matches: Array.from({ length: 13 }, (_, index) => ({ matchNumber: index + 1, homeTeam: `H${index + 1}`, awayTeam: `B${index + 1}`, distribution: { '1': 40, X: 30, '2': 30 } })),
    };
    const first = planOfficialCoupon(undefined, coupon, 'check-1');
    expect(first.change).toBe('new');
    const stored = { ...first.data };
    const second = planOfficialCoupon(stored, coupon, 'check-2');
    expect(second).toEqual({ change: 'unchanged', fingerprint: first.fingerprint });
    expect(second.data).toBeUndefined();
    const changed = { ...coupon, matches: coupon.matches.map((match, index) => index === 0 ? { ...match, distribution: { '1': 41, X: 29, '2': 30 } } : match) };
    const third = planOfficialCoupon(stored, changed, 'check-3');
    expect(third.change).toBe('updated');
    expect(third.data?.officialMatches).toEqual(changed.matches);
    const visible = buildOfficialOnlyRound(coupon, 'check-4');
    expect(visible).toMatchObject({ roundDate: coupon.roundDate, officialOnly: true, expertCount: 0, systemRows: 0 });
    expect(visible.matches).toHaveLength(13);
  });

  it('ignorerar xStats hämtningstid och behåller senast fungerande bonusdata', () => {
    const base: OfficialCoupon = {
      roundDate: '2026-08-29', drawNumber: 4968, officialRoundId: 'draw-4968', regCloseTime: '2026-08-29T15:59:00+02:00', updatedAt: 'now', sourceUrl: 'api',
      matches: Array.from({ length: 13 }, (_, index) => ({ matchNumber: index + 1, homeTeam: `H${index}`, awayTeam: `B${index}`, distribution: { '1': 40, X: 30, '2': 30 }, xStatsMatchId: `id-${index}` })),
    };
    const xStats = { matchId: 'id-0', source: 'PlaymakerAI' as const, sourceUrl: 'x', updatedAt: 'first', entireSeason: { homeTeam: 'H0', awayTeam: 'B0', metrics: { xG: { home: 1.2, away: 0.8 } } } };
    const enriched = { ...base, matches: base.matches.map((match, index) => index === 0 ? { ...match, xStats } : match) };
    const first = planOfficialCoupon(undefined, enriched, 'check-1');
    const refetched = { ...enriched, matches: enriched.matches.map((match, index) => index === 0 ? { ...match, xStats: { ...xStats, updatedAt: 'second' } } : match) };
    expect(planOfficialCoupon(first.data, refetched, 'check-2').change).toBe('unchanged');
    const partial = planOfficialCoupon(first.data, base, 'check-3');
    expect((partial.change === 'unchanged' ? first.data?.officialMatches : partial.data?.officialMatches) as OfficialCoupon['matches']).toEqual(expect.arrayContaining([expect.objectContaining({ matchNumber: 1, xStats })]));
  });
});
