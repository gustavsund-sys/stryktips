import assert from 'node:assert/strict';
import test from 'node:test';
import { fromFirestoreDocument, mergeLiveStatus, normalizeMatchPhase, parseLiveDraw, resolveDrawNumber, stockholmTime, toFirestoreValue } from './live-status.mjs';

const event = (eventNumber, status, result = []) => ({ eventNumber, cancelled: false, match: { matchStart: '2026-08-22T16:00:00+02:00', status, statusId: status === 'Slut' ? 31 : 0, sportEventStatus: status === 'Slut' ? 'Ended' : status === 'Inte startat' ? 'NotStarted' : 'InProgress', participants: [{ type: 'home', name: `H${eventNumber}` }, { type: 'away', name: `B${eventNumber}` }], result } });
const payload = (events) => ({ draw: { drawNumber: 99, regCloseTime: '2026-08-22T15:59:00+02:00', drawEvents: events } });

test('hittar omgångsnumret även när current har tappat fältet', () => {
  assert.equal(resolveDrawNumber({ fields: { officialRoundId: { stringValue: 'draw-4968' } } }), 4968);
  assert.equal(resolveDrawNumber({ fields: {} }, { fields: { drawNumber: { integerValue: '4968' } } }), 4968);
});

test('markerar kommande omgång före första avspark', () => {
  const live = parseLiveDraw(payload(Array.from({ length: 13 }, (_, i) => event(i + 1, 'Inte startat'))), new Date('2026-08-22T13:59:00Z'));
  assert.equal(live.started, false); assert.equal(live.active, false);
});

test('läser pågående resultat och räknar tecken', () => {
  const events = Array.from({ length: 13 }, (_, i) => event(i + 1, 'Inte startat'));
  events[0] = event(1, 'Pågår', [{ type: 9, sportEventResultType: 'Current', home: '2', away: '1' }]);
  const live = parseLiveDraw(payload(events), new Date('2026-08-22T14:10:00Z'));
  assert.equal(live.active, true); assert.equal(live.matches[0].currentSign, '1'); assert.equal(live.matches[0].homeScore, 2);
});

test('markerar omgången avslutad', () => {
  const events = Array.from({ length: 13 }, (_, i) => event(i + 1, 'Slut', [{ type: 2, sportEventResultType: 'Fulltime', home: '1', away: '1' }]));
  const live = parseLiveDraw(payload(events), new Date('2026-08-22T20:00:00Z'));
  assert.equal(live.complete, true); assert.equal(live.active, false);
});

test('föredrar aktuell ställning framför halvtidsresultat', () => {
  const events = Array.from({ length: 13 }, (_, i) => event(i + 1, 'Inte startat'));
  events[0] = event(1, 'Pågår', [
    { type: 1, sportEventResultType: 'Halftime', home: '0', away: '0' },
    { type: 9, sportEventResultType: 'Current', home: '1', away: '2' },
  ]);
  const live = parseLiveDraw(payload(events), new Date('2026-08-22T14:10:00Z'));
  assert.equal(live.matches[0].currentSign, '2');
});

test('normaliserar Svenska Spels statusvarianter', () => {
  assert.equal(normalizeMatchPhase({ status: 'Full time' }), 'Ended');
  assert.equal(normalizeMatchPhase({ sportEventStatus: 'Scheduled' }), 'NotStarted');
  assert.equal(normalizeMatchPhase({ status: 'Halvtid' }), 'InProgress');
  assert.equal(normalizeMatchPhase({ cancelled: true }), 'Cancelled');
});

test('låter inte en avslutad match eller ställning gå bakåt', () => {
  const endedEvents = Array.from({ length: 13 }, (_, i) => event(i + 1, 'Slut', [{ type: 2, sportEventResultType: 'Fulltime', home: '2', away: '0' }]));
  const previous = parseLiveDraw(payload(endedEvents), new Date('2026-08-22T20:00:00Z'));
  const regressed = parseLiveDraw(payload(Array.from({ length: 13 }, (_, i) => event(i + 1, 'Inte startat'))), new Date('2026-08-22T20:05:00Z'));
  const merged = mergeLiveStatus(previous, regressed);
  assert.equal(merged.complete, true);
  assert.equal(merged.phase, 'complete');
  assert.equal(merged.matches[0].sportEventStatus, 'Ended');
  assert.equal(merged.matches[0].homeScore, 2);
});

test('avvisar dubbla matchnummer', () => {
  const events = Array.from({ length: 13 }, (_, i) => event(i + 1, 'Inte startat'));
  events[12] = event(12, 'Inte startat');
  assert.throws(() => parseLiveDraw(payload(events)), /LIVE_API_INVALID_MATCHES/);
});

test('läser tillbaka Firestore-formatet utan dataförlust', () => {
  const value = { phase: 'active', consecutiveFailures: 2, active: true, matches: [{ matchNumber: 1 }] };
  const document = { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toFirestoreValue(item)])) };
  assert.deepEqual(fromFirestoreDocument(document), value);
});

test('startar tät livebevakning en timme före första match', () => {
  assert.equal(stockholmTime('2026-08-22', 15).toISOString(), '2026-08-22T13:00:00.000Z');
  assert.equal(stockholmTime('2026-12-05', 15).toISOString(), '2026-12-05T14:00:00.000Z');
  const events = Array.from({ length: 13 }, (_, i) => event(i + 1, 'Inte startat'));
  assert.equal(parseLiveDraw(payload(events), new Date('2026-08-22T12:59:59Z')).pollRecommended, false);
  assert.equal(parseLiveDraw(payload(events), new Date('2026-08-22T13:00:00Z')).pollRecommended, true);
});
