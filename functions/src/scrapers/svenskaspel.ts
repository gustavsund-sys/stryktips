import type { BaseSign, OfficialCoupon, OfficialMatch } from '../types';
import { createHash } from 'node:crypto';

export const SVENSKA_SPEL_API_URL = 'https://api.spela.svenskaspel.se/draw/1/stryktipset/draws';
const SIGNS: BaseSign[] = ['1', 'X', '2'];

type UnknownRecord = Record<string, any>;

export function buildOfficialRoundId(drawNumber: unknown, regCloseTime: string, matches: OfficialMatch[]): string {
  const numericDraw = Number(drawNumber);
  if (Number.isInteger(numericDraw) && numericDraw > 0) return `draw-${numericDraw}`;
  const identity = `${regCloseTime}|${matches.map((match) => `${match.matchNumber}:${match.homeTeam.trim().toLowerCase()}:${match.awayTeam.trim().toLowerCase()}`).join('|')}`;
  return `fallback-${createHash('sha256').update(identity).digest('hex').slice(0, 24)}`;
}
const localizedNumber = (value: unknown): number => Number(String(value).replace(',', '.'));

function apiTriplet(node: UnknownRecord | undefined, label: string): Record<BaseSign, number> {
  const numbers = [node?.one, node?.x, node?.two].map(localizedNumber);
  if (numbers.some((value) => !Number.isFinite(value))) throw new Error(`API_ERROR: ogiltig ${label}`);
  return Object.fromEntries(SIGNS.map((sign, index) => [sign, numbers[index]])) as Record<BaseSign, number>;
}

function optionalApiTriplet(node: UnknownRecord | undefined): Record<BaseSign, number> | undefined {
  if (!node) return undefined;
  const numbers = [node.one, node.x, node.two].map(localizedNumber);
  if (numbers.some((value) => !Number.isFinite(value) || value <= 0)) return undefined;
  return Object.fromEntries(SIGNS.map((sign, index) => [sign, numbers[index]])) as Record<BaseSign, number>;
}

export function parseSvenskaSpelApi(payload: unknown, sourceUrl = SVENSKA_SPEL_API_URL, now = new Date()): OfficialCoupon {
  const draws = (payload as UnknownRecord)?.draws;
  if (!Array.isArray(draws)) throw new Error('API_ERROR: Svenska Spels draws-lista saknas');
  const draw = draws
    .filter((item) => item?.productId === 1 && item?.drawState !== 'Closed')
    .sort((a: UnknownRecord, b: UnknownRecord) => Date.parse(String(a.regCloseTime)) - Date.parse(String(b.regCloseTime)))[0];
  if (!draw || !Array.isArray(draw.drawEvents)) throw new Error('API_ERROR: aktuell Stryktipsomgång saknas');
  const drawNumber = Number(draw.drawNumber);
  const regCloseTime = String(draw.regCloseTime ?? '');
  if (!Number.isInteger(drawNumber) || drawNumber <= 0) throw new Error('API_ERROR: drawNumber saknas');
  if (!regCloseTime || !Number.isFinite(Date.parse(regCloseTime))) throw new Error('API_ERROR: spelstopp saknas');
  const matches: OfficialMatch[] = draw.drawEvents.map((event: UnknownRecord) => {
    const participants = event.match?.participants;
    const homeTeam = participants?.find((item: UnknownRecord) => item.type === 'home')?.name;
    const awayTeam = participants?.find((item: UnknownRecord) => item.type === 'away')?.name;
    const matchNumber = Number(event.eventNumber);
    if (!Number.isInteger(matchNumber) || !homeTeam || !awayTeam) throw new Error(`API_ERROR: ofullständig match ${event.eventNumber ?? '?'}`);
    const distribution = apiTriplet(event.svenskaFolket, `streck för match ${matchNumber}`);
    if (Math.abs(Object.values(distribution).reduce((sum, value) => sum + value, 0) - 100) > 2) throw new Error(`API_ERROR: strecksummering för match ${matchNumber}`);
    const odds = optionalApiTriplet(event.odds);
    return { matchNumber, homeTeam: String(homeTeam), awayTeam: String(awayTeam), distribution, odds };
  }).sort((a: OfficialMatch, b: OfficialMatch) => a.matchNumber - b.matchNumber);
  if (matches.length !== 13 || new Set(matches.map((match) => match.matchNumber)).size !== 13) throw new Error(`API_ERROR: Svenska Spel gav ${matches.length}/13 matcher`);
  const updatedAt = draw.drawEvents.map((event: UnknownRecord) => event.svenskaFolket?.date).filter(Boolean).sort().at(-1) ?? now.toISOString();
  return { roundDate: regCloseTime.slice(0, 10), drawNumber, officialRoundId: buildOfficialRoundId(drawNumber, regCloseTime, matches), regCloseTime, updatedAt: String(updatedAt), matches, sourceUrl };
}

export async function fetchSvenskaSpelCoupon(fetcher: typeof fetch = fetch): Promise<OfficialCoupon> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetcher(SVENSKA_SPEL_API_URL, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`API_HTTP_${response.status}`);
      return parseSvenskaSpelApi(await response.json());
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw lastError;
}
