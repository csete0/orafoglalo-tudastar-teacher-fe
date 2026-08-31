/**
 * Tanári kvíz-szerkesztés modelljei.
 *
 * A backend `TeacherQuizDtos.cs`-ének tükre. A kérdéstípusok és a visszajelzési mód
 * SZÁNDÉKOSAN string-unió és nem enum: a backend is string-konstansokat használ
 * (DB-oldali CHECK-constraint őrzi), így egy későbbi típus felvétele itt sem igényel
 * séma- vagy enum-átalakítást.
 */

export type QuizQuestionType = 'single' | 'multi' | 'cloze';

export type QuizFeedbackMode = 'immediate' | 'after' | 'none';

/** `null` = nem érettségi témakör. Az emelt szint tartalmazza a középszintűt. */
export type QuizExamLevel = 'kozep' | 'emelt' | null;

export type QuizDifficulty = 'Easy' | 'Medium' | 'Hard';

export interface TeacherQuizDto {
  id: number;
  title: string;
  description?: string | null;
  isPublished: boolean;
  takedownAt?: string | null;
  takedownReason?: string | null;
  examLevel?: QuizExamLevel;
  questionCount: number;
  /** Jóvá nem hagyott (AI-generált) kérdések száma - amíg nem nulla, a kvíz nem publikálható. */
  pendingQuestionCount: number;
  assignedGroupCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TeacherQuizDetailDto extends TeacherQuizDto {
  feedbackMode: QuizFeedbackMode;
  secondsPerQuestion?: number | null;
  maxAttempts?: number | null;
  shuffleQuestions: boolean;
  allowLateSubmission: boolean;
  questions: TeacherQuizQuestionDto[];
  assignments: TeacherQuizAssignmentDto[];
}

export interface TeacherQuizQuestionDto {
  id: number;
  topicId: number;
  topicName: string;
  questionType: QuizQuestionType;
  questionText: string;
  /** Hiányos kitöltésnél üres - ott a diák szabadon gépel. */
  options: string[];
  correctAnswers: string[];
  explanation?: string | null;
  difficulty: QuizDifficulty;
  displayOrder?: number | null;
  secondsLimit?: number | null;
  isApproved: boolean;
  isAiGenerated: boolean;
}

/**
 * Egy közös AI-bankbeli kérdés keresési találata (UI-UX: "meglévő kérdés hozzáadása" a
 * szerkesztőben) - kevesebb mezőt ad vissza, mint a TeacherQuizQuestionDto, mert ez a
 * kérdés még nincs a tanár kvízéhez kötve (nincs displayOrder/isApproved).
 */
export interface QuizBankQuestionDto {
  id: number;
  topicId: number;
  topicName: string;
  questionType: QuizQuestionType;
  questionText: string;
  options: string[];
  correctAnswers: string[];
  explanation?: string | null;
  difficulty: QuizDifficulty;
}

export interface TeacherQuizAssignmentDto {
  id: number;
  groupId: number;
  groupName: string;
  assignedAt: string;
  opensAt?: string | null;
  dueAt?: string | null;
  revokedAt?: string | null;
}

// ── Kérések ───────────────────────────────────────────────────

export interface CreateTeacherQuizRequest {
  title: string;
  description?: string | null;
  feedbackMode: QuizFeedbackMode;
  secondsPerQuestion?: number | null;
  maxAttempts?: number | null;
  shuffleQuestions: boolean;
  allowLateSubmission: boolean;
  examLevel?: QuizExamLevel;
}

export interface CreateTeacherQuizQuestionRequest {
  topicId: number;
  questionType: QuizQuestionType;
  questionText: string;
  options: string[];
  correctAnswers: string[];
  explanation?: string | null;
  difficulty: QuizDifficulty;
  secondsLimit?: number | null;
  displayOrder?: number | null;
}

export interface AssignTeacherQuizRequest {
  groupId: number;
  opensAt?: string | null;
  dueAt?: string | null;
}

export interface GenerateTeacherQuizQuestionsRequest {
  topicId: number;
  count: number;
  difficulty: QuizDifficulty;
}

// ── Témakörök (a diák-oldali /quiz/topics végpontról) ─────────

export interface QuizTopicOptionDto {
  id: number;
  name: string;
  category?: string | null;
}

export interface QuizTopicGroupDto {
  category: string;
  topics: QuizTopicOptionDto[];
}

// ── Megjelenítési segédek ─────────────────────────────────────

export const QUIZ_QUESTION_TYPE_LABELS: Record<QuizQuestionType, string> = {
  single: 'Egyválasztós',
  multi: 'Többválasztós',
  cloze: 'Hiányos kitöltés',
};

export const QUIZ_FEEDBACK_MODE_LABELS: Record<QuizFeedbackMode, string> = {
  immediate: 'Azonnal, kérdésenként',
  after: 'Csak a kvíz végén',
  none: 'A diák nem látja a megoldást',
};

export const QUIZ_DIFFICULTY_LABELS: Record<QuizDifficulty, string> = {
  Easy: 'Könnyű',
  Medium: 'Közepes',
  Hard: 'Nehéz',
};

// ── Eredmények ────────────────────────────────────────────────

export interface TeacherQuizResultsDto {
  quizId: number;
  title: string;
  questionCount: number;
  assignedStudentCount: number;
  completedStudentCount: number;
  averageScorePercent?: number | null;
  students: TeacherQuizStudentResultDto[];
  questions: TeacherQuizQuestionStatDto[];
}

export interface TeacherQuizStudentResultDto {
  userId: number;
  name: string;
  groupName: string;
  attemptCount: number;
  bestScore?: number | null;
  totalQuestions: number;
  lastCompletedAt?: string | null;
  hasInProgress: boolean;
  completedLate: boolean;
  /** Befejezett ÉLŐ (Kahoot-módú) kitöltések száma a szűrt nézetben. */
  liveAttemptCount: number;
  /** A beszámított legjobb próbálkozás módja - ebből lesz az "Élő" jelvény. */
  bestScoreMode?: 'solo' | 'live' | null;
  /** A legjobb élő kitöltés sebesség+streak pontszáma. */
  bestLivePoints?: number | null;
  /**
   * UI-TT-223: a bestLivePoints-ot adó UGYANAZON élő session helyes válaszai/kérdésszáma -
   * enélkül a felület a legjobb élő pontszámot a legjobb ARÁNYÚ (esetleg önálló)
   * próbálkozás mellé írta ki, egy sosem megtörtént kombinációt sugallva.
   */
  bestLiveCorrectAnswers?: number | null;
  bestLiveTotalQuestions?: number | null;
}

/** Az eredmény-nézet forrás-szűrője. */
export type QuizResultsMode = 'all' | 'live' | 'solo';

/** UI-UX-T3: egy csoport aktív kvíz-kiadása a csoport-oldal "Kiadva" füléhez. */
export interface TeacherGroupAssignmentDto {
  assignmentId: number;
  quizId: number;
  quizTitle: string;
  questionCount: number;
  assignedAt: string;
  opensAt?: string | null;
  dueAt?: string | null;
  completedMemberCount: number;
  memberCount: number;
  hasActiveLiveRoom: boolean;
  activeKahootSessionId?: number | null;
}

/** Kérdésenkénti item-analízis - ez mondja meg, MIT kell újra elmagyarázni. */
export interface TeacherQuizQuestionStatDto {
  questionId: number;
  displayOrder?: number | null;
  questionText: string;
  questionType: QuizQuestionType;
  answerCount: number;
  correctCount: number;
  correctPercent?: number | null;
  /** A leggyakoribb hibás válasz - ebből derül ki, milyen tévhit él a csoportban. */
  mostCommonWrongAnswer?: string | null;
  mostCommonWrongAnswerCount: number;
}
