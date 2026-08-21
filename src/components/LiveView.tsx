import { useEffect, useMemo, useState } from 'react';
import { Clock3, Radio } from 'lucide-react';
import type { ClaimRound, LiveStatus, Tip } from '../types';

const covers = (tip: Tip, sign?: string) => Boolean(sign && tip.includes(sign));

export function LiveView({ live, claim }: { live?: LiveStatus; claim?: ClaimRound }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  const firstStart = useMemo(() => live?.matches.reduce((first, match) => Math.min(first, Date.parse(match.matchStart)), Number.POSITIVE_INFINITY), [live]);
  if (!live || live.roundDate !== claim?.roundDate) return null;
  if (!live.started) {
    const remaining = Math.max(0, (firstStart ?? now) - now); const days = Math.floor(remaining / 86_400_000); const hours = Math.floor(remaining % 86_400_000 / 3_600_000); const minutes = Math.floor(remaining % 3_600_000 / 60_000);
    return <section className="live-view countdown-view"><header><span className="live-pulse"><Clock3 size={16}/></span><div><small>Nästa omgång</small><strong>Avspark om</strong></div><b>{days ? `${days}d ${hours}h` : `${hours}h ${minutes}m`}</b></header><div className="countdown-matches">{live.matches.map((match) => <div key={match.matchNumber}><span>{match.matchNumber}</span><strong>{match.homeTeam}–{match.awayTeam}</strong><time dateTime={match.matchStart}>{new Intl.DateTimeFormat('sv-SE', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(match.matchStart))}</time></div>)}</div></section>;
  }
  if (claim.status !== 'locked' || !claim.finalTips?.length) return null;
  const decided = live.matches.filter((match) => match.currentSign);
  const correct = decided.filter((match) => covers(claim.finalTips![match.matchNumber - 1], match.currentSign)).length;
  const ongoing = live.matches.filter((match) => match.sportEventStatus !== 'NotStarted' && match.sportEventStatus !== 'Ended' && !match.cancelled).length;
  return <section className={`live-view ${live.complete ? 'finished' : ''}`} aria-live="polite">
    <header><span className="live-pulse"><Radio size={16}/></span><div><small>{live.complete ? 'Omgången avslutad' : 'Live · preliminärt'}</small><strong>Skarpa raden</strong></div><b>{correct}/{decided.length}</b></header>
    <div className="live-progress"><i style={{ width: `${decided.length ? correct / decided.length * 100 : 0}%` }}/></div>
    <p>{live.complete ? `${correct} av 13 matcher täcktes av systemet.` : ongoing ? `${ongoing} matcher pågår · uppdateras var 5:e minut` : 'Nästa match inväntas.'}</p>
    <details><summary>Visa matchstatus</summary><div className="live-matches">{live.matches.map((match) => {
      const tip = claim.finalTips![match.matchNumber - 1]; const hasScore = match.currentSign !== undefined; const right = covers(tip, match.currentSign);
      return <div className={hasScore ? right ? 'right' : 'wrong' : ''} key={match.matchNumber}><span>{match.matchNumber}</span><b>{hasScore ? `${match.homeScore}–${match.awayScore}` : '–'}</b><small>{tip}</small></div>;
    })}</div></details>
  </section>;
}
