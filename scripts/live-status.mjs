export const LIVE_API_BASE = 'https://api.spela.svenskaspel.se/draw/1/stryktipset/draws';

const signFor = (home, away) => home > away ? '1' : home === away ? 'X' : '2';

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
    return {
      matchNumber: Number(event.eventNumber),
      homeTeam: match.participants?.find((participant) => participant.type === 'home')?.name ?? event.eventDescription?.split(' - ')[0] ?? '',
      awayTeam: match.participants?.find((participant) => participant.type === 'away')?.name ?? event.eventDescription?.split(' - ')[1] ?? '',
      matchStart: String(match.matchStart ?? ''), status: String(match.status ?? ''), statusId: Number(match.statusId ?? 0),
      sportEventStatus: String(match.sportEventStatus ?? 'Unknown'), cancelled: Boolean(event.cancelled),
      ...(homeScore === undefined ? {} : { homeScore, awayScore, currentSign: signFor(homeScore, awayScore) }),
    };
  }).sort((a, b) => a.matchNumber - b.matchNumber);
  const starts = matches.map((match) => Date.parse(match.matchStart)).filter(Number.isFinite);
  if (!starts.length) throw new Error('LIVE_API_MISSING_START');
  const started = now.getTime() >= Math.min(...starts);
  const complete = matches.every((match) => match.cancelled || match.sportEventStatus === 'Ended');
  return { roundDate: String(draw.regCloseTime).slice(0, 10), drawNumber: Number(draw.drawNumber), updatedAt: now.toISOString(), started, active: started && !complete, complete, matches };
}

export function toFirestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toFirestoreValue(item)])) } };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  return { stringValue: String(value) };
}
