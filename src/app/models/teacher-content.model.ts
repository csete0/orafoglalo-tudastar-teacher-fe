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
  /**
   * UI-TT-172: NULL, ha a feladatsort nem vonta vissza admin. Ha nem NULL, a feladatsor
   * admin-adminisztratív okból visszavontnak számít (isPublished ilyenkor false) - ezt az
   * admin-nézet (`admin-tanarok.component.ts`) már helyesen megkülönbözteti "Admin
   * visszavonta"-ként a sima piszkozattól, a tanár SAJÁT listája/szerkesztője viszont eddig
   * nem is ismerte ezt a mezőt.
   */
  takedownAt: string | null;
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

  /**
   * A betöltéskor kapott konkurrencia-token. Opcionális: token nélkül a backend a
   * korábbi módon menti (visszafelé kompatibilis).
   */
  rowVersion?: string;
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

  /**
   * Optimista konkurrencia-token. A mentésnél visszaküldjük, és ha időközben más
   * módosította az elemet, a backend elutasítja a mentést - így nem írjuk felül
   * némán a másik szerkesztő munkáját.
   */
  rowVersion?: string;
}

export interface CreateTeacherSolutionRequest {
  description: string;
  points?: number;
  solutionText?: string;

  /**
   * A betöltéskor kapott konkurrencia-token. Opcionális: token nélkül a backend a
   * korábbi módon menti (visszafelé kompatibilis).
   */
  rowVersion?: string;
}

export interface TeacherSolutionDto {
  id: number;
  description?: string;
  points?: number;
  solutionText?: string;
  snippets: SnippetDto[];

  /**
   * Optimista konkurrencia-token. A mentésnél visszaküldjük, és ha időközben más
   * módosította az elemet, a backend elutasítja a mentést - így nem írjuk felül
   * némán a másik szerkesztő munkáját.
   */
  rowVersion?: string;
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
