import { CheckCircle2, XCircle } from 'lucide-react';
import type { SourceStatus } from '../types';

const experts = [
  ['rekatochklart', 'Rekatochklart'],
  ['bettingstugan', 'Bettingstugan'],
  ['tipper', 'Tipper'],
  ['tipsmedoss', 'Tipsmedoss'],
] as const;

export function ExpertSourceStatus({ sources }: { sources: Record<string, SourceStatus> }) {
  const count = experts.filter(([id]) => sources[id]?.status === 'OK' && sources[id]?.count === 13).length;
  return <details className="expert-source-status source-disclosure">
    <summary><CheckCircle2 size={19}/><span><strong>{count} av 4 expertkällor klara</strong><small>{count === 4 ? 'Alla expertanalyser är tillgängliga' : 'Fler analyser inväntas'}</small></span></summary>
    <div>{experts.map(([id, name]) => {
      const source = sources[id]; const ready = source?.status === 'OK' && source.count === 13;
      return <article className={ready ? 'ready' : 'missing'} key={id}>
        <strong>{name}</strong>
        {ready ? <CheckCircle2 aria-label="Expertrad fullständig"/> : <XCircle aria-label="Expertrad ej fullständig"/>}
        {!ready && <small>Expertrad ej fullständig</small>}
        {!ready && source?.message && <small>{source.message}</small>}
      </article>;
    })}</div>
  </details>;
}
