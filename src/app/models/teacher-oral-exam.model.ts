import { AiHelperQuotaItemDto } from '../shared/ai-helper-quota.util';

/**
 * Tanári szóbeli (api/teacher/oral-exams – PATRICKS-SZOBELI-VIZSGA-2-FAZIS-MEGVALOSITAS.md, „API-szerződés / Tanár”):
 * szabad téma (MI-vázlat → szerkesztés → jóváhagyás), kiadás csoportnak, eredménynézet, felülpontozás.
 */

export type TeacherOralTopicStatus = 'draft' | 'approved';
export type OralAssignmentMode = 'practice' | 'exam';
export type OralAudience = 'kozep' | 'emelt' | 'technikum' | 'altalanos';

export const ORAL_TOPIC_STATUS_LABELS: Record<TeacherOralTopicStatus, string> = {
  draft: 'Vázlat',
  approved: 'Jóváhagyva',
};

export const ORAL_MODE_LABELS: Record<OralAssignmentMode, string> = {
  practice: 'Gyakorlás',
  exam: 'Szóbeli dolgozat',
};

export const ORAL_AUDIENCE_LABELS: Record<OralAudience, string> = {
  kozep: 'Középszintű érettségi',
  emelt: 'Emelt szintű érettségi',
  technikum: 'Technikum',
  altalanos: 'Általános',
};

/** A munkamenet állapota a tanári táblán (NULL: a diák még nem indított szóbelit). */
export const ORAL_SESSION_STATUS_LABELS: Record<string, string> = {
  prep: 'Felkészül',
  connecting: 'Kapcsolódik',
  live: 'Felel',
  grading: 'Értékelés folyamatban',
  graded: 'Értékelve',
  'not-graded': 'Nem értékelhető',
  abandoned: 'Nem fejezte be',
  aborted: 'Megszakadt',
};

/** A szabad-téma sablon választható felelési hosszai (`content/szobeli/szabad-tema-sablon`): a téma ezek részhalmazát kínálja. */
export const ORAL_TOPIC_VOICE_MINUTE_OPTIONS = [5, 10, 15, 20] as const;

/** A BE-vel azonos korlátok. */
export const ORAL_TOPIC_ITEM_COUNT = { min: 3, max: 10 } as const;
export const ORAL_TOPIC_QUESTIONS_PER_ITEM = { min: 3, max: 5 } as const;
export const ORAL_REVIEW_NOTE_MAX = 1000;

export interface TeacherOralProfileOptionDto {
  slug: string;
  title: string;
  voiceMinuteOptions: number[];
  defaultVoiceMinutes: number;
}

export interface TeacherOralTopicListItemDto {
  id: number;
  title: string;
  status: TeacherOralTopicStatus;
  itemCount: number;
  /** A nem visszavont kiadások száma. */
  assignmentCount: number;
  createdAt: string;
}

export interface TeacherOralQuestionDto {
  text: string;
  expected: string[];
}

export interface TeacherOralItemDto {
  /** A szerver adja (t-1, t-2…); mentéskor a sorrend számít. */
  slug: string | null;
  title: string;
  keywords: string[];
  questions: TeacherOralQuestionDto[];
}

export interface TeacherOralRubricItemDto {
  key: string;
  title: string;
  points: number;
  description: string;
}

export interface TeacherOralTopicDto {
  id: number;
  title: string;
  status: TeacherOralTopicStatus;
  voiceMinuteOptions: number[];
  defaultVoiceMinutes: number;
  items: TeacherOralItemDto[];
  rubric: TeacherOralRubricItemDto[];
  /** Már indult belőle szóbeli: nem szerkeszthető. */
  hasSessions: boolean;
}

export type TeacherOralTopicUpdateRequest = Pick<TeacherOralTopicDto, 'title' | 'voiceMinuteOptions' | 'defaultVoiceMinutes' | 'items' | 'rubric'>;

/** A vázlat-kérés: beillesztett anyag VAGY fájl (.txt/.docx/.pdf). */
export interface TeacherOralDraftRequest {
  text: string | null;
  file: File | null;
  title: string;
  itemCount: number;
  questionsPerItem: number;
  audience: OralAudience;
}

export interface TeacherOralDraftResultDto {
  topic: TeacherOralTopicDto;
  quota: AiHelperQuotaItemDto;
  warnings: string[];
}

/** Kiadás: a saját jóváhagyott téma (`topicId`) VAGY egy platform-profil (`profileSlug`). */
export interface TeacherOralAssignmentRequest {
  topicId: number | null;
  profileSlug: string | null;
  groupId: number;
  mode: OralAssignmentMode;
  voiceMinutes: number;
  opensAt: string | null;
  dueAt: string | null;
}

export interface TeacherOralAssignmentDto {
  id: number;
  topicId: number | null;
  profileSlug: string | null;
  title: string;
  groupId: number;
  groupName: string;
  mode: OralAssignmentMode;
  voiceMinutes: number;
  opensAt: string | null;
  dueAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  resultsPublishedAt: string | null;
  /** Hány diák indított már szóbelit ebből a kiadásból. */
  studentCount: number;
}

export interface TeacherOralResultRowDto {
  userId: number;
  studentName: string;
  sessionId: number | null;
  status: string | null;
  totalPoints: number | null;
  maxPoints: number | null;
  teacherTotalPoints: number | null;
  startedAt: string | null;
  /** Szóbeli dolgozatnál: azóta kilépett a csoportból, de tagként kezdte el - csak olvasható sor. */
  leftGroup?: boolean;
  /** 16 év alatti (vagy ismeretlen korú) diák, akinek a szóbelijéhez még nincs jóváhagyott szülői hozzájárulás - addig nem indíthat. */
  awaitingParentConsent?: boolean;
}

export interface TeacherOralResultsDto {
  assignment: TeacherOralAssignmentDto;
  rows: TeacherOralResultRowDto[];
}

export interface OralCriterionResultDto {
  key: string;
  title: string;
  points: number;
  maxPoints: number;
  reason: string;
  feedbackOnly: boolean;
}

export interface OralQuestionResultDto {
  no: number;
  text: string;
  covered: string[];
  missing: string[];
}

export interface OralTurnDto {
  speaker: 'examiner' | 'student';
  text: string;
  atSeconds: number;
  questionNo: number;
  /** Szakaszos feleletnél a szakasz kulcsa. */
  segment?: string | null;
  /** A vizsgáztató mondatába a diák közbeszólt: csak az elejét hallotta (csak igaz értékkel jön). */
  interrupted?: boolean;
}

export interface OralPrepCodeDto {
  languageId: number;
  languageName: string;
  code: string;
}

export interface OralTeacherCriterionDto {
  key: string;
  points: number;
}

export interface OralTeacherReviewDto {
  totalPoints: number;
  criteria: OralTeacherCriterionDto[];
  note: string | null;
  reviewedAt: string;
}

export interface TeacherOralPlannedQuestionDto {
  no: number;
  text: string;
  expected: string[];
  segment: string | null;
}

/** A kiadó tanár nézete egy munkamenetről (a diák teljes eredménylapja + tanári többlet). */
export interface TeacherOralSessionDto {
  status: string;
  message: string | null;
  totalPoints: number | null;
  maxPoints: number;
  criteria: OralCriterionResultDto[];
  questions: OralQuestionResultDto[];
  strengths: string[];
  gaps: string[];
  practice: string[];
  transcript: OralTurnDto[] | null;
  transcriptDeleted: boolean;
  prepCode: OralPrepCodeDto | null;
  teacher: OralTeacherReviewDto | null;
  sessionId: number;
  student: { userId: number; name: string };
  assignmentId: number | null;
  itemTitle: string;
  plannedQuestions: TeacherOralPlannedQuestionDto[];
  runs: number[][];
  endReason: string | null;
  costUsd: number;
}

export interface TeacherOralReviewRequest {
  criteria: OralTeacherCriterionDto[];
  note: string | null;
}

/** A téma validátor-hibája: `{ errorType: 'OralTopicInvalid', details: { errors: ['items[0].questions[2].expected: …'] } }`. */
export const ORAL_TOPIC_INVALID = 'OralTopicInvalid';

export interface OralTopicError {
  /** A szerkesztő mezőútvonala (`items[0].questions[2].expected`, `rubric[1].points`); üres, ha nincs. */
  path: string;
  message: string;
}

/** A 400-as validátor-hiba listája mezőútvonalra bontva; más hibánál üres. */
export function oralTopicErrors(err: unknown): OralTopicError[] {
  const body = (err as { error?: { errorType?: string; details?: { errors?: unknown } } })?.error;
  if (body?.errorType !== ORAL_TOPIC_INVALID || !Array.isArray(body.details?.errors)) return [];
  return body.details.errors
    .filter((e): e is string => typeof e === 'string')
    .map((e) => {
      const match = /^([\w.[\]]+): (.*)$/s.exec(e);
      return match ? { path: match[1], message: match[2] } : { path: '', message: e };
    });
}
