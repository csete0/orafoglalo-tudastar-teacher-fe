/** Technikum a tanári oldalon (BE: TechnikumHeatmapService.cs, ProjectExamSessionService.cs). */

export type ExamPartKey = 'console' | 'gui' | 'web' | 'api' | 'client';

/** A vizsgarészek neve (a diák-app felirataival egyezően). */
export const EXAM_PART_LABEL: Record<ExamPartKey, string> = {
  console: 'Konzolos alkalmazás',
  gui: 'Grafikus alkalmazás',
  web: 'Weboldal (frontend)',
  api: 'Backend (REST API)',
  client: 'Kliens alkalmazás',
};

/** A vizsga sikerességi határa (BE: ExamScoring.PassPercent). */
export const EXAM_PASS_RATIO = 0.4;

export interface HeatmapPartDto {
  key: ExamPartKey;
  maxPoints: number;
}

export interface HeatmapTestDto {
  assignmentId: number;
  projectSlug: string;
  projectTitle: string;
  opensAt: string | null;
  dueAt: string | null;
  closedSessions: number;
  resultsPublished: boolean;
}

export interface HeatmapCellDto {
  partKey: ExamPartKey;
  points: number;
  maxPoints: number;
  ratio: number;
  source: 'exam' | 'practice';
  fromClassTest: boolean;
  projectSlug: string;
  projectTitle: string;
  /** null: a csoport nem kapta meg a projektet - nincs kódolvasó. */
  assignmentId: number | null;
  /** Csak vizsga-munkamenet eredményénél. */
  sessionId: number | null;
  gradedAt: string;
  /** Dolgozat-rész, amelynek bírálata végleg sikertelen (vagy végleg hiányzik): 0 pontnak számít. */
  gradingFailed: boolean;
}

/** A közzététel eredménye: közzétett munkamenetek, és ezek közül hánynak van végleg sikertelen (0 pontos) része. */
export interface PublishResultDto {
  published: number;
  sessionsWithFailedParts: number;
}

export interface HeatmapTheoryDto {
  points: number;
  maxPoints: number;
  ratio: number;
}

export interface HeatmapStudentDto {
  userId: number;
  name: string;
  /** Csak a bírált részek, oszlop-sorrendben. */
  cells: HeatmapCellDto[];
  theory: HeatmapTheoryDto | null;
}

export interface TechnikumHeatmapDto {
  groupId: number;
  groupName: string;
  parts: HeatmapPartDto[];
  theoryMaxPoints: number;
  tests: HeatmapTestDto[];
  students: HeatmapStudentDto[];
}

export interface CaseDetailDto {
  key: string;
  title: string;
  passed: boolean;
  reason: string | null;
  points: number;
  rubricItemKey: string | null;
}

export interface RubricItemOutcomeDto {
  key: string;
  points: number;
  maxPoints: number;
  reason: string;
}

export interface ExamPartDetailDto {
  machine: { status: string; points: number; maxPoints: number; cases: CaseDetailDto[]; compileOutput: string | null } | null;
  ai: { status: string; points: number; maxPoints: number; items: RubricItemOutcomeDto[]; message: string | null } | null;
  message: string | null;
}

export interface ExamPartResultDto {
  id: number;
  partKey: ExamPartKey;
  /** graded | pending | system_error */
  status: string;
  points: number;
  maxPoints: number;
  source: string;
  sessionId: number | null;
  gradedAt: string;
  detail: ExamPartDetailDto;
}

export interface ExamSessionPartDto {
  partKey: ExamPartKey;
  title: string;
  maxPoints: number;
  result: ExamPartResultDto | null;
}

export interface ExamSessionDto {
  id: number;
  projectSlug: string;
  assignmentId: number | null;
  /** running | submitted | expired | graded | cancelled */
  status: string;
  startedAt: string;
  deadline: string;
  submittedAt: string | null;
  remainingSeconds: number;
  resultsVisible: boolean;
  totalPoints: number | null;
  maxPoints: number;
  passed: boolean | null;
  parts: ExamSessionPartDto[];
}

/** A beadott dolgozat (lezáráskori pillanatkép) a bírálattal. */
export interface ExamSessionSnapshotDto {
  sessionId: number;
  assignmentId: number;
  userId: number;
  studentName: string;
  projectSlug: string;
  projectTitle: string;
  runtime: string;
  files: Record<string, string>;
  readOnlyPaths: string[];
  session: ExamSessionDto;
}
