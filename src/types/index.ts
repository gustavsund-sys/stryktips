export type Sign = '1' | 'X' | '2';
export type Tip = '1' | 'X' | '2' | '1X' | 'X2' | '12' | '1X2';
export type Classification = 'strong' | 'consensus' | 'disagreement' | 'coverage';
export interface Ballot { expertId: string; expert: string; source: 'rekatochklart' | 'bettingstugan' | 'understreckat' | 'tipsmedoss'; sourceUrl: string; tip: Tip; }
export interface Match { matchNumber: number; homeTeam: string; awayTeam: string; ballots: Ballot[]; support: Record<Sign, number>; classification: Classification; consensusSign?: Sign; systemTip: Tip; publicDistribution?: Record<Sign, number>; odds?: Record<Sign, number>; expertDeviation?: { sign: Sign; difference: number }; }
export interface SourceStatus { status: 'OK' | 'ERROR'; updatedAt: string; lastSuccessfulUpdate?: string; message?: string; count?: number; }
export interface LatestRunStatus { at: string; published: boolean; roundDate: string; statuses: Record<string, SourceStatus>; reason?: string; }
export interface Round { roundDate: string; updatedAt: string; status: 'ok' | 'partial'; matches: Match[]; sources: Record<string, SourceStatus>; expertCount: number; systemRows: number; publicDistribution: null; highChaparral?: { tips: Tip[]; rows: number; pivots: number[]; singleRow?: Sign[]; estimatedOdds?: number }; }
export interface AliasCandidate { source: Ballot['source']; matchNumber: number; alias: string; canonical: string; }
export interface AliasReview { status: 'pending' | 'approved' | 'none'; updatedAt: string; roundDate?: string; candidates: AliasCandidate[]; }
