import { ChevronDown, Target, Zap } from 'lucide-react';
import type { Match, Round, Sign } from '../types';

const signs: Sign[] = ['1', 'X', '2'];
const strongestSign = (match: Match): Sign => match.consensusSign ?? [...signs].sort((a, b) => match.support[b] - match.support[a] || signs.indexOf(a) - signs.indexOf(b))[0];
const signPrice = (match: Match, sign: Sign) => match.odds?.[sign] ?? (match.publicDistribution?.[sign] ? 100 / match.publicDistribution[sign] : 1);

function SingleRow({ label, tips }: { label: string; tips: Sign[] }) {
  return <details className="single-row"><summary>{label}<ChevronDown size={15}/></summary><div className="system-grid">{tips.map((tip, index) => <div key={index}><span>{index + 1}</span><strong>{tip}</strong></div>)}</div></details>;
}

export function SystemPanel({ matches, rows, highChaparral }: { matches: Match[]; rows: number; highChaparral?: Round['highChaparral'] }) {
  const expertSingle = matches.map(strongestSign);
  const chaparralSingle = highChaparral?.singleRow ?? highChaparral?.tips.map((_, index) => {
    const match = matches[index]; const baseline = strongestSign(match);
    if (!highChaparral.pivots.includes(index + 1)) return baseline;
    return [...signs].filter((sign) => sign !== baseline && match.support[sign] > 0).sort((a, b) => signPrice(match, b) - signPrice(match, a) || match.support[b] - match.support[a] || signs.indexOf(a) - signs.indexOf(b))[0] ?? baseline;
  });
  return <div className="system-stack">
    <section className="system-panel"><header><span className="icon"><Target size={20}/></span><div><small>Automatiskt förslag</small><h2>Experternas system</h2></div><b>{new Intl.NumberFormat('sv-SE').format(rows)} rader</b></header><div className="system-grid">{matches.map((match)=><div key={match.matchNumber}><span>{match.matchNumber}</span><strong>{match.systemTip}</strong></div>)}</div><p>Budgettak: 300 rader (6 × 50 kr). Systemet byggs deterministiskt från expertstödet och är inte ett spelråd.</p><SingleRow label="Visa experternas enkelrad" tips={expertSingle}/></section>
    {highChaparral && chaparralSingle && <section className="chaparral-panel"><header><span className="icon"><Zap size={19}/></span><div><small>Offensivt system</small><h2>High Chaparall</h2></div><b>{new Intl.NumberFormat('sv-SE').format(highChaparral.rows)} rader</b></header><div className="system-grid">{highChaparral.tips.map((tip, index)=><div className={highChaparral.pivots.includes(index + 1) ? 'pivot' : ''} key={index}><span>{index + 1}</span><strong>{tip}</strong></div>)}</div><p>Fyller budgeten så nära 300 rader som vanlig hel- och halvgardering tillåter. Behåller tydliga spikar och ger minst sex osäkra matcher en offensiv, expertstödd inriktning när kupongen tillåter det. Högre odds innebär normalt lägre träffchans.</p><SingleRow label="Visa High Chaparall-enkelrad" tips={chaparralSingle}/></section>}
  </div>;
}
