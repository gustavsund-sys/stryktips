import { describe, expect, it, vi } from 'vitest';
import { enrichCouponWithXStats, parsePlaymakerXStats } from '../scrapers/playmaker';
import type { OfficialCoupon } from '../types';

const payload = { id: '72221230', entireSeason: { homeTeam: 'Tottenham', awayTeam: 'Newcastle', metrics: [
  { metricName: 'xp', home: 0.1, away: 0.7 },
  { metricName: 'xG', home: 0.48, away: 1.26 },
  { metricName: 'unknown', home: 99, away: 99 },
] } };

describe('PlaymakerAI xStats', () => {
  it('läser godkända mått från det verkliga widgetformatet', () => {
    const parsed = parsePlaymakerXStats(payload, '72221230', '2026-08-26T08:00:00Z');
    expect(parsed).toMatchObject({ matchId: '72221230', source: 'PlaymakerAI', entireSeason: { homeTeam: 'Tottenham', awayTeam: 'Newcastle', metrics: { xp: { home: 0.1, away: 0.7 }, xG: { home: 0.48, away: 1.26 } } } });
    expect(parsed.entireSeason?.metrics).not.toHaveProperty('unknown');
  });

  it('avvisar fel match-ID och svar utan användbara mått', () => {
    expect(() => parsePlaymakerXStats(payload, 'annat-id')).toThrow(/XSTATS_INVALID_ID/);
    expect(() => parsePlaymakerXStats({ id: '1', entireSeason: { homeTeam: 'A', awayTeam: 'B', metrics: [] } }, '1')).toThrow(/XSTATS_INCOMPLETE/);
  });

  it('berikar tillgängliga matcher utan att bonusdata blockerar kupongen', async () => {
    const coupon: OfficialCoupon = { roundDate: '2026-08-29', drawNumber: 4968, officialRoundId: 'draw-4968', regCloseTime: '2026-08-29T16:00:00+02:00', updatedAt: 'now', sourceUrl: 'api', matches: Array.from({ length: 13 }, (_, index) => ({ matchNumber: index + 1, homeTeam: `H${index}`, awayTeam: `B${index}`, distribution: { '1': 40, X: 30, '2': 30 }, ...(index === 0 ? { xStatsMatchId: '72221230' } : {}) })) };
    const fetcher = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch;
    const result = await enrichCouponWithXStats(coupon, fetcher);
    expect(result.count).toBe(1);
    expect(result.coupon.matches[0].xStats?.entireSeason?.metrics.xG).toEqual({ home: 0.48, away: 1.26 });
    expect(result.errors).toHaveLength(12);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
