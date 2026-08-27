import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Flame, RefreshCw, ShieldCheck } from 'lucide-react';
import { MatchCard } from './components/MatchCard';
import { SystemPanel } from './components/SystemPanel';
import { AliasApproval } from './components/AliasApproval';
import { ClaimPanel, ParticipantResults } from './components/ParticipantPool';
import { LiveView } from './components/LiveView';
import { ExpertSourceStatus } from './components/ExpertSourceStatus';
import { getAliasReview, getClaimRounds, getCurrentRound, getExpertStats, getLatestRunStatus, subscribeLiveStatus } from './services/firebase';
import type { AliasReview, ClaimRound, Classification, ExpertStats, LatestRunStatus, LiveStatus, Round } from './types';
import logo from './assets/ts-gubbarnas-dundertips.png';

type Filter = 'all' | 'strong' | 'consensus' | 'disagreement' | 'deviation';
const swedishDate = (date: string) => new Intl.DateTimeFormat('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00`));

export default function App() {
  const [round, setRound] = useState<Round>(); const [demo, setDemo] = useState(false);
  const [review, setReview] = useState<AliasReview>(); const [latestRun, setLatestRun] = useState<LatestRunStatus>(); const [stats, setStats] = useState<ExpertStats>(); const [claims, setClaims] = useState<ClaimRound[]>([]); const [liveStatus, setLiveStatus] = useState<LiveStatus>(); const [error, setError] = useState(''); const [filter, setFilter] = useState<Filter>('all');
  const refreshClaims = async () => setClaims(await getClaimRounds());
  useEffect(() => { Promise.all([getCurrentRound(), getAliasReview(), getLatestRunStatus(), getExpertStats(), getClaimRounds()]).then(([result, aliasReview, runStatus, expertStats, claimRounds]) => { setRound(result.round); setDemo(result.demo); setLatestRun(runStatus); setStats(expertStats); setClaims(claimRounds); if (aliasReview?.status === 'pending' && aliasReview.candidates.length) setReview(aliasReview); }).catch(() => setError('Kupongen kunde inte hämtas. Försök igen senare.')); }, []);
  useEffect(() => subscribeLiveStatus(setLiveStatus), []);
  const counts = useMemo(() => round?.matches.reduce((a, m) => ({ ...a, [m.classification]: a[m.classification] + 1 }), { strong: 0, consensus: 0, disagreement: 0, coverage: 0 } as Record<Classification, number>), [round]);
  if (error) return <main className="state"><AlertTriangle/><h1>Något gick fel</h1><p>{error}</p></main>;
  if (!round || !counts) return <main className="state"><RefreshCw className="spin"/><p>Hämtar veckans konsensus…</p></main>;
  const deviationCount = round.matches.filter((match) => match.expertDeviation).length;
  const visible = filter === 'all' ? round.matches : round.matches.filter((match) => filter === 'deviation' ? Boolean(match.expertDeviation) : match.classification === filter);
  const filters: [Filter, string][] = [['all', 'Alla'], ['strong', '🔥 Spikar'], ['consensus', '✓ Konsensus'], ['disagreement', '! Oense'], ['deviation', '💎 Avvikelser']];
  const sourceNames: Record<string,string> = { rekatochklart:'Rekatochklart', bettingstugan:'Bettingstugan', understreckat:'Understreckat', tipsmedoss:'Tipsmedoss', svenskaspel:'Svenska Spel' };
  const failedLatestSources = latestRun && !latestRun.published ? Object.entries(latestRun.statuses).filter(([, source]) => source.status === 'ERROR').map(([source]) => sourceNames[source] ?? source) : [];
  const currentClaim = claims.find((claim) => claim.roundDate === round.roundDate && claim.status !== 'settled') ?? claims.find((claim) => claim.roundDate === round.roundDate);
  return <>
    <header className="hero"><nav><a className="brand" href="./" aria-label="TS-Gubbarnas Dundertips"><img src={logo} alt="TS-Gubbarnas Dundertips"/></a><span className="live"><i/> Uppdaterad</span></nav><div className="hero-grid"><div className="hero-copy"><div className="eyebrow">Veckans kupong · {swedishDate(round.roundDate)}</div><h1>Tretton rätt,<br/><em>Plättlätt!</em></h1><p className="intro">{round.officialOnly ? 'Svenska Spels nya kupong är publicerad. Expertanalyserna läggs till när de finns tillgängliga.' : 'Experttips från Rekatochklart, Bettingstugan, Understreckat och Tipsmedoss — jämförda match för match.'}</p><div className="meta"><span><b>13</b> matcher</span><span>{round.officialOnly ? <b>Experttips inväntas</b> : <><b>{round.expertCount}</b> experter</>}</span><span><b>{new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' }).format(new Date(round.updatedAt))}</b> uppdaterad</span></div></div><LiveView live={liveStatus} claim={currentClaim} roundDate={round.roundDate}/></div></header>
    <main>
      {!round.officialOnly && <section className="summary"><div><Flame/><span><b>{counts.strong}</b> spikkandidater</span></div><div><CheckCircle2/><span><b>{counts.consensus}</b> med konsensus</span></div><div><AlertTriangle/><span><b>{counts.disagreement}</b> oense</span></div><div><ShieldCheck/><span><b>{deviationCount}</b> expertavvikelser</span></div></section>}
      {round.officialOnly && <div className="notice">Den nya kupongen är hämtad från Svenska Spel. Streck och odds visas nu; expertkonsensus och systemförslag publiceras när källorna är kompletta.</div>}
      {demo && <div className="notice">Ingen livekupong har publicerats ännu — demodata visas tills källorna har validerats.</div>}
      {latestRun && latestRun.roundDate === round.roundDate && !latestRun.published && <div className="warning"><AlertTriangle size={18}/><span><b>{round.officialOnly ? 'Expertinsamlingen är inte komplett.' : 'Senaste uppdateringen misslyckades.'}</b> {round.officialOnly ? 'Svenska Spels aktuella kupong visas medan experttipsen inväntas.' : 'Föregående validerade expertkonsensus visas.'}{failedLatestSources.length > 0 && <small>Saknade eller ogiltiga källor: {failedLatestSources.join(', ')}.</small>}</span></div>}
      {review && <AliasApproval review={review}/>}
      {Object.entries(round.sources).filter(([, source]) => source.status === 'ERROR').map(([name, source]) => <div className="warning" key={name}><AlertTriangle size={18}/><span><b>{sourceNames[name] ?? name}</b> kunde inte uppdateras och ingår därför inte i den aktuella konsensusen.{source.message && <small>{source.message}</small>}</span></div>)}
      <ClaimPanel round={round} claim={currentClaim} claims={claims} live={liveStatus} onChanged={refreshClaims}/>
      <section className="content"><div className="matches"><div className="section-head"><div><small>13 matcher</small><h2>Match för match</h2></div>{!round.officialOnly && <div className="filters" role="group" aria-label="Filtrera matcher">{filters.map(([id, label]) => <button className={filter === id ? 'active' : ''} onClick={() => setFilter(id)} key={id}>{label}</button>)}</div>}</div><div className="match-list">{visible.map((match) => <MatchCard match={match} key={match.matchNumber}/>)}</div>{!visible.length && <p className="empty">Inga matcher i det här filtret.</p>}</div><aside>{!round.officialOnly && <SystemPanel matches={round.matches} rows={round.systemRows} highChaparral={round.highChaparral} stats={stats}/>}<div className="source-card"><small>Källor</small><h3>Öppet redovisade tips</h3><p>Expertanalyserna sammanställs från externa källor. Svenska Spel används separat för officiell kupong och streckfördelning.</p>{Object.keys(round.sources).map((source) => { const sources: Record<string,[string,string]> = { rekatochklart:['Rekatochklart','https://www.rekatochklart.com/tips/stryktipset/'], bettingstugan:['Bettingstugan','https://bettingstugan.se/stryktipset/'], understreckat:['Understreckat','https://understreckat.se/stryktipset'], tipsmedoss:['Tipsmedoss','https://tipsmedoss.com/category/stryktipsforslag/'], svenskaspel:['Svenska Spel','https://spela.svenskaspel.se/stryktipset'] }; const link = sources[source] ?? [source,'#']; return <a key={source} href={link[1]} target="_blank" rel="noreferrer">{link[0]} ↗</a>; })}</div><ExpertSourceStatus sources={round.sources}/></aside></section>
      <ParticipantResults claims={claims}/>
    </main><footer><span>TS-Gubbarnas Dundertips</span><p>Spela ansvarsfullt. 18+ · En sammanställning, inte ett spelråd.</p></footer>
  </>;
}
