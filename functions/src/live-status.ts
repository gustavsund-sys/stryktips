import type { Firestore } from 'firebase-admin/firestore';

export const LIVE_API_BASE = 'https://api.spela.svenskaspel.se/draw/1/stryktipset/draws';

export type LiveMatch = {
  matchNumber: number;
  homeTeam: string;
  awayTeam: string;
  matchStart: string;
  status: string;
  statusId: number;
  sportEventStatus: 'Unknown' | 'NotStarted' | 'InProgress' | 'Ended' | 'Cancelled';
  cancelled: boolean;
  homeScore?: number;
  awayScore?: number;
  currentSign?: '1' | 'X' | '2';
};

export type LiveStatus = {
  roundDate: string;
  drawNumber: number;
  updatedAt: string;
  lastAttemptAt: string;
  lastSuccessAt: string;
  nextExpectedUpdateAt: string;
  consecutiveFailures: number;
  schemaVersion: number;
  phase: 'scheduled' | 'active' | 'between' | 'complete' | 'degraded';
  pollRecommended: boolean;
  started: boolean;
  active: boolean;
  complete: boolean;
  matches: LiveMatch[];
  lastError?: string;
};

type UnknownRecord = Record<string, any>;

const signFor = (home: number, away: number): '1' | 'X' | '2' => home > away ? '1' : home === away ? 'X' : '2';
const statusText = (match: UnknownRecord): string => `${match?.sportEventStatus ?? ''} ${match?.status ?? ''}`.toLowerCase();

export function normalizeMatchPhase(match: UnknownRecord, hasScore = false): LiveMatch['sportEventStatus'] {
  if (match?.cancelled) return 'Cancelled';
  const value = statusText(match);
  if (Number(match?.statusId) === 31 || /ended|finished|full.?time|slut|avslutad/.test(value)) return 'Ended';
  if (/not.?started|scheduled|inte start|ej start/.test(value)) return 'NotStarted';
  if (hasScore || /in.?progress|live|pågår|halv/.test(value)) return 'InProgress';
  return 'Unknown';
}

const phaseRank = (value: LiveMatch['sportEventStatus']): number => ({ Unknown: 0, NotStarted: 1, InProgress: 2, Ended: 3, Cancelled: 3 })[value];

export function mergeLiveStatus(previous: LiveStatus | undefined, next: LiveStatus): LiveStatus {
  if (!previous || Number(previous.drawNumber) !== Number(next.drawNumber)) return next;
  const previousMatches = new Map(previous.matches.map((match) => [match.matchNumber, match]));
  const matches = next.matches.map((match) => {
    const old = previousMatches.get(match.matchNumber);
    if (!old) return match;
    if (phaseRank(old.sportEventStatus) > phaseRank(match.sportEventStatus)) return { ...match, ...old };
    if (match.homeScore === undefined && old.homeScore !== undefined) return { ...match, homeScore: old.homeScore, awayScore: old.awayScore, currentSign: old.currentSign };
    return match;
  });
  const complete = matches.every((match) => ['Ended', 'Cancelled'].includes(match.sportEventStatus));
  const active = !complete && matches.some((match) => match.sportEventStatus === 'InProgress');
  const started = next.started || matches.some((match) => ['InProgress', 'Ended', 'Cancelled'].includes(match.sportEventStatus));
  const phase = complete ? 'complete' : active ? 'active' : started ? 'between' : 'scheduled';
  return { ...next, matches, complete, active, started, phase, pollRecommended: !complete && next.pollRecommended };
}

export function parseLiveDraw(payload: UnknownRecord, now = new Date()): LiveStatus {
  const draw = payload?.draw;
  if (!draw || !Array.isArray(draw.drawEvents) || draw.drawEvents.length !== 13) throw new Error('LIVE_API_INVALID_DRAW');
  const matches: LiveMatch[] = draw.drawEvents.map((event: UnknownRecord) => {
    const match = event.match ?? {};
    const results: UnknownRecord[] = Array.isArray(match.result) ? match.result : [];
    const resultType = (item: UnknownRecord) => item?.sportEventResultType ?? item?.type;
    const hasScore = (item: UnknownRecord) => Number.isFinite(Number(item?.home)) && Number.isFinite(Number(item?.away));
    const score = results.find((item) => resultType(item) === 'Current' && hasScore(item))
      ?? results.find((item) => resultType(item) === 'Fulltime' && hasScore(item));
    const homeScore = score ? Number(score.home) : undefined;
    const awayScore = score ? Number(score.away) : undefined;
    const sportEventStatus = normalizeMatchPhase({ ...match, cancelled: event.cancelled }, homeScore !== undefined);
    return {
      matchNumber: Number(event.eventNumber),
      homeTeam: match.participants?.find((participant: UnknownRecord) => participant.type === 'home')?.name ?? event.eventDescription?.split(' - ')[0] ?? '',
      awayTeam: match.participants?.find((participant: UnknownRecord) => participant.type === 'away')?.name ?? event.eventDescription?.split(' - ')[1] ?? '',
      matchStart: String(match.matchStart ?? ''), status: String(match.status ?? ''), statusId: Number(match.statusId ?? 0),
      sportEventStatus, cancelled: Boolean(event.cancelled),
      ...(homeScore === undefined ? {} : { homeScore, awayScore, currentSign: signFor(homeScore, awayScore!) }),
    };
  }).sort((a: LiveMatch, b: LiveMatch) => a.matchNumber - b.matchNumber);
  const starts = matches.map((match) => Date.parse(match.matchStart)).filter(Number.isFinite);
  if (!starts.length) throw new Error('LIVE_API_MISSING_START');
  if (new Set(matches.map((match) => match.matchNumber)).size !== 13 || matches.some((match) => !Number.isInteger(match.matchNumber) || match.matchNumber < 1 || match.matchNumber > 13 || !match.homeTeam || !match.awayTeam)) throw new Error('LIVE_API_INVALID_MATCHES');
  const firstStart = Math.min(...starts);
  const started = matches.some((match) => ['InProgress', 'Ended', 'Cancelled'].includes(match.sportEventStatus)) || now.getTime() >= firstStart;
  const complete = matches.every((match) => ['Ended', 'Cancelled'].includes(match.sportEventStatus));
  const phase = complete ? 'complete' : matches.some((match) => match.sportEventStatus === 'InProgress') ? 'active' : started ? 'between' : 'scheduled';
  const pollRecommended = !complete && now.getTime() >= firstStart - 60 * 60_000;
  const timestamp = now.toISOString();
  return { roundDate: String(draw.regCloseTime).slice(0, 10), drawNumber: Number(draw.drawNumber), updatedAt: timestamp, lastAttemptAt: timestamp, lastSuccessAt: timestamp, nextExpectedUpdateAt: new Date(now.getTime() + (pollRecommended ? 5 : 60) * 60_000).toISOString(), consecutiveFailures: 0, schemaVersion: 3, phase, pollRecommended, started, active: phase === 'active', complete, matches };
}

function stockholmDate(now: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function firstMatchStart(live?: LiveStatus): number | undefined {
  const starts = live?.matches?.map((match) => Date.parse(match.matchStart)).filter(Number.isFinite) ?? [];
  return starts.length ? Math.min(...starts) : undefined;
}

export function shouldFetchLive(round: UnknownRecord | undefined, previous: LiveStatus | undefined, now: Date): boolean {
  const drawNumber = Number(round?.drawNumber ?? String(round?.officialRoundId ?? '').match(/^draw-(\d+)$/)?.[1]);
  if (!Number.isInteger(drawNumber) || drawNumber <= 0) return false;
  if (!previous || previous.drawNumber !== drawNumber || previous.roundDate !== round?.roundDate) return true;
  if (previous.complete) return false;
  const firstStart = firstMatchStart(previous);
  if (round?.roundDate === stockholmDate(now) && firstStart !== undefined) {
    if (now.getTime() < firstStart - 60 * 60_000) return false;
    const lastAttempt = Date.parse(previous.lastAttemptAt ?? previous.lastSuccessAt ?? previous.updatedAt);
    const oneMinuteMode = previous.active || (!previous.started && now.getTime() >= firstStart);
    const minimumInterval = oneMinuteMode ? 55_000 : 4 * 60_000 + 30_000;
    return !Number.isFinite(lastAttempt) || now.getTime() - lastAttempt >= minimumInterval;
  }
  return previous.active || previous.started || previous.phase === 'between';
}

async function fetchWithRetry(url: string, attempts = 3): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
      if (!response.ok) throw new Error(`LIVE_API_HTTP_${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw lastError;
}

export type LiveRefreshResult = { outcome: 'skipped' | 'updated'; roundDate?: string; drawNumber?: number; phase?: string };

export async function refreshLiveStatus(db: Firestore, now = new Date()): Promise<LiveRefreshResult> {
  const roundSnapshot = await db.doc('stryktipset/current').get();
  const round = roundSnapshot.data();
  const liveRef = db.doc('liveStatus/current');
  const previousSnapshot = await liveRef.get();
  const previous = previousSnapshot.exists ? previousSnapshot.data() as LiveStatus : undefined;
  if (!shouldFetchLive(round, previous, now)) return { outcome: 'skipped', roundDate: round?.roundDate, drawNumber: round?.drawNumber, phase: previous?.phase };
  const drawNumber = Number(round?.drawNumber ?? String(round?.officialRoundId ?? '').match(/^draw-(\d+)$/)?.[1]);
  try {
    const response = await fetchWithRetry(`${LIVE_API_BASE}/${drawNumber}`);
    const parsed = parseLiveDraw(await response.json(), now);
    if (parsed.drawNumber !== drawNumber) throw new Error(`LIVE_DRAW_MISMATCH_${parsed.drawNumber}_${drawNumber}`);
    const live = mergeLiveStatus(previous, parsed);
    await liveRef.set(live);
    return { outcome: 'updated', roundDate: live.roundDate, drawNumber: live.drawNumber, phase: live.phase };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (previous) await liveRef.set({ phase: 'degraded', lastAttemptAt: now.toISOString(), consecutiveFailures: Number(previous.consecutiveFailures ?? 0) + 1, lastError: message, schemaVersion: 3 }, { merge: true });
    throw error;
  }
}
