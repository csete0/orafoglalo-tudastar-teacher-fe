export type LeaderboardCategory = 'quiz' | 'exam';
export type LeaderboardPeriod = 'weekly' | 'monthly' | 'alltime';

export interface LeaderboardEntryDto {
  rank: number;
  nickname: string;
  /** UI-UX-T7: a valódi név - a backend KIZÁRÓLAG tanári/igazgatói hívónak tölti ki. */
  realName?: string | null;
  avatarUrl?: string;
  score: number;
  isCurrentUser: boolean;
  featuredBadgeUrl?: string;
  featuredBadgeName?: string;
}

export interface CurrentUserRankDto {
  rank: number;
  score: number;
  nextRivalNickname?: string;
  pointsToNextRival?: number;
}

export interface LeaderboardResponseDto {
  topEntries: LeaderboardEntryDto[];
  nearbyEntries: LeaderboardEntryDto[];
  currentUser?: CurrentUserRankDto;
}
