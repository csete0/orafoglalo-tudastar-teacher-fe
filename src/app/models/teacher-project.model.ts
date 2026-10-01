/** Projektműhely a tanári oldalon (BE: DigitalCulture.Domain/Entities/Projects/ProjectAssignment.cs). */

export type ProjectRuntime = 'browser-python' | 'browser-js' | 'judge0-csharp' | 'judge0-java';
export type Independence = 'onallo' | 'kis-segitseggel' | 'segitseggel';

export const RUNTIME_LABELS: Record<ProjectRuntime, string> = {
  'browser-python': 'Python',
  'browser-js': 'JavaScript',
  'judge0-csharp': 'C#',
  'judge0-java': 'Java',
};

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
  estimatedHours: number;
  previewImageUrl: string | null;
  runtimes: ProjectRuntime[];
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
  currentMilestoneOrder: number | null;
  completedAt: string | null;
  lastActivityAt: string | null;
  hasFullAccess: boolean;
  aiTokens30: number;
  steps: ProjectAssignmentStepDto[];
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
