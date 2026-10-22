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

/** A konzolos és a grafikus rész nyelve (BE: DesktopLanguages). */
export type DesktopLanguage = 'csharp' | 'java';

export const DESKTOP_LANGUAGE_LABEL: Record<DesktopLanguage, string> = { csharp: 'C#', java: 'Java' };

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
  /** > 0: a rész MI-szempontjai nem értékeltek (tanári / napi MI-keret, MI-hiba) - ennyi pont 0-val szerepel (dolgozatnál a tanár kézzel pontozhatja). */
  aiNotEvaluatedPoints?: number;
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
  /** Prémium nélküli tanár: csak a csoport kiadott dolgozatainak cellái, elméleti teszt nélkül. */
  testsOnly: boolean;
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
  /** Az MI indoklása; nem értékelt szempontnál a szempont szövege. */
  reason: string;
  /** Az MI nem értékelte (keret / MI-hiba): 0 pont. */
  notEvaluated?: boolean;
  /** A tanár kézzel pontozta: az MI eredeti pontja (a points a tanári pont); null = nincs kézi pontozás. */
  aiPoints?: number | null;
}

export interface ExamPartDetailDto {
  machine: { status: string; points: number; maxPoints: number; cases: CaseDetailDto[]; compileOutput: string | null } | null;
  ai: { status: string; points: number; maxPoints: number; items: RubricItemOutcomeDto[]; message: string | null } | null;
  message: string | null;
  /** A tanári kézi pontozás (ki, mikor); null = nincs. */
  review?: { reviewedAt: string; teacherProfileId: number } | null;
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
  /** Csak ha az ítélet biztos (nem értékelt MI-szempontok mellett is). */
  passed: boolean | null;
  parts: ExamSessionPartDto[];
  /** > 0: részleges eredmény - ennyi pontnyi MI-szempont nem értékelt. */
  notEvaluatedPoints?: number;
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
  /** A grafikus rész beadott feltöltése (a zip szűrt forrásfájljai + a képernyőképek száma); null, ha nem töltött fel. */
  gui?: ExamSnapshotGuiDto | null;
  /** A részek gyökérmappái a munkaterületen (a GUI-résznek nincs: az külön feltöltés). */
  partRoots?: Partial<Record<ExamPartKey, string>> | null;
  /** A konzolos és a grafikus rész nyelve (a munkamenet indításakor rögzítve); régebbi BE-n hiányzik = C#. */
  desktopLanguage?: DesktopLanguage;
}

export interface ExamSnapshotGuiDto {
  uploadId: number;
  uploadedAt: string;
  files: Record<string, string>;
  /** A képek a GET sessions/{id}/gui/images/{index} végponton (0-tól). */
  imageCount: number;
}

/** A részek gyökérmappái (BE: ExamParts.StudentRoots) - ha a pillanatkép nem hozza. */
export const EXAM_PART_ROOTS: Partial<Record<ExamPartKey, string>> = {
  console: 'console/',
  api: 'backend/',
  web: 'frontend/web/',
  client: 'frontend/client/',
};

/** Soronkénti tanári megjegyzés a beadott dolgozaton (BE: ExamCodeCommentDto). */
export interface ExamCodeCommentDto {
  id: number;
  partKey: ExamPartKey;
  path: string;
  line: number;
  lineText: string;
  body: string;
  authorName: string;
  createdAt: string;
  updatedAt: string | null;
}
