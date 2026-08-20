import { useEffect, useMemo, useState } from 'react';
import { LockKeyhole, Trophy, UserRoundCheck } from 'lucide-react';
import { claimRound, lockClaimRound } from '../services/firebase';
import type { ClaimRound, Participant, Round, Sign, Tip } from '../types';

const participants: Participant[] = ['Jocke', 'Tony', 'Gustav', 'Anders', 'Matta-Råsnygg', 'Christer'];
const signs: Sign[] = ['1', 'X', '2'];
const orderTip = (values: Sign[]) => signs.filter((sign) => values.includes(sign)).join('') as Tip;
const rowsFor = (tips: Tip[]) => tips.reduce((total, tip) => total * tip.length, 1);

export function ClaimPanel({ round, claim, onChanged }: { round: Round; claim?: ClaimRound; onChanged: () => Promise<void> }) {
  const [participant, setParticipant] = useState<Participant>('Jocke'); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [base, setBase] = useState<'expert' | 'chaparral'>('expert');
  const expertTips = useMemo(() => round.matches.map((match) => match.systemTip), [round]); const chaparralTips = useMemo(() => round.highChaparral?.tips ?? expertTips, [round, expertTips]); const [tips, setTips] = useState<Tip[]>(expertTips);
  useEffect(() => setTips(base === 'expert' ? expertTips : chaparralTips), [base, expertTips, chaparralTips]);
  if (!claim) return null;
  const rows = rowsFor(tips); const systemsReady = claim.roundDate === round.roundDate;
  const act = async (action: () => Promise<void>) => { setBusy(true); setError(''); try { await action(); setPassword(''); await onChanged(); } catch (value) { setError(value instanceof Error ? value.message.replace('Firebase: ', '') : 'Något gick fel'); } finally { setBusy(false); } };
  const toggle = (index: number, sign: Sign) => setTips((current) => current.map((tip, position) => { if (position !== index) return tip; const values = signs.filter((item) => tip.includes(item)); if (values.includes(sign)) return values.length === 1 ? tip : orderTip(values.filter((item) => item !== sign)); return orderTip([...values, sign]); }));
  return <section className="claim-panel"><header><span className="claim-icon"><UserRoundCheck/></span><div><small>Veckans ansvar</small><h2>Claima omgången · {claim.roundDate}</h2></div><span className={`claim-status ${claim.status}`}>{claim.status === 'unclaimed' ? 'Ledig' : claim.status === 'claimed' ? 'Utkast' : claim.status === 'settled' ? 'Avgjord' : 'Låst'}</span></header>
    {claim.status === 'unclaimed' && <div className="claim-form"><label>Välj tipsare<select value={participant} onChange={(event) => setParticipant(event.target.value as Participant)}>{participants.map((name) => <option key={name}>{name}</option>)}</select></label><label>Gruppens lösenord<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Tstipsets lösenord"/></label><button disabled={busy || !password} onClick={() => act(() => claimRound(claim.roundDate, participant, password))}>Claima omgången</button></div>}
    {claim.status === 'claimed' && <><p><b>{claim.participant}</b> ansvarar för omgången.</p>{!systemsReady ? <div className="claim-wait">Expertsystemen blir valbara efter fredagens ordinarie körning.</div> : <><div className="base-picker"><button className={base === 'expert' ? 'active' : ''} onClick={() => setBase('expert')}>Experternas system</button><button className={base === 'chaparral' ? 'active' : ''} onClick={() => setBase('chaparral')}>High Chaparall</button></div><div className="claim-editor">{round.matches.map((match, index) => <div key={match.matchNumber}><span>{match.matchNumber}. {match.homeTeam}–{match.awayTeam}</span><div>{signs.map((sign) => <button className={tips[index].includes(sign) ? 'selected' : ''} onClick={() => toggle(index, sign)} key={sign}>{sign}</button>)}</div></div>)}</div><div className={`claim-total ${rows > 300 ? 'over' : ''}`}><span><b>{rows}</b> rader · {rows} kr</span><small>Max 300 rader</small></div><div className="claim-lock"><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Bekräfta med Tstipsets lösenord"/><button disabled={busy || !password || rows > 300} onClick={() => { if (window.confirm(`Lås ${rows} rader för ${claim.participant}? Raden kan inte ändras efteråt.`)) act(() => lockClaimRound(claim.roundDate, base, base === 'expert' ? expertTips : chaparralTips, tips, password)); }}><LockKeyhole size={16}/> Lås och skicka in</button></div></>}
    </>}
    {(claim.status === 'locked' || claim.status === 'settled') && <div className="locked-claim"><LockKeyhole/><span><b>{claim.participant}</b> har låst {claim.rows} rader med {claim.base === 'chaparral' ? 'High Chaparall' : 'Experternas system'} som grund.</span></div>}{error && <div className="claim-error">{error}</div>}
  </section>;
}

export function ParticipantResults({ claims }: { claims: ClaimRound[] }) {
  const settled = claims.filter((claim) => claim.status === 'settled' && claim.participant && claim.result);
  if (!settled.length) return <section className="participant-results"><header><Trophy/><div><small>Tipsgruppen</small><h2>Deltagarresultat</h2></div></header><p>Resultattabellen fylls på efter den första claimade och avgjorda omgången.</p></section>;
  const standings = participants.map((name) => { const entries = settled.filter((claim) => claim.participant === name); return { name, rounds: entries.length, average: entries.length ? entries.reduce((sum, claim) => sum + claim.result!.maxCorrect, 0) / entries.length : 0, payout: entries.reduce((sum, claim) => sum + claim.result!.payout, 0) }; }).filter((entry) => entry.rounds).sort((a, b) => b.payout - a.payout || b.average - a.average);
  return <section className="participant-results"><header><Trophy/><div><small>Tipsgruppen</small><h2>Deltagarresultat</h2></div></header><div className="standings">{standings.map((entry, index) => <div key={entry.name}><span>{index + 1}</span><strong>{entry.name}</strong><small>{entry.rounds} omg.</small><b>{entry.average.toFixed(1)} rätt i snitt</b><em>{entry.payout.toLocaleString('sv-SE')} kr</em></div>)}</div><details><summary>Visa alla avgjorda omgångar</summary><div className="result-rounds">{settled.map((claim) => <div key={claim.roundDate}><span>{claim.roundDate}</span><strong>{claim.participant}</strong><small>{claim.result!.maxCorrect} rätt · {claim.rows} rader</small><b>{claim.result!.payout.toLocaleString('sv-SE')} kr</b></div>)}</div></details></section>;
}
