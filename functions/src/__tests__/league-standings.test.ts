import { describe, expect, it } from 'vitest';
import { parseLeagueMatches, parseLeagueTable } from '../league-standings';

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

  it('använder API-ordningen när placeringsnummer saknas', () => {
    const withoutPositions = payload(); withoutPositions.standings[0].table.forEach((entry) => { entry.position = undefined as unknown as number; });
    const result = parseLeagueTable(withoutPositions, 'PL');
    expect(result.table.map((entry) => entry.position)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
  });

  it('validerar och normaliserar föregående omgångs resultat', () => {
    const matches = parseLeagueMatches({ competition: { code: 'PL' }, matches: [{ id: 44, utcDate: '2026-08-30T15:30:00Z', status: 'FINISHED', matchday: 3, homeTeam: { id: 1, name: 'Hemma FC', shortName: 'Hemma' }, awayTeam: { id: 2, name: 'Borta FC', shortName: 'Borta' }, score: { fullTime: { home: 2, away: 1 } } }] }, 'PL', 3);
    expect(matches).toEqual([expect.objectContaining({ id: 44, matchday: 3, score: { home: 2, away: 1 } })]);
  });

  it('avvisar resultat från fel eller ofullständig omgång', () => {
    expect(() => parseLeagueMatches({ competition: { code: 'ELC' }, matches: [] }, 'PL', 3)).toThrow('MATCHES_COMPETITION_MISMATCH_PL');
    expect(() => parseLeagueMatches({ competition: { code: 'PL' }, matches: [] }, 'PL', 3)).toThrow('MATCHES_INCOMPLETE_PL');
  });

  it('ignorerar ej färdigspelade matcher i en omgång', () => {
    const result = parseLeagueMatches({ competition: { code: 'PL' }, matches: [{ id: 1, utcDate: '2026-09-12T14:00:00Z', status: 'SCHEDULED', matchday: 4, homeTeam: { id: 1, name: 'Hemma' }, awayTeam: { id: 2, name: 'Borta' }, score: { fullTime: { home: null, away: null } } }, { id: 2, utcDate: '2026-09-12T16:00:00Z', status: 'FINISHED', matchday: 4, homeTeam: { id: 3, name: 'Hemmalag' }, awayTeam: { id: 4, name: 'Bortalag' }, score: { fullTime: { home: 1, away: 0 } } }] }, 'PL', 4);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });
});
