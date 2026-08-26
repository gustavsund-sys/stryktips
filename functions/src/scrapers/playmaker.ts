import type { OfficialCoupon, XStatsData, XStatsMetricName, XStatsPeriod } from '../types';

export const PLAYMAKER_BASE_URL = 'https://widget.playmaker.ai';
const METRICS = new Set<XStatsMetricName>(['xp', 'points', 'xpPointsDiff', 'expectedTablePosition', 'tablePosition', 'xG', 'xGC', 'averageScored', 'averageConceded', 'averageScoredBetween', 'averageScoredHomeAndAway']);
type UnknownRecord = Record<string, any>;

function parsePeriod(value: unknown): XStatsPeriod | undefined {
  const period = value as UnknownRecord;
  if (!period || typeof period.homeTeam !== 'string' || typeof period.awayTeam !== 'string' || !Array.isArray(period.metrics)) return undefined;
  const metrics: XStatsPeriod['metrics'] = {};
  for (const item of period.metrics as UnknownRecord[]) {
    if (!METRICS.has(item.metricName) || !Number.isFinite(Number(item.home)) || !Number.isFinite(Number(item.away))) continue;
    metrics[item.metricName as XStatsMetricName] = { home: Number(item.home), away: Number(item.away) };
  }
  return Object.keys(metrics).length ? { homeTeam: period.homeTeam, awayTeam: period.awayTeam, metrics } : undefined;
}

export function parsePlaymakerXStats(payload: unknown, matchId: string, updatedAt = new Date().toISOString()): XStatsData {
  const data = payload as UnknownRecord;
  if (!data || String(data.id) !== matchId) throw new Error(`XSTATS_INVALID_ID: ${matchId}`);
  const entireSeason = parsePeriod(data.entireSeason);
  const lastFiveGames = parsePeriod(data.lastFiveGames);
  if (!entireSeason && !lastFiveGames) throw new Error(`XSTATS_INCOMPLETE: ${matchId}`);
  return { matchId, source: 'PlaymakerAI', sourceUrl: `${PLAYMAKER_BASE_URL}/x-stats-${matchId}.json`, updatedAt, entireSeason, lastFiveGames };
}

async function fetchOne(matchId: string, fetcher: typeof fetch): Promise<XStatsData> {
  const url = `${PLAYMAKER_BASE_URL}/x-stats-${matchId}.json`;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetcher(url, { headers: { accept: 'application/json', referer: 'https://spela.svenskaspel.se/' }, signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`XSTATS_HTTP_${response.status}: ${matchId}`);
      return parsePlaymakerXStats(await response.json(), matchId);
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError;
}

export async function enrichCouponWithXStats(coupon: OfficialCoupon, fetcher: typeof fetch = fetch): Promise<{ coupon: OfficialCoupon; count: number; errors: string[] }> {
  const results = await Promise.allSettled(coupon.matches.map(async (match) => match.xStatsMatchId ? fetchOne(match.xStatsMatchId, fetcher) : undefined));
  const errors: string[] = [];
  const matches = coupon.matches.map((match, index) => {
    const result = results[index];
    if (result.status === 'fulfilled' && result.value) return { ...match, xStats: result.value };
    if (!match.xStatsMatchId) errors.push(`match ${match.matchNumber}: provider-ID saknas`);
    else if (result.status === 'rejected') errors.push(`match ${match.matchNumber}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`);
    return match;
  });
  return { coupon: { ...coupon, matches }, count: matches.filter((match) => match.xStats).length, errors };
}
