import { CheckCircle2, XCircle } from 'lucide-react';
import type { SourceStatus } from '../types';

const experts = [
  ['rekatochklart', 'Rekatochklart'],
  ['bettingstugan', 'Bettingstugan'],
  ['tipper', 'Tipper'],
  ['tipsmedoss', 'Tipsmedoss'],
] as const;

export function ExpertSourceStatus({ sources }: { sources: Record<string, SourceStatus> }) {
  return <section className="expert-source-status">
    <header><h2>Status för experttipsen</h2></header>
    <div>{experts.map(([id, name]) => {
      const source = sources[id]; const ready = source?.status === 'OK' && source.count === 13;
      return <article className={ready ? 'ready' : 'missing'} key={id}>
        <strong>{name}</strong>
        {ready ? <CheckCircle2 aria-label="Expertrad fullständig"/> : <XCircle aria-label="Expertrad ej fullständig"/>}
        {!ready && <small>Expertrad ej fullständig</small>}
      </article>;
    })}</div>
  </section>;
}
