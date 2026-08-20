import type { Sign } from '../types';

export function PublicDistribution({ distribution }: { distribution: Record<Sign, number> }) {
  return <div className="public-block"><div className="support-title"><span>Svenska folket</span><span>Streckfördelning</span></div><div className="support public-support">{(['1', 'X', '2'] as Sign[]).map((sign) => <div className="support-row" key={sign}><b>{sign}</b><div className="bar"><i style={{ width: `${distribution[sign]}%` }}/></div><span>{distribution[sign]}%</span></div>)}</div></div>;
}
