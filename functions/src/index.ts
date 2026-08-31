import { cert, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { buildHighChaparral, calculateRows, buildConsensus, limitSystemRows } from './consensus/engine';
import { findCurrentArticle, fetchHtml, fetchLatestWordpressArticle } from './scrapers/fetch';
import { extractPicksWithAI } from './scrapers/ai-fallback';
import { BETTINGSTUGAN_INDEX, parseBettingstugan } from './scrapers/bettingstugan';
import { REKATOCHKLART_INDEX, parseRekatochklart } from './scrapers/rekatochklart';
import { validatePicks } from './scrapers/parser';
import { fetchSvenskaSpelCoupon } from './scrapers/svenskaspel';
import { enrichCouponWithXStats } from './scrapers/playmaker';
import { parseTipsmedoss, TIPSMEDOSS_API, TIPSMEDOSS_INDEX } from './scrapers/tipsmedoss';
import { parseTipper, TIPPER_INDEX } from './scrapers/tipper';
import { addTeamAlias, sameTeam } from './normalization/teams';
import { buildOfficialOnlyRound, officialCouponFingerprint, omitUndefined, planOfficialCoupon, preserveOfficialCoupon, registrationHasClosed } from './persistence';
import { addRoundToStats, parseOfficialResult, scoreCompetition, SVENSKA_SPEL_RESULTS_URL } from './results/statistics';
import { SIGNS, type ExpertPick, type ExpertStatsDocument, type OfficialCoupon, type RoundDocument, type SourceId, type SourceStatus } from './types';

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
initializeApp(serviceAccountJson ? { credential: cert(JSON.parse(serviceAccountJson)) } : undefined);
const db = getFirestore();

type Scraper = { id: SourceId; indexUrl: string; parse: (html: string, url: string) => ExpertPick[] };
const scrapers: Scraper[] = [
  { id: 'rekatochklart', indexUrl: REKATOCHKLART_INDEX, parse: parseRekatochklart },
  { id: 'bettingstugan', indexUrl: BETTINGSTUGAN_INDEX, parse: parseBettingstugan },
  { id: 'tipper', indexUrl: TIPPER_INDEX, parse: parseTipper },
  { id: 'tipsmedoss', indexUrl: TIPSMEDOSS_INDEX, parse: parseTipsmedoss },
];

export async function updateExpertStats(): Promise<{ settled: boolean; roundDate: string; status: 'settled' | 'already-settled' }> {
    const response = await fetch(SVENSKA_SPEL_RESULTS_URL, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`RESULT_HTTP_${response.status}`);
    const result = parseOfficialResult(await response.json());
    const roundRef = db.doc(`rounds/${result.roundDate}`); const statsRef = db.doc('expertStats/current'); const claimRef = db.doc(`claimRounds/${result.roundDate}`); const challengerQuery = db.collection('challengerTips').where('roundDate', '==', result.roundDate);
    const status = await db.runTransaction(async (transaction): Promise<'settled' | 'already-settled' | 'missing-round'> => {
      const [roundSnap, statsSnap, claimSnap, challengerSnaps] = await Promise.all([transaction.get(roundRef), transaction.get(statsRef), transaction.get(claimRef), transaction.get(challengerQuery)]);
      if (!roundSnap.exists) return 'missing-round';
      const roundData = roundSnap.data();
      if (roundData?.officialResult?.drawNumber === result.drawNumber) return 'already-settled';
      const round = roundData as RoundDocument;
      const now = new Date().toISOString();
      const stats = addRoundToStats(statsSnap.exists ? statsSnap.data() as ExpertStatsDocument : undefined, round.matches, result, now);
      transaction.set(roundRef, { officialResult: { ...result, settledAt: now } }, { merge: true });
      transaction.set(statsRef, stats);
      const claim = claimSnap.data();
      if (claimSnap.exists && claim?.status === 'locked' && Array.isArray(claim.finalTips)) {
        const privateChallengers = Object.fromEntries(challengerSnaps.docs.map((snapshot) => [snapshot.data().participant, snapshot.data()])); const competition = scoreCompetition(claim.finalTips, privateChallengers, result);
        transaction.set(claimRef, { status: 'settled', result: competition.sharpResult, challengers: competition.challengers, settledAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      return 'settled';
    });
    if (status === 'missing-round') throw new Error(`RESULT_ROUND_MISSING_${result.roundDate}`);
    return { settled: status === 'settled', roundDate: result.roundDate, status };
}

export async function prepareClaimRound(): Promise<{ created: boolean; roundDate: string }> {
  const coupon = await fetchSvenskaSpelCoupon();
  if (coupon.roundDate < stockholmDate()) throw new Error('CURRENT_COUPON_NOT_PUBLISHED');
  const ref = db.doc(`claimRounds/${coupon.roundDate}`);
  const created = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref); if (snapshot.exists) return false;
    transaction.create(ref, { roundDate: coupon.roundDate, drawNumber: coupon.drawNumber, status: 'unclaimed', lockAt: Timestamp.fromDate(new Date(coupon.regCloseTime)), createdAt: FieldValue.serverTimestamp() }); return true;
  });
  return { created, roundDate: coupon.roundDate };
}

export async function clearCurrentChallengers(): Promise<{ cleared: number; roundDate: string }> {
  const coupon = await fetchSvenskaSpelCoupon(); const ref = db.doc(`claimRounds/${coupon.roundDate}`); const snapshot = await ref.get();
  if (!snapshot.exists) throw new Error('CLAIM_ROUND_NOT_FOUND');
  const challengers = snapshot.data()?.challengers ?? {}; const privateTips = await db.collection('challengerTips').where('roundDate', '==', coupon.roundDate).get(); const batch = db.batch(); privateTips.docs.forEach((document) => batch.delete(document.ref)); batch.update(ref, { challengers: {}, challengersClearedAt: FieldValue.serverTimestamp() }); await batch.commit();
  return { cleared: Object.keys(challengers).length, roundDate: coupon.roundDate };
}

export async function migrateCurrentChallengers(): Promise<{ migrated: number; roundDate: string }> {
  const coupon = await fetchSvenskaSpelCoupon(); const ref = db.doc(`claimRounds/${coupon.roundDate}`); const snapshot = await ref.get();
  if (!snapshot.exists) throw new Error('CLAIM_ROUND_NOT_FOUND');
  const challengers = snapshot.data()?.challengers ?? {}; const summaries: Record<string, unknown> = {}; const batch = db.batch(); let migrated = 0;
  for (const [participant, value] of Object.entries(challengers)) {
    const challenger = value as Record<string, unknown>; const { base, rows, cost, lockedAt } = challenger; summaries[participant] = { participant, base, rows, cost, lockedAt };
    if (Array.isArray(challenger.finalTips)) { batch.set(db.doc(`challengerTips/${coupon.roundDate}_${participant}`), { roundDate: coupon.roundDate, ...challenger }, { merge: false }); migrated += 1; }
  }
  batch.update(ref, { challengers: summaries, challengersMigratedAt: FieldValue.serverTimestamp() }); await batch.commit();
  return { migrated, roundDate: coupon.roundDate };
}

function stockholmDate(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export async function discoverOfficialRound(): Promise<{ change: 'new' | 'updated' | 'unchanged' | 'waiting'; roundDate: string; officialRoundId?: string }> {
  const checkedAt = new Date().toISOString();
  try {
    const xStatsResult = await enrichCouponWithXStats(await fetchSvenskaSpelCoupon());
    const coupon = xStatsResult.coupon;
    const matching = await db.collection('rounds').where('officialRoundId', '==', coupon.officialRoundId).limit(1).get();
    const roundRef = matching.docs[0]?.ref ?? db.doc(`rounds/${coupon.roundDate}`);
    const currentRef = db.doc('stryktipset/current');
    const change = await db.runTransaction(async (transaction) => {
      const [roundSnapshot, currentSnapshot] = await Promise.all([transaction.get(roundRef), transaction.get(currentRef)]);
      const roundPlan = planOfficialCoupon(roundSnapshot.exists ? roundSnapshot.data() : undefined, coupon, checkedAt);
      if (roundPlan.data) transaction.set(roundRef, roundPlan.data, { merge: true });
      const current = currentSnapshot.data();
      if (currentSnapshot.exists && (current?.officialRoundId === coupon.officialRoundId || current?.roundDate === coupon.roundDate)) {
        const currentPlan = planOfficialCoupon(current, coupon, checkedAt);
        if (currentPlan.data) transaction.set(currentRef, currentPlan.data, { merge: true });
      } else {
        transaction.set(currentRef, buildOfficialOnlyRound(coupon, checkedAt));
      }
      return roundPlan.change;
    });
    const log = { kind: 'officialCouponCheck', at: checkedAt, outcome: change, roundDate: coupon.roundDate, officialRoundId: coupon.officialRoundId, drawNumber: coupon.drawNumber, xStatsCoverage: xStatsResult.count, xStatsErrors: xStatsResult.errors, createdAt: FieldValue.serverTimestamp() };
    const batch = db.batch();
    if (change !== 'unchanged') batch.set(db.collection('scrapeRuns').doc(), log);
    batch.set(db.doc('systemStatus/officialCoupon'), log);
    await batch.commit();
    logger.info(change === 'new' ? 'Ny officiell omgång hittades' : change === 'updated' ? 'Officiell omgång uppdaterades' : 'Officiell omgång kontrollerad utan ändring', log);
    return { change, roundDate: coupon.roundDate, officialRoundId: coupon.officialRoundId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'API_ERROR: aktuell Stryktipsomgång saknas') {
      const log = { kind: 'officialCouponCheck', at: checkedAt, outcome: 'waiting', message, createdAt: FieldValue.serverTimestamp() };
      const batch = db.batch(); batch.set(db.doc('systemStatus/officialCoupon'), log); await batch.commit();
      logger.info('Ingen öppen Stryktipsomgång ännu; befintliga data behålls', { at: checkedAt });
      return { change: 'waiting', roundDate: stockholmDate() };
    }
    const log = { kind: 'officialCouponCheck', at: checkedAt, outcome: 'failed', message, createdAt: FieldValue.serverTimestamp() };
    const batch = db.batch(); batch.set(db.collection('scrapeRuns').doc(), log); batch.set(db.doc('systemStatus/officialCoupon'), log); await batch.commit();
    logger.error('Kontroll av officiell omgång misslyckades; befintliga data behålls', { at: checkedAt, message });
    throw error;
  }
}

async function scrapeOnce(source: Scraper, useAI: boolean): Promise<ExpertPick[]> {
  let articleUrl: string; let html: string;
  if (source.id === 'tipsmedoss') {
    try {
      ({ url: articleUrl, html } = await fetchLatestWordpressArticle(TIPSMEDOSS_API, /^Stryktipset\b/i));
    }
    catch {
      const index = await fetchHtml(source.indexUrl); articleUrl = source.indexUrl;
      try { articleUrl = findCurrentArticle(index, source.indexUrl); } catch { /* index may itself contain the coupon */ }
      html = articleUrl === source.indexUrl ? index : await fetchHtml(articleUrl);
    }
  } else {
    const index = await fetchHtml(source.indexUrl); articleUrl = source.indexUrl;
    try { articleUrl = findCurrentArticle(index, source.indexUrl); } catch { /* index may itself contain the coupon */ }
    html = articleUrl === source.indexUrl ? index : await fetchHtml(articleUrl);
  }
  try { const picks = source.parse(html, articleUrl); validatePicks(picks); return picks; }
  catch (parserError) {
    logger.warn('Parsern hittade inte en komplett kupong', { source: source.id, articleUrl, htmlBytes: html.length, title: html.match(/<title[^>]*>([^<]*)/i)?.[1]?.trim() });
    if (!useAI) throw parserError;
    const picks = await extractPicksWithAI(html, source.id, articleUrl); if (!picks) throw parserError; validatePicks(picks); return picks;
  }
}

async function scrape(source: Scraper): Promise<ExpertPick[]> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return await scrapeOnce(source, attempt === 3); }
    catch (error) {
      lastError = error;
      if (attempt < 3) { logger.warn('Källhämtning misslyckades; försöker igen', { source: source.id, attempt }); await new Promise((resolve) => setTimeout(resolve, attempt * 750)); }
    }
  }
  throw lastError;
}

export async function updateCurrentRound(): Promise<{ published: boolean; roundDate: string }> {
  const now = new Date().toISOString(); const previousSnap = await db.doc('stryktipset/current').get();
  const previous = previousSnap.data() as RoundDocument | undefined;
  if (registrationHasClosed(previous, new Date(now))) {
    logger.info('Spelstopp har passerat; befintlig kupong behålls', { roundDate: previous?.roundDate, regCloseTime: previous?.regCloseTime });
    return { published: false, roundDate: previous?.roundDate ?? stockholmDate() };
  }
  const approvedAliases = await db.collection('teamAliases').get();
  approvedAliases.forEach((snapshot) => { const alias = snapshot.data(); if (typeof alias.alias === 'string' && typeof alias.canonical === 'string') addTeamAlias(alias.alias, alias.canonical); });
  const [expertResults, officialResult] = await Promise.all([Promise.allSettled(scrapers.map(scrape)), fetchSvenskaSpelCoupon().then(enrichCouponWithXStats).then((result) => ({ status: 'fulfilled' as const, value: result.coupon })).catch((reason) => ({ status: 'rejected' as const, reason }))]);
  const picks: ExpertPick[] = []; const statuses: Record<string, SourceStatus> = {};
  expertResults.forEach((result, index) => {
    const id = scrapers[index].id;
    if (result.status === 'fulfilled') { picks.push(...result.value); statuses[id] = { status: 'OK', updatedAt: now, lastSuccessfulUpdate: now, count: result.value.length }; }
    else { statuses[id] = { status: 'ERROR', updatedAt: now, lastSuccessfulUpdate: previous?.sources?.[id]?.lastSuccessfulUpdate, message: result.reason instanceof Error ? result.reason.message : String(result.reason) }; }
  });
  const aliasCandidates: Array<{ source: SourceId; matchNumber: number; alias: string; canonical: string }> = [];
  if (officialResult.status === 'fulfilled') {
    for (const source of scrapers.map((item) => item.id)) {
      if (statuses[source]?.status !== 'OK') continue;
      const sourceMismatches = picks.filter((pick) => pick.source === source).flatMap((pick) => { const official = officialResult.value.matches.find((item) => item.matchNumber === pick.matchNumber); return !official || !sameTeam(pick.homeTeam, official.homeTeam) || !sameTeam(pick.awayTeam, official.awayTeam) ? [{ pick, official }] : []; });
      if (sourceMismatches.length && sourceMismatches.length <= 3) sourceMismatches.forEach(({ pick, official }) => { if (!official) return; if (!sameTeam(pick.homeTeam, official.homeTeam)) aliasCandidates.push({ source, matchNumber: pick.matchNumber, alias: pick.homeTeam, canonical: official.homeTeam }); if (!sameTeam(pick.awayTeam, official.awayTeam)) aliasCandidates.push({ source, matchNumber: pick.matchNumber, alias: pick.awayTeam, canonical: official.awayTeam }); });
      const mismatch = sourceMismatches[0]?.pick;
      if (mismatch) { statuses[source] = { status: 'ERROR', updatedAt: now, lastSuccessfulUpdate: previous?.sources?.[source]?.lastSuccessfulUpdate, message: `MATCH_MISMATCH: Svenska Spel match ${mismatch.matchNumber}` }; picks.splice(0, picks.length, ...picks.filter((pick) => pick.source !== source)); }
    }
  }
  const coreSourcesOk = (['rekatochklart','bettingstugan'] as const).every((source) => statuses[source]?.status === 'OK');
  if (!coreSourcesOk) {
    await db.doc('aliasReviews/current').set(aliasCandidates.length ? { status: 'pending', updatedAt: now, roundDate: officialResult.status === 'fulfilled' ? officialResult.value.roundDate : stockholmDate(), candidates: aliasCandidates } : { status: 'none', updatedAt: now, candidates: [] });
    await db.doc('systemStatus/latest').set({ at: now, published: false, roundDate: officialResult.status === 'fulfilled' ? officialResult.value.roundDate : previous?.roundDate ?? stockholmDate(), statuses: omitUndefined(statuses), reason: 'En eller flera obligatoriska expertkällor kunde inte valideras' });
    await db.collection('scrapeRuns').add({ at: now, statuses: omitUndefined(statuses), published: false, reason: 'Alla källor måste valideras före publicering', createdAt: FieldValue.serverTimestamp() });
    logger.warn('Scrape validerades inte; befintlig kupong behålls', statuses); return { published: false, roundDate: previous?.roundDate ?? stockholmDate() };
  }
  let matches = limitSystemRows(buildConsensus(picks), 300); let officialCoupon: OfficialCoupon | undefined;
  if (officialResult.status === 'fulfilled') {
    try {
      const previousOfficialMatches = previous?.officialMatches ?? [];
      officialCoupon = { ...officialResult.value, matches: officialResult.value.matches.map((match) => {
        const old = previousOfficialMatches.find((item) => item.matchNumber === match.matchNumber && item.xStatsMatchId === match.xStatsMatchId);
        return match.xStats || !old?.xStats ? match : { ...match, xStats: old.xStats };
      }) };
      matches = matches.map((match) => {
        const official = officialCoupon!.matches.find((item) => item.matchNumber === match.matchNumber);
        if (!official || !sameTeam(match.homeTeam, official.homeTeam) || !sameTeam(match.awayTeam, official.awayTeam)) throw new Error(`MATCH_MISMATCH: Svenska Spel match ${match.matchNumber}`);
        const expertDeviation = SIGNS.map((sign) => ({ sign, difference: Math.round(match.support[sign] / match.ballots.length * 100) - official.distribution[sign] })).sort((a, b) => b.difference - a.difference)[0];
        const old = previous?.matches.find((item) => item.matchNumber === match.matchNumber && sameTeam(item.homeTeam, official.homeTeam) && sameTeam(item.awayTeam, official.awayTeam));
        return { ...match, homeTeam: official.homeTeam, awayTeam: official.awayTeam, publicDistribution: official.distribution, odds: official.odds, xStats: official.xStats ?? old?.xStats, expertDeviation: expertDeviation.difference >= Number(process.env.EXPERT_DEVIATION_THRESHOLD ?? 25) ? expertDeviation : undefined };
      });
      statuses.svenskaspel = { status: 'OK', updatedAt: now, lastSuccessfulUpdate: now, count: 13 };
    } catch (error) { statuses.svenskaspel = { status: 'ERROR', updatedAt: now, lastSuccessfulUpdate: previous?.sources?.svenskaspel?.lastSuccessfulUpdate, message: error instanceof Error ? error.message : String(error) }; }
  } else statuses.svenskaspel = { status: 'ERROR', updatedAt: now, lastSuccessfulUpdate: previous?.sources?.svenskaspel?.lastSuccessfulUpdate, message: officialResult.reason instanceof Error ? officialResult.reason.message : String(officialResult.reason) };
  if (statuses.svenskaspel.status === 'ERROR' && previous) matches = matches.map((match) => { const old = previous.matches.find((item) => item.matchNumber === match.matchNumber && sameTeam(item.homeTeam, match.homeTeam) && sameTeam(item.awayTeam, match.awayTeam)); return old?.publicDistribution ? { ...match, publicDistribution: old.publicDistribution, odds: old.odds, xStats: old.xStats, expertDeviation: old.expertDeviation } : match; });
  const roundDate = process.env.ROUND_DATE || officialCoupon?.roundDate || previous?.roundDate || stockholmDate();
  const nextDocument: RoundDocument = { roundDate, updatedAt: now, status: Object.values(statuses).every((source) => source.status === 'OK') ? 'ok' : 'partial', officialOnly: false, matches, sources: statuses, expertCount: new Set(picks.map((pick) => `${pick.source}:${pick.expert}`)).size, systemRows: calculateRows(matches), publicDistribution: null, highChaparral: buildHighChaparral(matches), ...(officialCoupon ? { officialRoundId: officialCoupon.officialRoundId, drawNumber: officialCoupon.drawNumber, regCloseTime: officialCoupon.regCloseTime, officialMatches: officialCoupon.matches, officialFingerprint: officialCouponFingerprint(officialCoupon), xStatsCoverage: officialCoupon.matches.filter((match) => match.xStats).length } : {}) };
  const document = officialCoupon ? nextDocument : preserveOfficialCoupon(nextDocument, previous);
  const firestoreDocument = omitUndefined(document);
  const batch = db.batch(); batch.set(db.doc('stryktipset/current'), firestoreDocument); batch.set(db.doc(`rounds/${roundDate}`), firestoreDocument, { merge: true }); batch.set(db.doc('aliasReviews/current'), { status: 'none', updatedAt: now, candidates: [] }); batch.set(db.doc('systemStatus/latest'), { at: now, published: true, roundDate, statuses: omitUndefined(statuses) }); batch.set(db.collection('scrapeRuns').doc(), { at: now, statuses: omitUndefined(statuses), published: true, roundDate, createdAt: FieldValue.serverTimestamp() }); await batch.commit();
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
