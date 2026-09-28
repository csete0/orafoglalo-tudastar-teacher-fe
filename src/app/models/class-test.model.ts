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
