import { useEffect, useState } from 'react';
import { Table2, Trophy, X } from 'lucide-react';
import type { FootballStandings, LeagueTable } from '../types';

function TableContent({ league }: { league: LeagueTable }) {
  return <>
    <div className="league-table-scroll"><table><thead><tr><th>#</th><th>Lag</th><th>S</th><th>V</th><th>O</th><th>F</th><th>+/−</th><th>P</th></tr></thead><tbody>{league.table.map((entry) => <tr key={entry.team.id}><td>{entry.position}</td><td>{entry.team.crest && <img src={entry.team.crest} alt="" loading="lazy"/>}<strong>{entry.team.shortName || entry.team.name}</strong></td><td>{entry.playedGames}</td><td>{entry.won}</td><td>{entry.draw}</td><td>{entry.lost}</td><td>{entry.goalDifference > 0 ? '+' : ''}{entry.goalDifference}</td><td><b>{entry.points}</b></td></tr>)}</tbody></table></div>
    {league.previousRound && <section className="league-previous-round"><header><small>Senaste resultaten</small><strong>Omgång {league.previousRound.matchday}</strong></header><div>{league.previousRound.matches.map((match) => <article key={match.id}><time dateTime={match.utcDate}>{new Intl.DateTimeFormat('sv-SE', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(match.utcDate))}</time><span><strong>{match.homeTeam.shortName}</strong><strong>{match.awayTeam.shortName}</strong></span><b>{match.score.home}<br/>{match.score.away}</b></article>)}</div></section>}
  </>;
}

export function LeagueTables({ standings }: { standings?: FootballStandings }) {
  const [open, setOpen] = useState<'PL' | 'ELC'>();
  const available = (['PL', 'ELC'] as const).filter((code) => standings?.leagues[code]);
  useEffect(() => { if (!open) return; const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(undefined); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [open]);
  if (!standings || !available.length) return null;
  const league = open ? standings.leagues[open] : undefined;
  return <>
    <section className="league-table-launcher" aria-label="Ligatabeller"><span><Table2 size={16}/><strong>Ligatabeller</strong></span>{available.map((code) => <button type="button" onClick={() => setOpen(code)} key={code}>{code === 'PL' ? 'Premier League' : 'Championship'}</button>)}</section>
    {league && <div className="result-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(undefined); }}><section className="result-modal league-table-modal" role="dialog" aria-modal="true" aria-labelledby="league-table-modal-title"><button className="result-modal-close" type="button" aria-label="Stäng ligatabell" onClick={() => setOpen(undefined)}><X/></button><div className="result-modal-hero"><span><Trophy/></span><small>Engelsk fotboll</small><h2 id="league-table-modal-title">{league.name}</h2><p>Aktuell tabellställning · <a href={standings.sourceUrl} target="_blank" rel="noreferrer">football-data.org ↗</a></p></div><TableContent league={league}/></section></div>}
  </>;
}
