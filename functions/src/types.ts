export const SIGNS = ['1', 'X', '2'] as const;
export type BaseSign = (typeof SIGNS)[number];
export type Tip = '1' | 'X' | '2' | '1X' | 'X2' | '12' | '1X2';
export type SourceId = 'rekatochklart' | 'bettingstugan' | 'understreckat' | 'tipsmedoss' | 'tipper';

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
  xStats?: XStatsData;
}

export type XStatsMetricName = 'xp' | 'points' | 'xpPointsDiff' | 'expectedTablePosition' | 'tablePosition' | 'xG' | 'xGC' | 'averageScored' | 'averageConceded' | 'averageScoredBetween' | 'averageScoredHomeAndAway';
export interface XStatsPeriod { homeTeam: string; awayTeam: string; metrics: Partial<Record<XStatsMetricName, { home: number; away: number }>>; }
export interface XStatsData { matchId: string; source: 'PlaymakerAI'; sourceUrl: string; updatedAt: string; entireSeason?: XStatsPeriod; lastFiveGames?: XStatsPeriod; }

export interface OfficialMatch {
  matchNumber: number; homeTeam: string; awayTeam: string;
  distribution: Record<BaseSign, number>; odds?: Record<BaseSign, number>;
  xStatsMatchId?: string; xStats?: XStatsData;
}
export interface OfficialCoupon { roundDate: string; drawNumber: number; officialRoundId: string; regCloseTime: string; updatedAt: string; matches: OfficialMatch[]; sourceUrl: string; }

export interface SourceStatus { status: 'OK' | 'ERROR'; updatedAt: string; lastSuccessfulUpdate?: string; message?: string; count?: number; }
export interface RoundDocument {
  roundDate: string; updatedAt: string; status: 'ok' | 'partial'; matches: ConsensusMatch[];
  sources: Record<string, SourceStatus>; expertCount: number; systemRows: number;
  publicDistribution: null; highChaparral: { tips: Tip[]; rows: number; pivots: number[]; singleRow: BaseSign[]; estimatedOdds?: number };
  officialRoundId?: string; drawNumber?: number; regCloseTime?: string; officialMatches?: OfficialMatch[]; officialFingerprint?: string;
  officialOnly?: boolean;
  xStatsCoverage?: number;
}

export interface OfficialResult { roundDate: string; drawNumber: number; outcomes: BaseSign[]; payouts: Partial<Record<10 | 11 | 12 | 13, number>>; }
export interface ExpertStat {
  expertId: string; expert: string; source: SourceId; rounds: number; matches: number;
  coveredHits: number; precisionPoints: number; singlePicks: number; singleHits: number;
}
export interface ExpertStatsDocument { updatedAt: string; settledRounds: number; lastRoundDate: string; experts: ExpertStat[]; }
