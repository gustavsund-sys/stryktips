import { SIGNS, type BaseSign, type Classification, type ConsensusMatch, type ExpertPick, type Tip } from '../types';
import { sameTeam } from '../normalization/teams';

export interface SystemConfig { strong: Tip; consensus: Tip; disagreement: Tip; coverage: Tip; }
export const DEFAULT_SYSTEM_CONFIG: SystemConfig = { strong: '1', consensus: '1X', disagreement: '1X2', coverage: '1X2' };
const order = (sign: BaseSign) => SIGNS.indexOf(sign);
const asTip = (signs: BaseSign[]) => signs.sort((a, b) => order(a) - order(b)).join('') as Tip;

function classify(tips: Tip[], support: Record<BaseSign, number>): { classification: Classification; consensusSign?: BaseSign } {
  if (tips.every((tip) => tip.length === 1 && tip === tips[0])) return { classification: 'strong', consensusSign: tips[0] as BaseSign };
  const max = Math.max(...Object.values(support)); const winners = SIGNS.filter((sign) => support[sign] === max);
  if (winners.length === 1 && max / tips.length >= 0.67) return { classification: 'consensus', consensusSign: winners[0] };
  const intersection = SIGNS.filter((sign) => tips.every((tip) => tip.includes(sign)));
  if (intersection.length === 1) return { classification: 'consensus', consensusSign: intersection[0] };
  if (tips.some((tip) => tip.length === 1) && tips.some((tip) => !tip.includes(tips.find((item) => item.length === 1)!))) return { classification: 'disagreement' };
  return { classification: 'coverage' };
}

function systemTip(classification: Classification, consensusSign: BaseSign | undefined, support: Record<BaseSign, number>, config: SystemConfig): Tip {
  if (classification === 'strong' && consensusSign) return consensusSign;
  if (classification === 'consensus' && consensusSign) {
    const second = SIGNS.filter((sign) => sign !== consensusSign).sort((a, b) => support[b] - support[a] || order(a) - order(b))[0];
    return config.consensus.length === 1 ? consensusSign : asTip([consensusSign, second]);
  }
  return config[classification];
}

export function buildConsensus(picks: ExpertPick[], config = DEFAULT_SYSTEM_CONFIG): ConsensusMatch[] {
  const matches: ConsensusMatch[] = [];
  for (let matchNumber = 1; matchNumber <= 13; matchNumber++) {
    const votes = picks.filter((pick) => pick.matchNumber === matchNumber); if (!votes.length) throw new Error(`Match ${matchNumber} saknar tips`);
    const reference = votes[0];
    if (votes.some((vote) => !sameTeam(vote.homeTeam, reference.homeTeam) || !sameTeam(vote.awayTeam, reference.awayTeam))) throw new Error(`MATCH_MISMATCH: match ${matchNumber}`);
    const support = Object.fromEntries(SIGNS.map((sign) => [sign, votes.filter((vote) => vote.tip.includes(sign)).length])) as Record<BaseSign, number>;
    const result = classify(votes.map((vote) => vote.tip), support);
    matches.push({ matchNumber, homeTeam: reference.homeTeam, awayTeam: reference.awayTeam, ballots: votes.map((vote) => ({ expertId: `${vote.source}:${vote.expert.toLowerCase().replace(/\s+/g, '-')}`, expert: vote.expert, source: vote.source, sourceUrl: vote.sourceUrl, tip: vote.tip })), support, ...result, systemTip: systemTip(result.classification, result.consensusSign, support, config) });
  }
  return matches;
}

export const calculateRows = (matches: ConsensusMatch[]) => matches.reduce((rows, match) => rows * match.systemTip.length, 1);

export function limitSystemRows(matches: ConsensusMatch[], maxRows = 300): ConsensusMatch[] {
  if (!Number.isInteger(maxRows) || maxRows < 1) throw new Error('Maximalt radantal måste vara ett positivt heltal');
  const limited = matches.map((match) => ({ ...match }));
  while (calculateRows(limited) > maxRows) {
    const candidates = limited.flatMap((match, index) => {
      if (match.systemTip.length < 2) return [];
      const signs = [...match.systemTip] as BaseSign[];
      const removable = signs.filter((sign) => sign !== match.consensusSign);
      const pool = removable.length ? removable : signs;
      const remove = pool.sort((a, b) => match.support[a] - match.support[b] || order(b) - order(a))[0];
      return [{ index, remove, support: match.support[remove] / match.ballots.length, nextRows: calculateRows(limited) / signs.length * (signs.length - 1) }];
    });
    if (!candidates.length) break;
    const withinBudget = candidates.filter((candidate) => candidate.nextRows <= maxRows);
    const candidate = (withinBudget.length ? withinBudget : candidates).sort((a, b) => a.support - b.support || b.nextRows - a.nextRows || a.index - b.index)[0];
    limited[candidate.index].systemTip = asTip(([...limited[candidate.index].systemTip] as BaseSign[]).filter((sign) => sign !== candidate.remove));
  }
  return limited;
}
