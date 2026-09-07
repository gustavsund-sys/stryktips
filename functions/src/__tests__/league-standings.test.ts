import { describe, expect, it } from 'vitest';
import { parseLeagueTable } from '../league-standings';

const payload = (code = 'PL') => ({ competition: { code, name: code === 'PL' ? 'Premier League' : 'Championship', emblem: 'https://example.com/emblem.png' }, season: { startDate: '2026-08-08', currentMatchday: 4 }, standings: [{ type: 'TOTAL', table: Array.from({ length: 20 }, (_, index) => ({ position: index + 1, team: { id: index + 100, name: `Lag ${index + 1}`, shortName: `Lag ${index + 1}`, tla: `L${index}` }, playedGames: 4, won: 2, draw: 1, lost: 1, points: 7, goalsFor: 6, goalsAgainst: 4, goalDifference: 2 })) }] });

describe('football-data.org-tabeller', () => {
  it('validerar och normaliserar en komplett tabell', () => {
    const result = parseLeagueTable(payload(), 'PL', new Date('2026-09-07T05:00:00Z'));
    expect(result).toMatchObject({ code: 'PL', name: 'Premier League', season: '2026', currentMatchday: 4 });
    expect(result.table).toHaveLength(20);
    expect(result.table[0]).toMatchObject({ position: 1, points: 7, goalDifference: 2 });
  });

  it('avvisar fel tävling och ofullständig data', () => {
    expect(() => parseLeagueTable(payload('ELC'), 'PL')).toThrow('STANDINGS_COMPETITION_MISMATCH_PL');
    const incomplete = payload(); incomplete.standings[0].table = incomplete.standings[0].table.slice(0, 5);
    expect(() => parseLeagueTable(incomplete, 'PL')).toThrow('STANDINGS_INCOMPLETE_PL');
  });

  it('skapar stabila lag-ID:n när leverantörens ID saknas', () => {
    const withoutIds = payload(); withoutIds.standings[0].table.forEach((entry) => { entry.team.id = undefined as unknown as number; });
    const first = parseLeagueTable(withoutIds, 'PL'); const second = parseLeagueTable(withoutIds, 'PL');
    expect(first.table.map((entry) => entry.team.id)).toEqual(second.table.map((entry) => entry.team.id));
    expect(new Set(first.table.map((entry) => entry.team.id)).size).toBe(20);
  });
});
