import type { ConsensusMatch, ExpertStat, ExpertStatsDocument, OfficialResult } from '../types';

export const SVENSKA_SPEL_RESULTS_URL = 'https://api.spela.svenskaspel.se/draw/1/stryktipset/draws/result';

export function parseOfficialResult(value: unknown): OfficialResult {
  const result = (value as { result?: Record<string, unknown> })?.result;
  const events = result?.events;
  if (!result || !Array.isArray(events) || events.length !== 13) throw new Error('RESULT_NOT_COMPLETE');
  const ordered = [...events].sort((a, b) => Number((a as { eventNumber?: number }).eventNumber) - Number((b as { eventNumber?: number }).eventNumber));
  const outcomes = ordered.map((event, index) => {
    const item = event as { eventNumber?: number; outcome?: string };
    if (item.eventNumber !== index + 1 || !['1', 'X', '2'].includes(item.outcome ?? '')) throw new Error('RESULT_NOT_COMPLETE');
    return item.outcome as '1' | 'X' | '2';
  });
  const close = result.regCloseTime;
  if (typeof close !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(close)) throw new Error('RESULT_DATE_MISSING');
  return { roundDate: close.slice(0, 10), drawNumber: Number(result.drawNumber), outcomes };
}

export function addRoundToStats(previous: ExpertStatsDocument | undefined, matches: ConsensusMatch[], result: OfficialResult, now: string): ExpertStatsDocument {
  const stats = new Map((previous?.experts ?? []).map((expert) => [expert.expertId, { ...expert }]));
  for (const match of matches) {
    const outcome = result.outcomes[match.matchNumber - 1];
    for (const ballot of match.ballots) {
      const current = stats.get(ballot.expertId) ?? { expertId: ballot.expertId, expert: ballot.expert, source: ballot.source, rounds: 0, matches: 0, coveredHits: 0, precisionPoints: 0, singlePicks: 0, singleHits: 0 };
      current.matches += 1;
      if (ballot.tip.includes(outcome)) { current.coveredHits += 1; current.precisionPoints += 1 / ballot.tip.length; }
      if (ballot.tip.length === 1) { current.singlePicks += 1; if (ballot.tip === outcome) current.singleHits += 1; }
      stats.set(ballot.expertId, current);
    }
  }
  for (const expert of stats.values()) if (matches.some((match) => match.ballots.some((ballot) => ballot.expertId === expert.expertId))) expert.rounds += 1;
  return { updatedAt: now, settledRounds: (previous?.settledRounds ?? 0) + 1, lastRoundDate: result.roundDate, experts: [...stats.values()].sort((a, b) => b.precisionPoints / b.matches - a.precisionPoints / a.matches || a.expert.localeCompare(b.expert, 'sv')) };
}
