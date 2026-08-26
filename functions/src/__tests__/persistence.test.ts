import { describe, expect, it } from 'vitest';
import { omitUndefined, planOfficialCoupon } from '../persistence';
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
  });
});
