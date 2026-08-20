import { describe, expect, it } from 'vitest';
import { addRoundToStats, parseOfficialResult } from '../results/statistics';
import type { ConsensusMatch } from '../types';

describe('expertstatistik', () => {
  it('läser ett komplett officiellt resultat', () => {
    const result = parseOfficialResult({ result: { drawNumber: 42, regCloseTime: '2026-08-15T15:59:00+02:00', events: Array.from({ length: 13 }, (_, index) => ({ eventNumber: index + 1, outcome: index % 2 ? 'X' : '1' })) } });
    expect(result).toMatchObject({ roundDate: '2026-08-15', drawNumber: 42 });
    expect(result.outcomes).toHaveLength(13);
  });

  it('belönar precisa tips mer än breda garderingar', () => {
    const matches = [{ matchNumber: 1, ballots: [
      { expertId: 'a', expert: 'A', source: 'rekatochklart', sourceUrl: '', tip: '1' },
      { expertId: 'b', expert: 'B', source: 'bettingstugan', sourceUrl: '', tip: '1X2' },
    ] }] as ConsensusMatch[];
    const stats = addRoundToStats(undefined, matches, { roundDate: '2026-08-15', drawNumber: 42, outcomes: ['1','1','1','1','1','1','1','1','1','1','1','1','1'] }, 'now');
    expect(stats.experts.find((expert) => expert.expertId === 'a')?.precisionPoints).toBe(1);
    expect(stats.experts.find((expert) => expert.expertId === 'b')?.precisionPoints).toBeCloseTo(1 / 3);
  });
});
