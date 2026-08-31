export interface StudentActivitySummaryDto {
  userId: number;
  name: string;
  nickname?: string;
  completedExamsCount: number;
  averageExamScorePercent?: number;
  totalExamTimeSpentSeconds: number;
  completedQuizSessionsCount: number;
  quizAccuracyPercent?: number;
  currentStreak: number;
  longestStreak: number;
  badgeCount: number;
}

export interface StudentExamSessionDto {
  sessionId: number;
  taskSetId: number;
  taskSetTitle: string;
  startedAt: string;
  // BE-STUDENTACTIVITY-FILTER-DISPLAY-DATE-MISMATCH: az "Egyéni időszak" szűrő a
  // befejezés (submittedAt) idejére szűr - a táblázat "Dátum" oszlopa ezért ezt,
  // nem a startedAt-ot jeleníti meg, különben egy hosszan elhúzódó session
  // kijelzett dátuma a szűrt tartományon messze kívül eshet.
  submittedAt?: string;
  isCompleted: boolean;
  scorePercent?: number;
  timeSpentSeconds: number;
}

export interface StudentActivityDetailDto extends StudentActivitySummaryDto {
  recentExams: StudentExamSessionDto[];
  /** UI-UX-T9: a kvíz-előzmény móddal (élő/önálló) és játék-ponttal. */
  recentQuizzes: StudentQuizSessionDto[];
  /** UI-UX-T9: a diák csoporttagságai - a KÉRŐ tanár látókörére szűkítve. */
  groups: StudentGroupRefDto[];
}

export interface StudentGroupRefDto {
  groupId: number;
  name: string;
}

export interface StudentQuizSessionDto {
  sessionId: number;
  quizTitle?: string | null;
  topics: string[];
  totalQuestions: number;
  correctAnswers: number;
  successRate: number;
  completedAt?: string | null;
  mode: 'solo' | 'live';
  totalPoints: number;
}

export interface TeacherTaskColumnDto {
  taskId: number;
  title: string;
  maxPoints: number;
  taskOrder: number;
}

export interface TaskResultCellDto {
  taskId: number;
  /**
   * A cellához tartozó beadás (`ExamTaskAttempt`) azonosítója; hiányzik, ha a diák
   * hozzá sem kezdett ehhez a feladathoz. Enélkül a cella SEMMILYEN azonosítót nem
   * hordozott, így a tanári értékelő panel nem tudott megcímezni egy konkrét beadást.
   */
  attemptId?: number;
  isCompleted: boolean;
  earnedPoints?: number;
  maxPoints?: number;
  /** Igaz, ha a pontszámot tanár bírálta felül. */
  isOverridden: boolean;
}

export interface StudentTaskSetResultRowDto {
  userId: number;
  name: string;
  hasSession: boolean;
  isCompleted: boolean;
  totalEarnedPoints?: number;
  totalMaxPoints?: number;
  taskResults: TaskResultCellDto[];
}

export interface TeacherTaskSetResultsDto {
  taskSetId: number;
  title: string;
  tasks: TeacherTaskColumnDto[];
  students: StudentTaskSetResultRowDto[];
}

/**
 * Egy diák egy vizsgafeladat-beadásának tanári értékelő nézete.
 * A backend `TeacherAttemptReviewDto` párja — a mezőneveknek egyeznie kell vele.
 */
export interface TeacherAttemptReviewDto {
  attemptId: number;
  taskId: number;
  taskTitle: string;
  studentUserId: number;
  studentDisplayName: string;

  /** Az érvényes (effektív) pontszám — felülbírálás után a tanáré. Hiányzik/null = nincs kiértékelve. */
  earnedPoints: number | null;
  /** Az AI eredeti pontja. null = az AI nem értékelt (token-limit vagy hiba). */
  aiEarnedPoints: number | null;
  maxPoints: number;
  /** null, ha nincs pontszám vagy nincs nevező — sosem 0. Ld. EXAM-11/EXAM-16. */
  scorePercent: number | null;

  aiFeedback: string | null;
  aiStrengths: string | null;
  aiWeaknesses: string | null;
  aiScoredAt: string | null;
  aiModel: string | null;

  studentCode: string | null;

  teacherFeedback: string | null;
  reviewedAt: string | null;
  reviewedByTeacherName: string | null;
  isOverridden: boolean;

  // ── Munkafolyamat ──────────────────────────────────────────────────────────
  // NYERS VISELKEDÉSI ADAT, NEM BIZONYÍTÉK. Tilos "csalás-gyanúnak" nevezni, és
  // tilos automatikus gyanú-pontszámot vagy címkét képezni belőle: egy gyors
  // beadás lehet felkészültség, egy hosszú szünet lehet gondolkodás vagy egy
  // megzavaró tanterem. A felület MUTASSA az adatot, a következtetést hagyja a
  // tanárra — egy "gyanús" címke téves vádhoz vezethet egy valós diák ellen.
  timeSpentSeconds: number;
  visitCount: number;
  /** Megnézte-e a mintamegoldást a vizsga alatt (null = nem). */
  solutionViewedAt: string | null;
  cheatsheetOpenCount: number;
  runCount: number;
  successfulRunCount: number;
  failedRunCount: number;
}

/** Tanári pont-felülbírálás kérése. Legalább az egyik mező kötelező. */
export interface TeacherScoreOverrideRequest {
  /** null = a pontszám marad, csak szöveges értékelés érkezik. */
  earnedPoints: number | null;
  /** Csak akkor kerül alkalmazásra, ha `feedbackProvided` true. */
  teacherFeedback: string | null;
  /**
   * BE-TEACHERATTEMPTREVIEW-OVERRIDE-FEEDBACK-LOST-UPDATE: a `teacherFeedback` önmagában
   * nem tudja megkülönböztetni "a tanár nem is nyúlt ehhez a mezőhöz, hagyd változatlanul"
   * és "szándékosan üresre törölte" eseteket - mindkettő `null`-lá egyszerűsödne. Ez a
   * mező explicit jelzi a szándékot: `false` esetén a `teacherFeedback` TELJESEN
   * figyelmen kívül marad a backendben (a meglévő érték érintetlen).
   */
  feedbackProvided: boolean;
}
