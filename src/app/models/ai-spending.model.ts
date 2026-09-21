/** AI-KOLTES-PULT: a backend AiRequestLog/QuizQuestionMaintenanceRun DTO-inak tükrei. */

export const AI_SOURCES = [
  { key: 'chat', label: 'AI Mentor (diák chat)', color: 'var(--series-chat)' },
  { key: 'grading', label: 'Vizsga AI-értékelés', color: 'var(--series-grading)' },
  { key: 'error', label: 'Hiba keresése', color: 'var(--series-error)' },
  { key: 'studyplan', label: 'Tanulási terv (automata)', color: 'var(--series-studyplan)' },
  { key: 'quizgen', label: 'Kvíz-generálás (tanári)', color: 'var(--series-quizgen)' },
  { key: 'maint', label: 'Kvíz-karbantartás', color: 'var(--series-maint)' },
  { key: 'dailychallenge', label: 'Napi kihívás (automata)', color: 'var(--series-dailychallenge)' },
] as const;

export type AiSourceKey = (typeof AI_SOURCES)[number]['key'];

export function sourceLabel(key: string): string {
  return AI_SOURCES.find((s) => s.key === key)?.label ?? key;
}

export function sourceColor(key: string): string {
  return AI_SOURCES.find((s) => s.key === key)?.color ?? 'var(--color-text-muted)';
}

export interface AiSpendingDayDto {
  date: string;
  bySource: Record<string, number>;
}

export interface AiSpendingSourceTotalDto {
  source: string;
  totalUsd: number;
}

export interface AiSpendingOverviewDto {
  dailyBySource: AiSpendingDayDto[];
  monthTotalsBySource: AiSpendingSourceTotalDto[];
  todayTotalUsd: number;
  monthTotalUsd: number;
  myOwnMonthUsd: number;
  automationMonthUsd: number;
}

/** Az OpenRouter fiók TELJES (nem forrásonkénti) fennmaradó kredit-egyenlege. */
export interface OpenRouterCreditsDto {
  totalCredits: number;
  totalUsage: number;
  remainingCredits: number;
}

export interface AiSpendingTopSpenderDto {
  userId: number;
  userName: string;
  requestCount: number;
  totalUsd: number;
}

export interface AiRequestLogDto {
  id: number;
  createdAt: string;
  userId: number;
  userName: string;
  source: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number | null;
}

export interface AiRequestLogPageDto {
  items: AiRequestLogDto[];
  totalCount: number;
}

export interface AiRequestLogFilter {
  source?: string;
  userQuery?: string;
  fromDate?: string;
  toDate?: string;
}

export interface QuizMaintenanceEstimateRequest {
  rangeStartId?: number | null;
  rangeEndId?: number | null;
  model: string;
}

export interface QuizMaintenanceEstimateDto {
  candidateCount: number;
  estimatedCostUsd: number;
}

export interface QuizMaintenanceRunRequest {
  rangeStartId?: number | null;
  rangeEndId?: number | null;
  model?: string | null;
  dryRun: boolean;
}

export interface QuizMaintenanceRunStartedDto {
  runId: string;
  candidatesReviewed: number;
  dryRun: boolean;
}

export interface QuizMaintenanceRunDto {
  id: string;
  startedAt: string;
  completedAt: string | null;
  triggeredByUserId: number | null;
  triggeredByName: string | null;
  rangeStartId: number | null;
  rangeEndId: number | null;
  model: string;
  dryRun: boolean;
  candidatesReviewed: number;
  estimatedCostUsd: number | null;
}

export interface QuizMaintenanceRunPageDto {
  items: QuizMaintenanceRunDto[];
  totalCount: number;
}

export const MAINTENANCE_ACTION_LABELS: Record<string, string> = {
  Fixed: 'Javítva',
  Deactivated: 'Inaktiválva',
  FlaggedForTeacher: 'Tanárnak jelölve',
  ReplacementAdded: 'Helyettesítő hozzáadva',
  NoAction: 'Nincs teendő',
};

export const MAINTENANCE_ACTION_BADGES: Record<string, string> = {
  Fixed: 'badge-success',
  Deactivated: 'badge-danger',
  FlaggedForTeacher: 'badge-warning',
  ReplacementAdded: 'badge-primary',
  NoAction: 'badge-neutral',
};

export interface QuizMaintenanceDecisionDto {
  questionId: number;
  action: string;
  oldQuestionText: string | null;
  newQuestionText: string | null;
  oldCorrectAnswer: string | null;
  newCorrectAnswer: string | null;
  reasoning: string | null;
  isTeacherOwned: boolean;
  teacherName: string | null;
}

export interface QuizMaintenanceMergeRequest {
  keepQuestionId: number;
  duplicateQuestionId: number;
}

export interface QuizMaintenanceMergeResultDto {
  teacherNotified: boolean;
}

export interface AutomationStatusDto {
  key: string;
  lastRunAt: string | null;
  lastRunCostUsd: number | null;
  scheduleDescription: string;
}
