import { CheckCircle2, XCircle } from 'lucide-react';
import type { SourceStatus } from '../types';

const experts = [
  ['rekatochklart', 'Rekatochklart'],
  ['bettingstugan', 'Bettingstugan'],
  ['understreckat', 'Understreckat'],
  ['tipsmedoss', 'Tipsmedoss'],
] as const;

export function ExpertSourceStatus({ sources }: { sources: Record<string, SourceStatus> }) {
  return <section className="expert-source-status">
    <header><small>Veckans expertunderlag</small><h2>Status för experttipsen</h2></header>
    <div>{experts.map(([id, name]) => {
      const source = sources[id]; const ready = source?.status === 'OK' && source.count === 13;
      return <article className={ready ? 'ready' : 'missing'} key={id}>
        {ready ? <CheckCircle2/> : <XCircle/>}
        <span><strong>{name}</strong><small>{ready ? 'Hämtad och matchar Svenska Spels kupong' : source?.message || 'Korrekt expertrad har inte hittats ännu'}</small></span>
      </article>;
    })}</div>
  </section>;
}
