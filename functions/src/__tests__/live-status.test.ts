import { describe, expect, it } from 'vitest';
import { mergeLiveStatus, parseLiveDraw, shouldFetchLive, type LiveStatus } from '../live-status';

const event = (eventNumber: number, status = 'Inte startat', result: unknown[] = []) => ({ eventNumber, cancelled: false, match: { matchStart: '2026-09-05T16:00:00+02:00', status, statusId: status === 'Slut' ? 31 : 0, sportEventStatus: status === 'Slut' ? 'Ended' : status === 'Inte startat' ? 'NotStarted' : 'InProgress', participants: [{ type: 'home', name: `H${eventNumber}` }, { type: 'away', name: `B${eventNumber}` }], result } });
const payload = (events = Array.from({ length: 13 }, (_, index) => event(index + 1))) => ({ draw: { drawNumber: 4969, regCloseTime: '2026-09-05T15:59:00+02:00', drawEvents: events } });

describe('Firebase live status', () => {
  it('startar polling en timme före första match', () => {
    expect(parseLiveDraw(payload(), new Date('2026-09-05T12:59:59Z')).pollRecommended).toBe(false);
    expect(parseLiveDraw(payload(), new Date('2026-09-05T13:00:00Z')).pollRecommended).toBe(true);
  });

  it('hämtar ny omgång en gång men hoppar över väntetiden därefter', () => {
    const round = { roundDate: '2026-09-05', drawNumber: 4969 };
    expect(shouldFetchLive(round, undefined, new Date('2026-09-04T10:00:00Z'))).toBe(true);
    const live = parseLiveDraw(payload(), new Date('2026-09-04T10:00:00Z'));
    expect(shouldFetchLive(round, live, new Date('2026-09-04T10:05:00Z'))).toBe(false);
    expect(shouldFetchLive(round, live, new Date('2026-09-05T13:00:00Z'))).toBe(true);
  });

  it('hämtar var femte minut före start och varje minut när spel pågår', () => {
    const round = { roundDate: '2026-09-05', drawNumber: 4969 };
    const prepared = parseLiveDraw(payload(), new Date('2026-09-05T13:00:00Z'));
    expect(shouldFetchLive(round, prepared, new Date('2026-09-05T13:04:00Z'))).toBe(false);
    expect(shouldFetchLive(round, prepared, new Date('2026-09-05T13:05:00Z'))).toBe(true);
    const events = Array.from({ length: 13 }, (_, index) => event(index + 1));
    events[0] = event(1, 'Pågår', [{ sportEventResultType: 'Current', home: 0, away: 0 }]);
    const active = parseLiveDraw(payload(events), new Date('2026-09-05T14:00:00Z'));
    expect(shouldFetchLive(round, active, new Date('2026-09-05T14:00:30Z'))).toBe(false);
    expect(shouldFetchLive(round, active, new Date('2026-09-05T14:01:00Z'))).toBe(true);
  });

  it('låter inte ett avslutat resultat gå bakåt', () => {
    const ended = Array.from({ length: 13 }, (_, index) => event(index + 1, 'Slut', [{ sportEventResultType: 'Fulltime', home: 2, away: 1 }]));
    const previous = parseLiveDraw(payload(ended), new Date('2026-09-05T20:00:00Z'));
    const merged = mergeLiveStatus(previous, parseLiveDraw(payload(), new Date('2026-09-05T20:05:00Z')));
    expect(merged.complete).toBe(true);
    expect(merged.matches[0]).toMatchObject({ homeScore: 2, awayScore: 1, sportEventStatus: 'Ended' });
  });

  it('hoppar över en redan avslutad omgång', () => {
    const live = { ...parseLiveDraw(payload(), new Date('2026-09-05T13:00:00Z')), complete: true } as LiveStatus;
    expect(shouldFetchLive({ roundDate: live.roundDate, drawNumber: live.drawNumber }, live, new Date('2026-09-05T21:00:00Z'))).toBe(false);
  });
});
