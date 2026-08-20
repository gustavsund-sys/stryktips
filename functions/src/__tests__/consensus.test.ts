import { describe, expect, it } from 'vitest';
import { buildConsensus, calculateRows } from '../consensus/engine';
import { parseBettingstugan } from '../scrapers/bettingstugan';
import { parseRekatochklart } from '../scrapers/rekatochklart';
import { readFileSync } from 'node:fs'; import { join } from 'node:path';
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
describe('konsensusmotor', () => {
  const matches = buildConsensus([...parseRekatochklart(fixture('rekatochklart.html'), 'rk'), ...parseBettingstugan(fixture('bettingstugan.html'), 'bs')]);
  it('räknar stöd per tecken', () => { expect(matches[1].support).toEqual({ '1': 0, X: 1, '2': 2 }); });
  it('hittar en stark spik', () => { expect(matches[3]).toMatchObject({ classification: 'strong', consensusSign: '1', systemTip: '1' }); });
  it('skapar ett deterministiskt system', () => { expect(calculateRows(matches)).toBeGreaterThan(0); expect(matches).toHaveLength(13); });
});
