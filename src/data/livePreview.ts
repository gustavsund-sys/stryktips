import type { ClaimRound, FootballStandings, LeagueTable, LiveStatus, Round, Sign, Tip } from '../types';

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

const premierLeague = ['Arsenal', 'Aston Villa', 'Bournemouth', 'Brentford', 'Brighton', 'Burnley', 'Chelsea', 'Crystal Palace', 'Everton', 'Fulham', 'Leeds', 'Liverpool', 'Manchester City', 'Manchester United', 'Newcastle', 'Nottingham Forest', 'Sunderland', 'Tottenham', 'West Ham', 'Wolverhampton'];
const championship = ['Birmingham', 'Blackburn', 'Bristol City', 'Charlton', 'Coventry', 'Derby', 'Hull', 'Ipswich', 'Leicester', 'Middlesbrough', 'Millwall', 'Norwich', 'Oxford United', 'Portsmouth', 'Preston', 'Queens Park Rangers', 'Sheffield United', 'Sheffield Wednesday', 'Southampton', 'Stoke', 'Swansea', 'Watford', 'West Bromwich', 'Wrexham'];

function previewLeague(code: 'PL' | 'ELC', name: string, teams: string[], now: Date): LeagueTable {
  return { code, name, season: '2026', currentMatchday: 4, updatedAt: now.toISOString(), table: teams.map((team, index) => { const playedGames = 4; const won = Math.max(0, 3 - Math.floor(index / 6)); const draw = index % 3 === 0 ? 1 : 0; const lost = playedGames - won - draw; const goalsFor = Math.max(2, 10 - Math.floor(index / 3)); const goalsAgainst = 2 + Math.floor(index / 4); return { position: index + 1, team: { id: (code === 'PL' ? 100 : 200) + index, name: team, shortName: team, tla: team.slice(0, 3).toUpperCase() }, playedGames, won, draw, lost, points: won * 3 + draw, goalsFor, goalsAgainst, goalDifference: goalsFor - goalsAgainst }; }) };
}

export function buildStandingsPreview(now = new Date()): FootballStandings {
  return { source: 'football-data.org', sourceUrl: 'https://www.football-data.org/', updatedAt: now.toISOString(), leagues: { PL: previewLeague('PL', 'Premier League', premierLeague, now), ELC: previewLeague('ELC', 'Championship', championship, now) } };
}
