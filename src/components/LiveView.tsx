import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, Radio, XCircle } from 'lucide-react';
import type { ClaimRound, LiveStatus, Tip } from '../types';

const covers = (tip: Tip, sign?: string) => Boolean(sign && tip.includes(sign));

export function LiveView({ live, claim, roundDate, connectionError = false }: { live?: LiveStatus; claim?: ClaimRound; roundDate: string; connectionError?: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  const firstStart = useMemo(() => live?.matches.reduce((first, match) => Math.min(first, Date.parse(match.matchStart)), Number.POSITIVE_INFINITY), [live]);
  if (!live || live.roundDate !== roundDate) return null;
  const checkedAt = Date.parse(live.lastSuccessAt ?? live.updatedAt);
  const age = Number.isFinite(checkedAt) ? now - checkedAt : Number.POSITIVE_INFINITY;
  const monitoringExpected = Boolean(live.pollRecommended || live.active) && !live.complete;
  const critical = connectionError || (monitoringExpected && (live.phase === 'degraded' || age > 20 * 60_000));
  const stale = monitoringExpected && !critical && age > 10 * 60_000;
  const checkedLabel = Number.isFinite(checkedAt) ? new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' }).format(new Date(checkedAt)) : 'okänd tid';
  const freshnessText = critical ? 'Offline, nytt försök pågår' : stale ? 'Uppdateringen är försenad' : monitoringExpected ? 'Senast kontrollerad' : live.complete ? 'Slutresultat kontrollerat' : 'Livebevakning förberedd';
  const freshness = <details className="live-health"><summary>Live-status</summary><div className={`live-freshness ${critical ? 'critical' : stale ? 'stale' : ''}`}>{freshnessText} · {checkedLabel}{monitoringExpected && live.consecutiveFailures ? ` · ${live.consecutiveFailures} misslyckade försök` : ''}</div></details>;
  if (!live.pollRecommended && !live.active && !live.complete) {
    const remaining = Math.max(0, (firstStart ?? now) - now); const days = Math.floor(remaining / 86_400_000); const hours = Math.floor(remaining % 86_400_000 / 3_600_000); const minutes = Math.floor(remaining % 3_600_000 / 60_000);
    return <section className="live-view countdown-view"><header><span className="live-pulse"><Clock3 size={16}/></span><div><small>Nästa omgång</small><strong>{remaining ? 'Avspark om' : 'Veckans matcher'}</strong></div><b>{remaining ? days ? `${days}d ${hours}h` : `${hours}h ${minutes}m` : '13 matcher'}</b></header>{freshness}<div className="countdown-matches">{live.matches.map((match) => <div key={match.matchNumber}><span>{match.matchNumber}</span><strong>{match.homeTeam}–{match.awayTeam}</strong><time dateTime={match.matchStart}>{new Intl.DateTimeFormat('sv-SE', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(match.matchStart))}</time></div>)}</div></section>;
  }
  if (claim?.status !== 'locked' || !claim.finalTips?.length) return <section className="live-view live-waiting"><header><span className="live-pulse"><Radio size={16}/></span><div><small>Livebevakning förberedd</small><strong>Skarpa raden är inte låst</strong></div></header><p>Matchstatus hämtas, men jämförelsen visas först när huvudraden har låsts.</p></section>;
  const decided = live.matches.filter((match) => match.currentSign);
  const correct = decided.filter((match) => covers(claim.finalTips![match.matchNumber - 1], match.currentSign)).length;
  const ongoing = live.matches.filter((match) => match.sportEventStatus === 'InProgress').length;
  const statusOrder = { InProgress: 0, NotStarted: 1, Unknown: 2, Ended: 3, Cancelled: 4 } as Record<string, number>;
  const displayMatches = live.active ? [...live.matches].sort((a, b) => (statusOrder[a.sportEventStatus] ?? 2) - (statusOrder[b.sportEventStatus] ?? 2) || a.matchNumber - b.matchNumber) : live.matches;
  return <section className={`live-view ${live.complete ? 'finished' : ''}`} aria-live="polite">
    <header><span className="live-pulse"><Radio size={16}/></span><div><small>{live.complete ? 'Omgången avslutad' : 'Live · preliminärt'}</small><strong>Skarpa raden</strong></div><b className="live-correct"><span>{correct}</span><small>{live.complete ? 'rätt' : 'rätt live'}</small></b></header>
    <div className="live-progress"><i style={{ width: `${correct / 13 * 100}%` }}/></div>
    <p>{live.complete ? `${correct} av 13 matcher täcktes av systemet.` : ongoing ? `${ongoing} matcher pågår · uppdateras regelbundet` : 'Nästa match inväntas.'}</p>
    {freshness}
    <div className="live-matches">{displayMatches.map((match) => {
      const tip = claim.finalTips![match.matchNumber - 1]; const hasScore = match.currentSign !== undefined; const right = covers(tip, match.currentSign);
      const status = match.cancelled ? 'Inställd' : match.sportEventStatus === 'Ended' ? 'Avslutad' : match.sportEventStatus === 'NotStarted' ? 'Ej startad' : match.sportEventStatus === 'InProgress' ? 'Pågår' : 'Status inväntas';
      const detailedStatus = match.sportEventStatus === 'InProgress' && match.status && !/pågår|in.?progress/i.test(match.status) ? `${status} · ${match.status}` : status;
      return <div className={hasScore ? right ? 'right' : 'wrong' : ''} key={match.matchNumber}><span className="live-match-number">{match.matchNumber}</span><span className="live-match-teams"><strong>{match.homeTeam}</strong><small>{match.awayTeam}</small></span><b className="live-match-score">{hasScore ? `${match.homeScore}–${match.awayScore}` : '–'}</b><span className="live-match-status">{detailedStatus}</span><span className="live-match-tip">Rad {tip}</span>{hasScore ? right ? <CheckCircle2 aria-label="Rätt"/> : <XCircle aria-label="Fel"/> : <i/>}</div>;
    })}</div>
  </section>;
}
