import { describe, expect, it } from 'vitest';
import { buildConsensus, buildHighChaparral, calculateRows, limitSystemRows } from '../consensus/engine';
import { parseBettingstugan } from '../scrapers/bettingstugan';
import { parseRekatochklart } from '../scrapers/rekatochklart';
import type { BaseSign } from '../types';
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
  it('bygger en offensiv High Chaparall-rad med expertstödda skrällar', () => {
    const priced = matches.map((match, index) => ({ ...match, odds: { '1': 1.8 + index / 10, X: 3.2 + index / 10, '2': 4.5 + index / 10 } }));
    const system = buildHighChaparral(priced, 300, 6);
    expect(system.tips).toHaveLength(13);
    expect(system.rows).toBe(288);
    expect(system.pivots.length).toBeGreaterThanOrEqual(6);
    expect(system.pivots.every((number) => priced[number - 1].classification !== 'strong')).toBe(true);
    expect(system.tips.every((tip, index) => [...tip].every((sign) => priced[index].support[sign as BaseSign] > 0))).toBe(true);
    expect(system.estimatedOdds).toBeGreaterThan(0);
  });
});
