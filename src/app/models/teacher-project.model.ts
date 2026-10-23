/** Projektműhely a tanári oldalon (BE: DigitalCulture.Domain/Entities/Projects/ProjectAssignment.cs). */

export type ProjectRuntime = 'browser-python' | 'browser-js' | 'judge0-csharp' | 'judge0-java' | 'judge0-aspnet';
export type Independence = 'onallo' | 'kis-segitseggel' | 'segitseggel';

export type DesktopLanguage = 'csharp' | 'java';

export const DESKTOP_LANGUAGE_LABELS: Record<DesktopLanguage, string> = { csharp: 'C#', java: 'Java' };

export const RUNTIME_LABELS: Record<ProjectRuntime, string> = {
  'browser-python': 'Python',
  'browser-js': 'JavaScript',
  'judge0-csharp': 'C#',
  'judge0-java': 'Java',
  'judge0-aspnet': 'C# (ASP.NET Core)',
};

/** A technikumi dolgozat ideje percben (BE: ProjectAssignmentService.MinTestMinutes/MaxTestMinutes). */
export const TEST_MINUTES_MIN = 5;
export const TEST_MINUTES_MAX = 480;

export const INDEPENDENCE_LABELS: Record<Independence, string> = {
  onallo: 'önállóan',
  'kis-segitseggel': 'kis segítséggel',
  segitseggel: 'segítséggel',
};

export interface ExamAreaDto {
  key: string;
  name: string;
}

export interface TeacherProjectMilestoneDto {
  orderNo: number;
  title: string;
  kind: string;
  estimatedMinutes: number;
  examAreas: ExamAreaDto[];
}

export interface ProjectAssignmentDto {
  id: number;
  projectSlug: string;
  projectTitle: string;
  groupId: number;
  groupName: string;
  assignedAt: string;
  opensAt: string | null;
  dueAt: string | null;
  runtime: ProjectRuntime | null;
  /** Technikumi dolgozat: vizsga-munkamenetben, időre. */
  isTest: boolean;
  /** A dolgozat ideje; null = a projekt ideje. */
  timeLimitSeconds: number | null;
  memberCount: number;
  startedCount: number;
  completedCount: number;
  /** Ennyi tagnak nincs teljes hozzáférése (csak az ingyenes lépésekig jut el). */
  membersWithoutFullAccess: number;
  milestoneCount: number;
  freeMilestoneCount: number;
}

export interface TeacherProjectDto {
  slug: string;
  title: string;
  summary: string;
  level: string;
  /** practice | exam (technikumi próbavizsga). */
  kind: 'practice' | 'exam';
  estimatedHours: number;
  previewImageUrl: string | null;
  runtimes: ProjectRuntime[];
  /** Technikumi feladat: a konzolos és a grafikus rész nyelvei (csharp | java) - ezek közül a diák választ, a kiadás nem köt nyelvet. */
  desktopLanguages?: DesktopLanguage[] | null;
  freeMilestoneCount: number;
  examAreas: ExamAreaDto[];
  milestones: TeacherProjectMilestoneDto[];
  assignments: ProjectAssignmentDto[];
}

export interface AssignProjectRequest {
  groupId: number;
  opensAt: string | null;
  dueAt: string | null;
  runtime: ProjectRuntime | null;
  /** Dolgozat (csak technikumi próbavizsgánál): kezdés és befejezés kötelező. */
  isTest: boolean;
  /** Másodpercben; null = a projekt ideje. */
  timeLimitSeconds: number | null;
}

export interface ProjectAssignmentStepDto {
  orderNo: number;
  passed: boolean;
  passedAt: string | null;
  independence: Independence | null;
  checks: number;
  hint1: number;
  hint2: number;
  hint3: number;
}

export interface ProjectAssignmentStudentDto {
  userId: number;
  name: string;
  runtime: ProjectRuntime | null;
  /** Technikumi projektnél a diák választott nyelve (dolgozatnál a munkamenetéé); a `runtime` ott csak a REST-backend futtatója. */
  desktopLanguage?: DesktopLanguage | null;
  currentMilestoneOrder: number | null;
  completedAt: string | null;
  lastActivityAt: string | null;
  hasFullAccess: boolean;
  aiTokens30: number;
  steps: ProjectAssignmentStepDto[];
  /** Dolgozatnál: azóta kilépett a csoportból, de tagként írta - csak olvasható sor. */
  leftGroup?: boolean;
}

export interface ProjectAssignmentStudentsDto {
  assignment: ProjectAssignmentDto;
  milestones: TeacherProjectMilestoneDto[];
  students: ProjectAssignmentStudentDto[];
}

/** A diák kódja (csak olvasás) - a BE a portfólió-DTO-t adja vissza. */
export interface StudentProjectCodeDto {
  projectTitle: string;
  runtime: ProjectRuntime;
  files: Record<string, string>;
  readOnlyPaths: string[];
  createdAt: string;
}

/** Sorhoz kötött kódmegjegyzés (BE: ProjectCodeComment.cs) - a tanár nyitja, a diák válaszol és megoldottnak jelöli. */
export interface CodeCommentDto {
  id: number;
  body: string;
  authorName: string;
  authorIsTeacher: boolean;
  createdAt: string;
}

export interface CodeCommentThreadDto extends CodeCommentDto {
  path: string;
  line: number;
  /** A sor szövege a megjegyzés idején - ha azóta más, a megjegyzés „elavult”. */
  lineText: string;
  resolvedAt: string | null;
  replies: CodeCommentDto[];
}

/** MI-javaslat egy sorra (BE: comment-suggestions) - nem mentett; elfogadáskor a meglévő megjegyzés-végponton lesz belőle megjegyzés. */
export type CodeSuggestionSeverity = 'hiba' | 'javaslat' | 'dicséret';

export interface CodeCommentSuggestionDto {
  path: string;
  line: number;
  /** A sor szövege a javaslat idején (ugyanaz, amit a megjegyzés tárolna). */
  lineText: string;
  severity: CodeSuggestionSeverity;
  text: string;
}

export interface CodeCommentSuggestionsResponse {
  suggestions: CodeCommentSuggestionDto[];
  reviewedPaths: string[];
  truncatedPaths: string[];
  skippedFiles: { path: string; reason: string }[];
  droppedCount: number;
  model: string;
  quota: { used: number; limit: number } | null;
}
