import { AiHelperQuotaItemDto } from '../shared/ai-helper-quota.util';

// Dolgozat mód (tanári áttekintő) - a backend ClassTestOverviewDto párja.

export interface ClassTestTask {
  taskId: number;
  title: string;
  maxPoints: number;
}

export interface ClassTestCell {
  taskId: number;
  attemptId: number | null;
  earnedPoints: number | null;
  maxPoints: number;
  isOverridden: boolean;
}

export type ClassTestStudentStatus = 'not_started' | 'in_progress' | 'submitted';

export interface ClassTestStudentRow {
  userId: number;
  name: string;
  /** Kilépett / kikerült a csoportból: a tagként beadott dolgozata csak olvasható. Régebbi BE-n hiányzik. */
  leftGroup?: boolean;
  status: ClassTestStudentStatus;
  examSessionId: number | null;
  startedAt: string | null;
  submittedAt: string | null;
  remainingSeconds: number | null;
  timeLimitReached: boolean;
  earnedPoints: number | null;
  maxPoints: number | null;
  needsManualGrading: boolean;
  tasks: ClassTestCell[];
  focusLossCount: number;
  pasteCount: number;
  pastedChars: number;
  /** A tanár egész dolgozatra szóló szöveges visszajelzése (a diák a közzététel után látja). */
  teacherFeedback?: string | null;
}

export interface ClassTestStats {
  notStarted: number;
  inProgress: number;
  submitted: number;
  averagePercent: number | null;
  medianPercent: number | null;
  /** Jegy (1–5) → darab; a szokásos iskolai határokkal: 40 / 55 / 70 / 85%. */
  gradeDistribution: Record<string, number>;
  taskAverages: { taskId: number; averagePercent: number | null }[];
}

export interface ClassTestOverview {
  assignmentId: number;
  taskSetId: number;
  taskSetTitle: string;
  groupId: number;
  groupName: string;
  opensAt: string;
  dueAt: string;
  timeLimitSeconds: number;
  resultsPublishedAt: string | null;
  serverNow: string;
  /** A határidő + a beadási türelmi idő: ettől tehető közzé (addig a rendszer még beadhat dolgozatot). */
  publishableAt: string;
  canPublish: boolean;
  tasks: ClassTestTask[];
  students: ClassTestStudentRow[];
  stats: ClassTestStats;
  aiGradedThisMonth: number;
  aiMonthlyLimit: number;
}

// ── Visszajelzés MI-vázlattal (feedback-drafts) és tömeges mentés ──

/** Egy kérésben legfeljebb ennyi diák vázlata kérhető (BE: MaxStudentsPerRequest). */
export const FEEDBACK_DRAFT_BATCH = 60;
/** Egy mentésben legfeljebb ennyi tétel (BE). */
export const FEEDBACK_SAVE_BATCH = 200;
/** Egy visszajelzés legfeljebb ennyi karakter (BE). */
export const FEEDBACK_MAX_CHARS = 2000;

/**
 * ready: kész vázlat; failed: nem lett ellenőrzött vázlat (reason); pending: nem fért bele az időkeretbe (újra kérhető);
 * skipped: nem kérhető (pl. nincs beadva, kézi pontozásra vár - reason).
 */
export type FeedbackDraftStatus = 'ready' | 'failed' | 'pending' | 'skipped';

export interface ClassTestFeedbackDraftDto {
  userId: number;
  studentName: string;
  /** A mentés kulcsa. */
  examSessionId: number | null;
  status: FeedbackDraftStatus;
  draft: string | null;
  reason: string | null;
  earnedPoints: number | null;
  maxPoints: number | null;
  /** A már elmentett visszajelzés, ha van. */
  savedFeedback: string | null;
}

export interface ClassTestFeedbackDraftsDto {
  assignmentId: number;
  model: string;
  items: ClassTestFeedbackDraftDto[];
  /** Az időkeretből kimaradt diákok - ezekkel kell újra hívni. */
  pendingUserIds: number[];
  /** A havi keret a kérés után (egy egység = egy diák vázlata). */
  quota?: AiHelperQuotaItemDto;
}

export interface ClassTestFeedbackItem {
  examSessionId: number;
  /** Üres: a meglévő visszajelzés törlése. */
  feedback: string | null;
}

export interface ClassTestFeedbackSaveResultDto {
  saved: number;
  examSessionIds: number[];
  notifiedStudents: number;
}
