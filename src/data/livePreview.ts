import type { ClaimRound, LiveStatus, Round, Sign, Tip } from '../types';

const scores: Array<[number, number]> = [[2, 1], [0, 0], [1, 2], [3, 0], [1, 0], [0, 1]];

export function buildLivePreview(round: Round, now = new Date()): { live: LiveStatus; claim: ClaimRound } {
  const finalTips = (round.highChaparral?.tips ?? round.matches.map((match) => match.systemTip)) as Tip[];
  const start = now.getTime() - 75 * 60_000;
  const matches = round.matches.map((match, index) => {
    const ended = index < 4;
    const active = index >= 4 && index < 6;
    const score = scores[index];
    const currentSign: Sign | undefined = score ? score[0] > score[1] ? '1' : score[0] === score[1] ? 'X' : '2' : undefined;
    return {
      matchNumber: match.matchNumber,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      matchStart: new Date(start + Math.floor(index / 4) * 45 * 60_000).toISOString(),
      status: ended ? 'Slut' : active ? index === 4 ? '67 min' : 'Halvtid' : 'Inte startat',
      statusId: ended ? 31 : active ? 20 : 0,
      sportEventStatus: ended ? 'Ended' : active ? 'InProgress' : 'NotStarted',
      cancelled: false,
      ...(score ? { homeScore: score[0], awayScore: score[1], currentSign } : {}),
    };
  });
  const timestamp = now.toISOString();
  return {
    live: { roundDate: round.roundDate, drawNumber: 4969, updatedAt: timestamp, lastAttemptAt: timestamp, lastSuccessAt: timestamp, nextExpectedUpdateAt: new Date(now.getTime() + 60_000).toISOString(), consecutiveFailures: 0, schemaVersion: 3, phase: 'active', pollRecommended: true, started: true, active: true, complete: false, matches },
    claim: { roundDate: round.roundDate, drawNumber: 4969, status: 'locked', participant: 'Gustav', base: 'expert', originalTips: finalTips, finalTips, rows: finalTips.reduce((total, tip) => total * tip.length, 1), cost: finalTips.reduce((total, tip) => total * tip.length, 1) },
  };
}
