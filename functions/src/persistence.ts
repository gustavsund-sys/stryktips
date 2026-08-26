import { createHash } from 'node:crypto';
import type { ConsensusMatch, OfficialCoupon, OfficialMatch } from './types';

export function omitUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => omitUndefined(item)) as T;
  }

  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, omitUndefined(item)]),
    ) as T;
  }

  return value;
}

export type OfficialCouponChange = 'new' | 'updated' | 'unchanged';

export interface OfficialCouponPlan {
  change: OfficialCouponChange;
  fingerprint: string;
  data?: Record<string, unknown>;
}

export function officialCouponFingerprint(coupon: OfficialCoupon): string {
  return createHash('sha256').update(JSON.stringify({
    officialRoundId: coupon.officialRoundId,
    roundDate: coupon.roundDate,
    regCloseTime: coupon.regCloseTime,
    matches: coupon.matches,
  })).digest('hex');
}

export function mergeOfficialMatches(matches: ConsensusMatch[], officialMatches: OfficialMatch[]): ConsensusMatch[] {
  return matches.map((match) => {
    const official = officialMatches.find((item) => item.matchNumber === match.matchNumber);
    return official ? omitUndefined({ ...match, homeTeam: official.homeTeam, awayTeam: official.awayTeam, publicDistribution: official.distribution, odds: official.odds }) : match;
  });
}

export function planOfficialCoupon(existing: Record<string, unknown> | undefined, coupon: OfficialCoupon, checkedAt: string): OfficialCouponPlan {
  const fingerprint = officialCouponFingerprint(coupon);
  if (existing?.officialRoundId === coupon.officialRoundId && existing?.officialFingerprint === fingerprint) return { change: 'unchanged', fingerprint };
  const change: OfficialCouponChange = existing ? 'updated' : 'new';
  const existingMatches = Array.isArray(existing?.matches) ? existing.matches as ConsensusMatch[] : undefined;
  return {
    change,
    fingerprint,
    data: omitUndefined({
      roundDate: coupon.roundDate,
      officialRoundId: coupon.officialRoundId,
      drawNumber: coupon.drawNumber,
      regCloseTime: coupon.regCloseTime,
      officialMatches: coupon.matches,
      officialFingerprint: fingerprint,
      officialUpdatedAt: coupon.updatedAt,
      officialCheckedAt: checkedAt,
      sourceUrl: coupon.sourceUrl,
      ...(existingMatches ? { matches: mergeOfficialMatches(existingMatches, coupon.matches) } : {}),
      ...(!existing ? { discoveredAt: checkedAt } : {}),
    }),
  };
}
