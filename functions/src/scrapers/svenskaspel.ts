import type { BaseSign, OfficialCoupon, OfficialMatch } from '../types';

export const SVENSKA_SPEL_URL = 'https://spela.svenskaspel.se/stryktipset/systemspel/speltips';
const SIGNS: BaseSign[] = ['1', 'X', '2'];

type UnknownRecord = Record<string, any>;
function parseEmbeddedState(html: string): UnknownRecord {
  const marker = '_svs.tipsen.data.preloadedState='; const start = html.indexOf(marker);
  if (start < 0) throw new Error('PARSER_ERROR: Svenska Spels preloadedState saknas');
  const jsonStart = start + marker.length; const end = html.indexOf(';', jsonStart);
  if (end < 0) throw new Error('PARSER_ERROR: Svenska Spels JSON är ofullständig');
  try { return JSON.parse(html.slice(jsonStart, end)); } catch { throw new Error('PARSER_ERROR: Svenska Spels JSON kunde inte tolkas'); }
}

const triplet = (values: unknown[], label: string): Record<BaseSign, number> => {
  if (!Array.isArray(values) || values.length !== 3) throw new Error(`PARSER_ERROR: ${label} saknar 1/X/2`);
  const numbers = values.map(Number); if (numbers.some((value) => !Number.isFinite(value))) throw new Error(`PARSER_ERROR: ogiltig ${label}`);
  return Object.fromEntries(SIGNS.map((sign, index) => [sign, numbers[index]])) as Record<BaseSign, number>;
};

export function parseSvenskaSpel(html: string, sourceUrl = SVENSKA_SPEL_URL): OfficialCoupon {
  const state = parseEmbeddedState(html); const drawKey = state.Draws?.ids?.[0]; const draw = state.Draws?.entities?.[drawKey];
  if (!draw || draw.productId !== 1) throw new Error('PARSER_ERROR: aktuell Stryktipskupong saknas');
  const participants = state.Participants ?? {}; const sportEvents = state.SportEvents ?? {}; const statistics = state.EventTypeStatistic ?? {};
  const matches: OfficialMatch[] = draw.drawEvents.map((event: UnknownRecord) => {
    const sportEvent = sportEvents[event.matchId]; const participantIds = sportEvent?.participants;
    const homeTeam = participants[participantIds?.[0]]?.name; const awayTeam = participants[participantIds?.[1]]?.name;
    if (!homeTeam || !awayTeam) throw new Error(`PARSER_ERROR: lag saknas för match ${event.eventNumber}`);
    const statistic = statistics[`${event.matchId}_${event.eventTypeId}_${event.eventNumber}`];
    const distributionNode = statistic?.distributions?.['1']?.[String(draw.drawNumber)] ?? statistic?.distributions?.Global;
    const distribution = triplet(distributionNode?.current?.value, `streck för match ${event.eventNumber}`);
    if (Math.abs(Object.values(distribution).reduce((sum, value) => sum + value, 0) - 100) > 2) throw new Error(`PARSER_ERROR: strecksummering för match ${event.eventNumber}`);
    const odds = statistic?.odds?.current?.value ? triplet(statistic.odds.current.value, `odds för match ${event.eventNumber}`) : undefined;
    return { matchNumber: event.eventNumber, homeTeam, awayTeam, distribution, odds };
  });
  if (matches.length !== 13 || new Set(matches.map((match) => match.matchNumber)).size !== 13) throw new Error(`PARSER_ERROR: Svenska Spel gav ${matches.length}/13 matcher`);
  return { roundDate: String(draw.regCloseTime).slice(0, 10), drawNumber: draw.drawNumber, updatedAt: state.Draws.loaded?.[drawKey] ?? new Date().toISOString(), matches, sourceUrl };
}
