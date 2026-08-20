import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { calculateRows, buildConsensus } from './consensus/engine';
import { findCurrentArticle, fetchHtml } from './scrapers/fetch';
import { BETTINGSTUGAN_INDEX, parseBettingstugan } from './scrapers/bettingstugan';
import { REKATOCHKLART_INDEX, parseRekatochklart } from './scrapers/rekatochklart';
import { validatePicks } from './scrapers/parser';
import { parseSvenskaSpel, SVENSKA_SPEL_URL } from './scrapers/svenskaspel';
import { parseUnderstreckat, UNDERSTRECKAT_INDEX } from './scrapers/understreckat';
import { sameTeam } from './normalization/teams';
import { omitUndefined } from './persistence';
import { SIGNS, type ConsensusMatch, type ExpertPick, type OfficialCoupon, type RoundDocument, type SourceId, type SourceStatus } from './types';

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
initializeApp(serviceAccountJson ? { credential: cert(JSON.parse(serviceAccountJson)) } : undefined);
const db = getFirestore();

type Scraper = { id: SourceId; indexUrl: string; parse: (html: string, url: string) => ExpertPick[] };
const scrapers: Scraper[] = [
  { id: 'rekatochklart', indexUrl: REKATOCHKLART_INDEX, parse: parseRekatochklart },
  { id: 'bettingstugan', indexUrl: BETTINGSTUGAN_INDEX, parse: parseBettingstugan },
  { id: 'understreckat', indexUrl: UNDERSTRECKAT_INDEX, parse: parseUnderstreckat },
];

function stockholmDate(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

async function scrape(source: Scraper): Promise<ExpertPick[]> {
  const index = await fetchHtml(source.indexUrl); let articleUrl = source.indexUrl;
  try { articleUrl = findCurrentArticle(index, source.indexUrl); } catch { /* index may itself contain the coupon */ }
  const html = articleUrl === source.indexUrl ? index : await fetchHtml(articleUrl);
  const picks = source.parse(html, articleUrl); validatePicks(picks); return picks;
}

export async function updateCurrentRound(): Promise<{ published: boolean; roundDate: string }> {
  const now = new Date().toISOString(); const previousSnap = await db.doc('stryktipset/current').get();
  const previous = previousSnap.data() as RoundDocument | undefined;
  const [expertResults, officialResult] = await Promise.all([Promise.allSettled(scrapers.map(scrape)), fetchHtml(SVENSKA_SPEL_URL).then((html) => parseSvenskaSpel(html)).then((value) => ({ status: 'fulfilled' as const, value })).catch((reason) => ({ status: 'rejected' as const, reason }))]);
  const picks: ExpertPick[] = []; const statuses: Record<string, SourceStatus> = {};
  expertResults.forEach((result, index) => {
    const id = scrapers[index].id;
    if (result.status === 'fulfilled') { picks.push(...result.value); statuses[id] = { status: 'OK', updatedAt: now, lastSuccessfulUpdate: now, count: result.value.length }; }
    else { statuses[id] = { status: 'ERROR', updatedAt: now, lastSuccessfulUpdate: previous?.sources?.[id]?.lastSuccessfulUpdate, message: result.reason instanceof Error ? result.reason.message : String(result.reason) }; }
  });
  if (statuses.understreckat?.status === 'OK') {
    const corePicks = picks.filter((pick) => pick.source !== 'understreckat'); const extraPicks = picks.filter((pick) => pick.source === 'understreckat');
    const mismatch = extraPicks.find((pick) => { const core = corePicks.find((item) => item.matchNumber === pick.matchNumber); return !core || !sameTeam(core.homeTeam, pick.homeTeam) || !sameTeam(core.awayTeam, pick.awayTeam); });
    if (mismatch) { statuses.understreckat = { status:'ERROR', updatedAt:now, lastSuccessfulUpdate:previous?.sources?.understreckat?.lastSuccessfulUpdate, message:`Aktuell analys matchar inte kupongen (match ${mismatch.matchNumber})` }; picks.splice(0, picks.length, ...corePicks); }
  }
  const coreSourcesOk = (['rekatochklart','bettingstugan'] as const).every((source) => statuses[source]?.status === 'OK');
  if (!coreSourcesOk) {
    await db.collection('scrapeRuns').add({ at: now, statuses: omitUndefined(statuses), published: false, reason: 'Alla källor måste valideras före publicering', createdAt: FieldValue.serverTimestamp() });
    logger.warn('Scrape validerades inte; befintlig kupong behålls', statuses); return { published: false, roundDate: previous?.roundDate ?? stockholmDate() };
  }
  let matches = buildConsensus(picks); let officialCoupon: OfficialCoupon | undefined;
  if (officialResult.status === 'fulfilled') {
    try {
      officialCoupon = officialResult.value;
      matches = matches.map((match) => {
        const official = officialCoupon!.matches.find((item) => item.matchNumber === match.matchNumber);
        if (!official || !sameTeam(match.homeTeam, official.homeTeam) || !sameTeam(match.awayTeam, official.awayTeam)) throw new Error(`MATCH_MISMATCH: Svenska Spel match ${match.matchNumber}`);
        const expertDeviation = SIGNS.map((sign) => ({ sign, difference: Math.round(match.support[sign] / match.ballots.length * 100) - official.distribution[sign] })).sort((a, b) => b.difference - a.difference)[0];
        return { ...match, homeTeam: official.homeTeam, awayTeam: official.awayTeam, publicDistribution: official.distribution, odds: official.odds, expertDeviation: expertDeviation.difference >= Number(process.env.EXPERT_DEVIATION_THRESHOLD ?? 25) ? expertDeviation : undefined };
      });
      statuses.svenskaspel = { status: 'OK', updatedAt: now, lastSuccessfulUpdate: now, count: 13 };
    } catch (error) { statuses.svenskaspel = { status: 'ERROR', updatedAt: now, lastSuccessfulUpdate: previous?.sources?.svenskaspel?.lastSuccessfulUpdate, message: error instanceof Error ? error.message : String(error) }; }
  } else statuses.svenskaspel = { status: 'ERROR', updatedAt: now, lastSuccessfulUpdate: previous?.sources?.svenskaspel?.lastSuccessfulUpdate, message: officialResult.reason instanceof Error ? officialResult.reason.message : String(officialResult.reason) };
  if (statuses.svenskaspel.status === 'ERROR' && previous) matches = matches.map((match) => { const old = previous.matches.find((item) => item.matchNumber === match.matchNumber && sameTeam(item.homeTeam, match.homeTeam) && sameTeam(item.awayTeam, match.awayTeam)); return old?.publicDistribution ? { ...match, publicDistribution: old.publicDistribution, odds: old.odds, expertDeviation: old.expertDeviation } : match; });
  const roundDate = process.env.ROUND_DATE || officialCoupon?.roundDate || previous?.roundDate || stockholmDate();
  const document: RoundDocument = { roundDate, updatedAt: now, status: Object.values(statuses).every((source) => source.status === 'OK') ? 'ok' : 'partial', matches, sources: statuses, expertCount: new Set(picks.map((pick) => `${pick.source}:${pick.expert}`)).size, systemRows: calculateRows(matches), publicDistribution: null };
  const firestoreDocument = omitUndefined(document);
  const batch = db.batch(); batch.set(db.doc('stryktipset/current'), firestoreDocument); batch.set(db.doc(`rounds/${roundDate}`), firestoreDocument, { merge: true }); batch.set(db.collection('scrapeRuns').doc(), { at: now, statuses: omitUndefined(statuses), published: true, roundDate, createdAt: FieldValue.serverTimestamp() }); await batch.commit();
  logger.info('Kupong publicerad', { roundDate, matches: matches.length, experts: document.expertCount }); return { published: true, roundDate };
}

// Ett försiktigt grundschema. Funktionen avbryter utanför tisdag–lördag och efter konfigurerat spelstopp.
export const scheduledUpdate = onSchedule({ schedule: '0 */3 * * 2-6', timeZone: 'Europe/Stockholm', region: 'europe-west1', timeoutSeconds: 120, memory: '256MiB' }, async () => {
  const now = new Date(); const localHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', hour: '2-digit', hour12: false }).format(now));
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Stockholm', weekday: 'short' }).format(now);
  if (weekday === 'Sat' && localHour >= Number(process.env.SATURDAY_CUTOFF_HOUR ?? 16)) { logger.info('Efter spelstopp; ingen hämtning'); return; }
  await updateCurrentRound();
});

export const manualUpdate = onRequest({ region: 'europe-west1', invoker: 'private' }, async (_request, response) => {
  try { response.json(await updateCurrentRound()); } catch (error) { logger.error(error); response.status(500).json({ error: error instanceof Error ? error.message : 'Okänt fel' }); }
});
