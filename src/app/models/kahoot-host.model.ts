// ════════════════════════════════════════════════════════════════
// Élő (Kahoot-módú) játék host-oldali modelljei - a backend KahootDtos.cs
// tükrei. A diák-app saját másolatot tart (külön repó) - a szerződés a
// backend DTO-készlete.
// ════════════════════════════════════════════════════════════════

export type KahootStatus = 'lobby' | 'question' | 'reveal' | 'finished' | 'cancelled';

/** Szoba-fejléc: a POST /teacher/quizzes/{id}/kahoot-sessions válasza. */
export interface KahootRoomDto {
  kahootSessionId: number;
  quizId: number;
  quizTitle: string;
  groupId: number;
  groupName: string;
  joinCode: string | null;
  status: KahootStatus;
  questionCount: number;
  createdAt: string;
}

export interface KahootLiveQuestionDto {
  index: number;
  total: number;
  questionId: number;
  questionText: string;
  questionType: 'single' | 'multi' | 'cloze';
  options: string[];
  secondsLimit: number;
  startedAtUtc: string;
  endsAtUtc: string;
}

export interface KahootLeaderboardEntryDto {
  userId: number;
  name: string;
  totalPoints: number;
  correctAnswers: number;
  rank: number;
}

export interface KahootRoomSnapshotDto {
  kahootSessionId: number;
  status: KahootStatus;
  quizTitle: string;
  groupName: string;
  /** A hostnak mindig kitöltve - kivetítésre. */
  joinCode: string | null;
  questionCount: number;
  currentQuestionIndex: number;
  currentQuestion: KahootLiveQuestionDto | null;
  participantCount: number;
  participantNames: string[];
  leaderboard: KahootLeaderboardEntryDto[];
  /**
   * BE-KAHOOT-HOST-RECONNECT-ANSWEREDCOUNT-RESETS-TO-ZERO: az "N/M válaszolt" számláló
   * korábban csak a push-eseményen (KahootAnswerReceivedDto) keresztül frissült - egy
   * host-reconnect hamisan 0-ra esett vissza a következő beküldésig. Csak `question`
   * státuszban van értelme, más állapotban 0.
   */
  answeredCount: number;
  isHost: boolean;
}

export interface KahootOptionCountDto {
  option: string;
  count: number;
}

export interface KahootQuestionClosedDto {
  questionIndex: number;
  questionId: number;
  correctAnswers: string[];
  explanation: string | null;
  optionCounts: KahootOptionCountDto[];
  answerCount: number;
  participantCount: number;
  top: KahootLeaderboardEntryDto[];
}

export interface KahootGameEndedDto {
  kahootSessionId: number;
  leaderboard: KahootLeaderboardEntryDto[];
}

export interface KahootGameSummaryDto {
  kahootSessionId: number;
  status: KahootStatus;
  groupName: string;
  createdAt: string;
  finishedAt: string | null;
  participantCount: number;
  podium: KahootLeaderboardEntryDto[];
}

export interface KahootParticipantEventDto {
  name: string;
  participantCount: number;
}

export interface KahootAnswerReceivedDto {
  answeredCount: number;
  participantCount: number;
}

/** A host-képernyő fázisai. */
export type KahootHostPhase =
  | 'idle'
  | 'connecting'
  | 'lobby'
  | 'question'
  | 'reveal'
  | 'ended'
  | 'error';
