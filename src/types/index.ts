export type Sign = '1' | 'X' | '2';
export type Tip = '1' | 'X' | '2' | '1X' | 'X2' | '12' | '1X2';
export type Classification = 'strong' | 'consensus' | 'disagreement' | 'coverage';
export interface Ballot { expertId: string; expert: string; source: 'rekatochklart' | 'bettingstugan' | 'understreckat' | 'tipsmedoss'; sourceUrl: string; tip: Tip; }
export interface Match { matchNumber: number; homeTeam: string; awayTeam: string; ballots: Ballot[]; support: Record<Sign, number>; classification: Classification; consensusSign?: Sign; systemTip: Tip; publicDistribution?: Record<Sign, number>; odds?: Record<Sign, number>; expertDeviation?: { sign: Sign; difference: number }; }
export interface SourceStatus { status: 'OK' | 'ERROR'; updatedAt: string; lastSuccessfulUpdate?: string; message?: string; count?: number; }
export interface LatestRunStatus { at: string; published: boolean; roundDate: string; statuses: Record<string, SourceStatus>; reason?: string; }
export interface Round { roundDate: string; updatedAt: string; status: 'ok' | 'partial'; officialOnly?: boolean; matches: Match[]; sources: Record<string, SourceStatus>; expertCount: number; systemRows: number; publicDistribution: null; highChaparral?: { tips: Tip[]; rows: number; pivots: number[]; singleRow?: Sign[]; estimatedOdds?: number }; }
export interface AliasCandidate { source: Ballot['source']; matchNumber: number; alias: string; canonical: string; }
export interface AliasReview { status: 'pending' | 'approved' | 'none'; updatedAt: string; roundDate?: string; candidates: AliasCandidate[]; }
export interface ExpertStat { expertId: string; expert: string; source: Ballot['source']; rounds: number; matches: number; coveredHits: number; precisionPoints: number; singlePicks: number; singleHits: number; }
export interface ExpertStats { updatedAt: string; settledRounds: number; lastRoundDate: string; experts: ExpertStat[]; }
export type Participant = 'Jocke' | 'Tony' | 'Gustav' | 'Anders' | 'Matta-Råsnygg' | 'Christer';
export interface SystemResult { maxCorrect: number; winningRows: Record<string, number>; payout: number; }
export interface OfficialResult { roundDate: string; drawNumber: number; outcomes: Sign[]; payouts: Partial<Record<'10' | '11' | '12' | '13', number>>; }
export interface ChallengerTip {
  participant: Participant; base: 'expert' | 'chaparral' | 'blank'; originalTips?: Tip[]; finalTips?: Tip[];
  rows: number; cost: number; lockedAt?: { toDate: () => Date }; result?: SystemResult;
}
export interface ClaimRound {
  roundDate: string; drawNumber: number; status: 'unclaimed' | 'claimed' | 'locked' | 'settled'; participant?: Participant;
  base?: 'expert' | 'chaparral'; originalTips?: Tip[]; finalTips?: Tip[]; rows?: number; cost?: number;
  lockAt?: { toDate: () => Date }; result?: SystemResult; officialResult?: OfficialResult; challengers?: Partial<Record<Participant, ChallengerTip>>;
}
export interface LiveMatch {
  matchNumber: number; homeTeam: string; awayTeam: string; matchStart: string; status: string; statusId: number;
  sportEventStatus: string; cancelled: boolean; homeScore?: number; awayScore?: number; currentSign?: Sign;
}
export interface LiveStatus {
  roundDate: string; drawNumber: number; updatedAt: string; started: boolean; active: boolean; complete: boolean; matches: LiveMatch[];
}
