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
    // updatedAt reflects fetch time and must not turn an unchanged xStats
    // payload into a new official coupon revision on every scheduled run.
    matches: coupon.matches.map((match) => ({ ...match, xStats: match.xStats ? {
      matchId: match.xStats.matchId,
      source: match.xStats.source,
      entireSeason: match.xStats.entireSeason,
      lastFiveGames: match.xStats.lastFiveGames,
    } : undefined })),
  })).digest('hex');
}

export function mergeOfficialMatches(matches: ConsensusMatch[], officialMatches: OfficialMatch[]): ConsensusMatch[] {
  return matches.map((match) => {
    const official = officialMatches.find((item) => item.matchNumber === match.matchNumber);
    return official ? omitUndefined({ ...match, homeTeam: official.homeTeam, awayTeam: official.awayTeam, publicDistribution: official.distribution, odds: official.odds, xStats: official.xStats ?? match.xStats }) : match;
  });
}

export function buildOfficialOnlyRound(coupon: OfficialCoupon, checkedAt: string): Record<string, unknown> {
  const matches: ConsensusMatch[] = coupon.matches.map((match) => ({
    matchNumber: match.matchNumber,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    ballots: [],
    support: { '1': 0, X: 0, '2': 0 },
    classification: 'coverage',
    systemTip: '1X2',
    publicDistribution: match.distribution,
    odds: match.odds,
    xStats: match.xStats,
  }));
  return omitUndefined({
    roundDate: coupon.roundDate,
    updatedAt: checkedAt,
    status: 'partial',
    officialOnly: true,
    matches,
    sources: { svenskaspel: { status: 'OK', updatedAt: checkedAt, lastSuccessfulUpdate: checkedAt, count: 13 } },
    expertCount: 0,
    systemRows: 0,
    publicDistribution: null,
    officialRoundId: coupon.officialRoundId,
    drawNumber: coupon.drawNumber,
    regCloseTime: coupon.regCloseTime,
    officialMatches: coupon.matches,
    officialFingerprint: officialCouponFingerprint(coupon),
    officialUpdatedAt: coupon.updatedAt,
    officialCheckedAt: checkedAt,
    xStatsCoverage: coupon.matches.filter((match) => match.xStats).length,
    sourceUrl: coupon.sourceUrl,
    discoveredAt: checkedAt,
  });
}

export function planOfficialCoupon(existing: Record<string, unknown> | undefined, coupon: OfficialCoupon, checkedAt: string): OfficialCouponPlan {
  const previousOfficialMatches = Array.isArray(existing?.officialMatches) ? existing.officialMatches as OfficialMatch[] : [];
  const effectiveCoupon = { ...coupon, matches: coupon.matches.map((match) => {
    const previous = previousOfficialMatches.find((item) => item.matchNumber === match.matchNumber && item.xStatsMatchId === match.xStatsMatchId);
    return match.xStats || !previous?.xStats ? match : { ...match, xStats: previous.xStats };
  }) };
  const fingerprint = officialCouponFingerprint(effectiveCoupon);
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
      officialMatches: effectiveCoupon.matches,
      officialFingerprint: fingerprint,
      officialUpdatedAt: coupon.updatedAt,
      officialCheckedAt: checkedAt,
      sourceUrl: coupon.sourceUrl,
      xStatsCoverage: effectiveCoupon.matches.filter((match) => match.xStats).length,
      ...(existingMatches ? { matches: mergeOfficialMatches(existingMatches, effectiveCoupon.matches) } : {}),
      ...(!existing ? { discoveredAt: checkedAt } : {}),
    }),
  };
}
