import type { Firestore } from 'firebase-admin/firestore';

export const FOOTBALL_DATA_API = 'https://api.football-data.org/v4/competitions';
export const LEAGUE_CODES = ['PL', 'ELC'] as const;
export type LeagueCode = typeof LEAGUE_CODES[number];

export type LeagueTableEntry = {
  position: number;
  team: { id: number; name: string; shortName: string; tla: string; crest?: string };
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
};

export type LeagueTable = {
  code: LeagueCode;
  name: string;
  emblem?: string;
  season: string;
  currentMatchday?: number;
  updatedAt: string;
  table: LeagueTableEntry[];
};

type UnknownRecord = Record<string, any>;

const number = (value: unknown, field: string): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`STANDINGS_INVALID_${field}`);
  return parsed;
};

const fallbackTeamId = (code: LeagueCode, name: string): number => Array.from(`${code}:${name.toLowerCase()}`).reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 2166136261);

export function parseLeagueTable(payload: UnknownRecord, expectedCode: LeagueCode, now = new Date()): LeagueTable {
  if (payload?.competition?.code !== expectedCode) throw new Error(`STANDINGS_COMPETITION_MISMATCH_${expectedCode}`);
  const total = payload?.standings?.find((standing: UnknownRecord) => standing?.type === 'TOTAL');
  if (!Array.isArray(total?.table) || total.table.length < 10) throw new Error(`STANDINGS_INCOMPLETE_${expectedCode}`);
  const table = total.table.map((entry: UnknownRecord, index: number): LeagueTableEntry => {
    if (!entry?.team?.name) throw new Error(`STANDINGS_INVALID_TEAM_${expectedCode}`);
    const teamName = String(entry.team.name);
    const suppliedTeamId = Number(entry.team.id);
    const suppliedPosition = Number(entry.position);
    return {
      position: Number.isInteger(suppliedPosition) && suppliedPosition > 0 ? suppliedPosition : index + 1,
      team: { id: Number.isInteger(suppliedTeamId) && suppliedTeamId > 0 ? suppliedTeamId : fallbackTeamId(expectedCode, teamName), name: teamName, shortName: String(entry.team.shortName ?? entry.team.name), tla: String(entry.team.tla ?? ''), ...(entry.team.crest ? { crest: String(entry.team.crest) } : {}) },
      playedGames: number(entry.playedGames, 'PLAYED'), won: number(entry.won, 'WON'), draw: number(entry.draw, 'DRAW'), lost: number(entry.lost, 'LOST'), points: number(entry.points, 'POINTS'), goalsFor: number(entry.goalsFor, 'GOALS_FOR'), goalsAgainst: number(entry.goalsAgainst, 'GOALS_AGAINST'), goalDifference: number(entry.goalDifference, 'GOAL_DIFFERENCE'),
    };
  }).sort((a: LeagueTableEntry, b: LeagueTableEntry) => a.position - b.position);
  if (new Set(table.map((entry: LeagueTableEntry) => entry.position)).size !== table.length) throw new Error(`STANDINGS_DUPLICATE_POSITIONS_${expectedCode}`);
  if (new Set(table.map((entry: LeagueTableEntry) => entry.team.name.toLowerCase())).size !== table.length) throw new Error(`STANDINGS_DUPLICATE_TEAMS_${expectedCode}`);
  return { code: expectedCode, name: String(payload.competition.name), ...(payload.competition.emblem ? { emblem: String(payload.competition.emblem) } : {}), season: String(payload.season?.startDate ?? '').slice(0, 4), ...(Number.isFinite(Number(payload.season?.currentMatchday)) ? { currentMatchday: Number(payload.season.currentMatchday) } : {}), updatedAt: now.toISOString(), table };
}

async function fetchWithRetry(url: string, apiKey: string, attempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, { headers: { accept: 'application/json', 'X-Auth-Token': apiKey }, signal: AbortSignal.timeout(12_000) });
      if (!response.ok) throw new Error(`STANDINGS_HTTP_${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw lastError;
}

export async function updateLeagueStandings(db: Firestore, apiKey: string, now = new Date()): Promise<{ updated: LeagueCode[]; preserved: LeagueCode[] }> {
  if (!apiKey) throw new Error('FOOTBALL_DATA_API_KEY_MISSING');
  const ref = db.doc('footballStandings/current');
  const previousSnapshot = await ref.get();
  const previous = previousSnapshot.data() as UnknownRecord | undefined;
  const results = await Promise.allSettled(LEAGUE_CODES.map(async (code) => {
    const response = await fetchWithRetry(`${FOOTBALL_DATA_API}/${code}/standings`, apiKey);
    return parseLeagueTable(await response.json() as UnknownRecord, code, now);
  }));
  const leagues: UnknownRecord = { ...(previous?.leagues ?? {}) };
  const updated: LeagueCode[] = [];
  const preserved: LeagueCode[] = [];
  results.forEach((result, index) => {
    const code = LEAGUE_CODES[index];
    if (result.status === 'fulfilled') { leagues[code] = result.value; updated.push(code); }
    else if (leagues[code]) preserved.push(code);
  });
  if (!updated.length) throw new Error(`STANDINGS_ALL_FAILED: ${results.map((result) => result.status === 'rejected' ? String(result.reason) : '').join(', ')}`);
  await ref.set({ source: 'football-data.org', sourceUrl: 'https://www.football-data.org/', updatedAt: now.toISOString(), leagues });
  return { updated, preserved };
}
