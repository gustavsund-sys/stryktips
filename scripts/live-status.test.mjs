import assert from 'node:assert/strict';
import test from 'node:test';
import { parseLiveDraw } from './live-status.mjs';

const event = (eventNumber, status, result = []) => ({ eventNumber, cancelled: false, match: { matchStart: '2026-08-22T16:00:00+02:00', status, statusId: status === 'Slut' ? 31 : 0, sportEventStatus: status === 'Slut' ? 'Ended' : status === 'Inte startat' ? 'NotStarted' : 'InProgress', participants: [{ type: 'home', name: `H${eventNumber}` }, { type: 'away', name: `B${eventNumber}` }], result } });
const payload = (events) => ({ draw: { drawNumber: 99, regCloseTime: '2026-08-22T15:59:00+02:00', drawEvents: events } });

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
