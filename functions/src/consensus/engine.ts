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

const price = (match: ConsensusMatch, sign: BaseSign): number => match.odds?.[sign] ?? (match.publicDistribution?.[sign] ? 100 / match.publicDistribution[sign] : 1);

export function buildHighChaparral(matches: ConsensusMatch[], maxRows = 300, minPivots = 6): { tips: Tip[]; rows: number; pivots: number[]; singleRow: BaseSign[]; estimatedOdds?: number } {
  const baselines = matches.map((match) => match.consensusSign ?? [...SIGNS].sort((a, b) => match.support[b] - match.support[a] || order(a) - order(b))[0]);
  const candidates = matches.flatMap((match, index) => {
    if (match.classification === 'strong') return [];
    const baseline = baselines[index];
    const alternative = [...SIGNS].filter((sign) => sign !== baseline && match.support[sign] > 0).sort((a, b) => price(match, b) - price(match, a) || match.support[b] - match.support[a] || order(a) - order(b))[0];
    if (!alternative) return [];
    return [{ index, alternative, valueLift: price(match, alternative) / price(match, baseline), support: match.support[alternative] / match.ballots.length }];
  }).sort((a, b) => b.valueLift - a.valueLift || b.support - a.support || a.index - b.index);
  const higherPriced = candidates.filter((candidate) => candidate.valueLift > 1).length;
  const opportunities = candidates.slice(0, Math.min(candidates.length, Math.max(Math.max(0, minPivots), higherPriced)));
  const primary = [...baselines]; opportunities.forEach(({ index, alternative }) => { primary[index] = alternative; });
  type Option = { tip: Tip; quality: number };
  const options: Option[][] = matches.map((match, index) => {
    if (match.classification === 'strong') return [{ tip: primary[index] as Tip, quality: price(match, primary[index]) }];
    const ordered = [primary[index], ...SIGNS.filter((sign) => sign !== primary[index] && match.support[sign] > 0).sort((a, b) => price(match, b) - price(match, a) || match.support[b] - match.support[a] || order(a) - order(b))];
    return ordered.map((_, width) => { const signs = ordered.slice(0, width + 1); return { tip: asTip(signs), quality: signs.reduce((sum, sign) => sum + price(match, sign), 0) }; });
  });
  let states = new Map<number, { tips: Tip[]; quality: number }>([[1, { tips: [], quality: 0 }]]);
  options.forEach((matchOptions) => {
    const next = new Map<number, { tips: Tip[]; quality: number }>();
    states.forEach((state, rows) => matchOptions.forEach((option) => {
      const nextRows = rows * option.tip.length; if (nextRows > maxRows) return;
      const candidate = { tips: [...state.tips, option.tip], quality: state.quality + option.quality };
      if (!next.has(nextRows) || candidate.quality > next.get(nextRows)!.quality) next.set(nextRows, candidate);
    }));
    states = next;
  });
  const rows = Math.max(...states.keys()); const tips = states.get(rows)!.tips;
  const allOddsAvailable = matches.every((match, index) => Number.isFinite(match.odds?.[primary[index]]));
  const estimatedOdds = allOddsAvailable ? Number(matches.reduce((total, match, index) => total * match.odds![primary[index]], 1).toFixed(2)) : undefined;
  return { tips, rows, pivots: opportunities.map(({ index }) => matches[index].matchNumber), singleRow: primary, estimatedOdds };
}
