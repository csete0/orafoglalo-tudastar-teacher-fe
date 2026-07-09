export interface CreateTeacherTaskSetRequest {
  title: string;
  description: string;
  /** 1=beginner, 2=advanced, 3=expert (Levels tábla). */
  levelId: number;
  subjectCategoryId?: number;
}

export interface TeacherTaskSetDto {
  id: number;
  title: string;
  slug: string;
  description: string;
  levelId: number;
  subjectCategoryId?: number;
  isPublished: boolean;
  createdAt: string;
  taskCount: number;
}

export interface TeacherTaskSetDetailDto extends TeacherTaskSetDto {
  tasks: TeacherTaskDto[];
  files: TeacherFileDto[];
}

export interface PublishResultDto {
  success: boolean;
  errors: string[];
}

export interface CreateTeacherTaskRequest {
  title: string;
  description: string;
  maxPoints: number;
  taskOrder?: number;
  /** TaskTypes tábla (5=SQL, 6=Programozás, ...). */
  taskTypeIds?: number[];
}

export interface TeacherTaskDto {
  id: number;
  title: string;
  description: string;
  maxPoints: number;
  taskOrder: number;
  taskTypeIds: number[];
  solutions: TeacherSolutionDto[];
  completeSolutionSnippets: SnippetDto[];
}

export interface CreateTeacherSolutionRequest {
  description: string;
  points?: number;
  solutionText?: string;
}

export interface TeacherSolutionDto {
  id: number;
  description?: string;
  points?: number;
  solutionText?: string;
  snippets: SnippetDto[];
}

export interface SnippetDto {
  programmingLanguageId: number;
  code: string;
}

export type TeacherFileKind = 'SolutionPdf' | 'InputTxt' | 'CreateSql' | 'CreateLiteSql';

export interface TeacherFileDto {
  id: string;
  kind: TeacherFileKind;
  originalFileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  /** A jogosultság-ellenőrzött kiszolgáló endpoint URL-je. */
  url: string;
}
