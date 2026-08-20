import { describe, expect, it } from 'vitest';
import { buildConsensus, calculateRows, limitSystemRows } from '../consensus/engine';
import { parseBettingstugan } from '../scrapers/bettingstugan';
import { parseRekatochklart } from '../scrapers/rekatochklart';
import { readFileSync } from 'node:fs'; import { join } from 'node:path';
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
describe('konsensusmotor', () => {
  const matches = buildConsensus([...parseRekatochklart(fixture('rekatochklart.html'), 'rk'), ...parseBettingstugan(fixture('bettingstugan.html'), 'bs')]);
  it('räknar stöd per tecken', () => { expect(matches[1].support).toEqual({ '1': 0, X: 1, '2': 2 }); });
  it('hittar en stark spik', () => { expect(matches[3]).toMatchObject({ classification: 'strong', consensusSign: '1', systemTip: '1' }); });
  it('skapar ett deterministiskt system', () => { expect(calculateRows(matches)).toBeGreaterThan(0); expect(matches).toHaveLength(13); });
  it('begränsar systemet till gruppens budget på 300 rader', () => {
    const large = matches.map((match) => ({ ...match, systemTip: '1X2' as const }));
    const limited = limitSystemRows(large, 300);
    expect(calculateRows(limited)).toBeLessThanOrEqual(300);
    expect(limited).toHaveLength(13);
    expect(limited.every((match) => match.systemTip.length >= 1)).toBe(true);
  });
});
