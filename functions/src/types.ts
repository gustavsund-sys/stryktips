export const SIGNS = ['1', 'X', '2'] as const;
export type BaseSign = (typeof SIGNS)[number];
export type Tip = '1' | 'X' | '2' | '1X' | 'X2' | '12' | '1X2';
export type SourceId = 'rekatochklart' | 'bettingstugan' | 'understreckat' | 'tipsmedoss';

export interface ExpertPick {
  matchNumber: number;
  homeTeam: string;
  awayTeam: string;
  tip: Tip;
  expert: string;
  source: SourceId;
  sourceUrl: string;
}

export interface ExpertBallot { expertId: string; expert: string; source: SourceId; sourceUrl: string; tip: Tip; }
export type Classification = 'strong' | 'consensus' | 'disagreement' | 'coverage';
export interface ConsensusMatch {
  matchNumber: number; homeTeam: string; awayTeam: string; ballots: ExpertBallot[];
  support: Record<BaseSign, number>; classification: Classification; consensusSign?: BaseSign;
  systemTip: Tip; publicDistribution?: Record<BaseSign, number>; odds?: Record<BaseSign, number>;
  expertDeviation?: { sign: BaseSign; difference: number };
}

export interface OfficialMatch {
  matchNumber: number; homeTeam: string; awayTeam: string;
  distribution: Record<BaseSign, number>; odds?: Record<BaseSign, number>;
}
export interface OfficialCoupon { roundDate: string; drawNumber: number; updatedAt: string; matches: OfficialMatch[]; sourceUrl: string; }

export interface SourceStatus { status: 'OK' | 'ERROR'; updatedAt: string; lastSuccessfulUpdate?: string; message?: string; count?: number; }
export interface RoundDocument {
  roundDate: string; updatedAt: string; status: 'ok' | 'partial'; matches: ConsensusMatch[];
  sources: Record<string, SourceStatus>; expertCount: number; systemRows: number;
  publicDistribution: null; highChaparral: { tips: Tip[]; rows: number; pivots: number[]; estimatedOdds?: number };
}
