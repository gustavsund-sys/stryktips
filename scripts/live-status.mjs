export const LIVE_API_BASE = 'https://api.spela.svenskaspel.se/draw/1/stryktipset/draws';

const firestoreInteger = (document, field) => {
  const value = Number(document?.fields?.[field]?.integerValue);
  return Number.isInteger(value) && value > 0 ? value : undefined;
};
const drawNumberFromId = (document) => {
  const value = Number(String(document?.fields?.officialRoundId?.stringValue ?? '').match(/^draw-(\d+)$/)?.[1]);
  return Number.isInteger(value) && value > 0 ? value : undefined;
};

export function resolveDrawNumber(current, archived) {
  const value = firestoreInteger(current, 'drawNumber')
    ?? drawNumberFromId(current)
    ?? firestoreInteger(archived, 'drawNumber')
    ?? drawNumberFromId(archived);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

const signFor = (home, away) => home > away ? '1' : home === away ? 'X' : '2';

const statusText = (match) => `${match?.sportEventStatus ?? ''} ${match?.status ?? ''}`.toLowerCase();

export function normalizeMatchPhase(match, hasScore = false) {
  if (match?.cancelled) return 'Cancelled';
  const value = statusText(match);
  if (Number(match?.statusId) === 31 || /ended|finished|full.?time|slut|avslutad/.test(value)) return 'Ended';
  if (/not.?started|scheduled|inte start|ej start/.test(value)) return 'NotStarted';
  if (hasScore || /in.?progress|live|pågår|halv/.test(value)) return 'InProgress';
  return 'Unknown';
}

const phaseRank = (value) => ({ Unknown: 0, NotStarted: 1, InProgress: 2, Ended: 3, Cancelled: 3 })[value] ?? 0;

export function mergeLiveStatus(previous, next) {
  if (!previous || Number(previous.drawNumber) !== Number(next.drawNumber)) return next;
  const previousMatches = new Map((previous.matches ?? []).map((match) => [Number(match.matchNumber), match]));
  const matches = next.matches.map((match) => {
    const old = previousMatches.get(match.matchNumber);
    if (!old) return match;
    if (phaseRank(old.sportEventStatus) > phaseRank(match.sportEventStatus)) return { ...match, ...old };
    if (match.homeScore === undefined && old.homeScore !== undefined) return { ...match, homeScore: old.homeScore, awayScore: old.awayScore, currentSign: old.currentSign };
    return match;
  });
  const complete = matches.every((match) => ['Ended', 'Cancelled'].includes(match.sportEventStatus));
  const active = !complete && matches.some((match) => match.sportEventStatus === 'InProgress');
  const started = Boolean(next.started || matches.some((match) => ['InProgress', 'Ended', 'Cancelled'].includes(match.sportEventStatus)));
  const phase = complete ? 'complete' : active ? 'active' : started ? 'between' : 'scheduled';
  return { ...next, matches, complete, active, started, phase, pollRecommended: !complete && next.pollRecommended };
}

export function fromFirestoreValue(value) {
  if (!value) return undefined;
  if ('nullValue' in value) return null;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('stringValue' in value) return value.stringValue;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(fromFirestoreValue);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([key, item]) => [key, fromFirestoreValue(item)]));
  return undefined;
}

export function fromFirestoreDocument(document) {
  return document?.fields ? Object.fromEntries(Object.entries(document.fields).map(([key, value]) => [key, fromFirestoreValue(value)])) : undefined;
}

export function parseLiveDraw(payload, now = new Date()) {
  const draw = payload?.draw;
  if (!draw || !Array.isArray(draw.drawEvents) || draw.drawEvents.length !== 13) throw new Error('LIVE_API_INVALID_DRAW');
  const matches = draw.drawEvents.map((event) => {
    const match = event.match ?? {};
    const results = Array.isArray(match.result) ? match.result : [];
    const resultType = (item) => item?.sportEventResultType ?? item?.type;
    const hasScore = (item) => Number.isFinite(Number(item?.home)) && Number.isFinite(Number(item?.away));
    // Svenska Spel currently exposes the textual kind in sportEventResultType
    // (while type is a numeric id). Keep the old field as a fallback.
    const score = results.find((item) => resultType(item) === 'Current' && hasScore(item))
      ?? results.find((item) => resultType(item) === 'Fulltime' && hasScore(item));
    const homeScore = score ? Number(score.home) : undefined;
    const awayScore = score ? Number(score.away) : undefined;
    const sportEventStatus = normalizeMatchPhase({ ...match, cancelled: event.cancelled }, homeScore !== undefined);
    return {
      matchNumber: Number(event.eventNumber),
      homeTeam: match.participants?.find((participant) => participant.type === 'home')?.name ?? event.eventDescription?.split(' - ')[0] ?? '',
      awayTeam: match.participants?.find((participant) => participant.type === 'away')?.name ?? event.eventDescription?.split(' - ')[1] ?? '',
      matchStart: String(match.matchStart ?? ''), status: String(match.status ?? ''), statusId: Number(match.statusId ?? 0),
      sportEventStatus, cancelled: Boolean(event.cancelled),
      ...(homeScore === undefined ? {} : { homeScore, awayScore, currentSign: signFor(homeScore, awayScore) }),
    };
  }).sort((a, b) => a.matchNumber - b.matchNumber);
  const starts = matches.map((match) => Date.parse(match.matchStart)).filter(Number.isFinite);
  if (!starts.length) throw new Error('LIVE_API_MISSING_START');
  if (new Set(matches.map((match) => match.matchNumber)).size !== 13 || matches.some((match) => !Number.isInteger(match.matchNumber) || match.matchNumber < 1 || match.matchNumber > 13 || !match.homeTeam || !match.awayTeam)) throw new Error('LIVE_API_INVALID_MATCHES');
  const firstStart = Math.min(...starts); const started = matches.some((match) => ['InProgress','Ended','Cancelled'].includes(match.sportEventStatus)) || now.getTime() >= firstStart;
  const complete = matches.every((match) => ['Ended','Cancelled'].includes(match.sportEventStatus));
  const phase = complete ? 'complete' : matches.some((match) => match.sportEventStatus === 'InProgress') ? 'active' : started ? 'between' : 'scheduled';
  const pollRecommended = !complete && now.getTime() >= firstStart - 15 * 60_000;
  return { roundDate: String(draw.regCloseTime).slice(0, 10), drawNumber: Number(draw.drawNumber), updatedAt: now.toISOString(), lastAttemptAt: now.toISOString(), lastSuccessAt: now.toISOString(), nextExpectedUpdateAt: new Date(now.getTime() + (pollRecommended ? 5 : 60) * 60_000).toISOString(), consecutiveFailures: 0, schemaVersion: 2, phase, pollRecommended, started, active: phase === 'active', complete, matches };
}

export function toFirestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toFirestoreValue(item)])) } };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  return { stringValue: String(value) };
}
