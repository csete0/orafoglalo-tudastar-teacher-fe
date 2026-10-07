export interface CreateTeacherTaskSetRequest {
  title: string;
  description: string;
  /** 1=beginner, 2=advanced, 3=expert (Levels tábla). */
  levelId: number;
  subjectCategoryId?: number;
  /** Optimista konkurrencia-token a betöltött részletből - elavult tokennel a mentés ütközés-hibát ad. */
  rowVersion?: string;
  /** „Ajánlott előtte” témák (a diák ezekhez kap gyakorló-ajánlást). Elhagyva mentéskor változatlan; [] = nincs. */
  requiredSkillIds?: number[];
}

/** A témaválasztó egy eleme (GET /teacher/skills). */
export interface TeacherSkillDto {
  id: number;
  name: string;
  /** programozas | adatbazis */
  area: string;
  description?: string | null;
}

/** A backend CreateTeacherTaskSetRequest.MaxRequiredSkills értéke. */
export const MAX_REQUIRED_SKILLS = 12;

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

  /**
   * Van-e MAR vizsga-munkamenet a feladatsoron. Ha igen, SOSEM torolheto - a diakok
   * eredmenyei es statisztikai hozza kotodnek.
   *
   * Ezert nincs soft torles: a kemeny torles PONTOSAN akkor tiltott, amikor van mit
   * megorizni. A jelzo azert kell, hogy a gomb eleve letiltott legyen a magyarazattal -
   * a tanar ne egy elutasitott keresbol tudja meg.
   */
  hasExamSessions: boolean;

  /** Optimista konkurrencia-token (a részlet és a mentés válasza tölti ki; a lista nem). */
  rowVersion?: string;
}

export interface TeacherTaskSetDetailDto extends TeacherTaskSetDto {
  tasks: TeacherTaskDto[];
  files: TeacherFileDto[];
  requiredSkillIds: number[];
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
  subTasks: TeacherSubTaskDto[];
  completeSolutionSnippets: SnippetDto[];

  /**
   * Optimista konkurrencia-token. A mentésnél visszaküldjük, és ha időközben más
   * módosította az elemet, a backend elutasítja a mentést - így nem írjuk felül
   * némán a másik szerkesztő munkáját.
   */
  rowVersion?: string;
}

export interface CreateTeacherSubTaskRequest {
  description: string;
  points?: number;
  label?: string;

  /**
   * A betöltéskor kapott konkurrencia-token. Opcionális: token nélkül a backend a
   * korábbi módon menti (visszafelé kompatibilis).
   */
  rowVersion?: string;
}

export interface TeacherSubTaskDto {
  id: number;
  description?: string;
  points?: number;
  label?: string;
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

// ── Automatikus javítás minősége + tanári szempontlista (TANARI-SZEMPONTLISTA-API.md) ──

/** Zöld = pontos, sárga = működik, de pontatlanabb, piros = nem lesz (pontos) automatikus javítás. */
export type GradingQualityLevel = 'green' | 'yellow' | 'red';

export interface GradingQualityCheckDto {
  /** reference | referenceRuns | stdin | rubric | solutionFile | subtasks */
  key: string;
  ok: boolean;
  label: string;
  /** Teendő, ha a feltétel nem teljesül. */
  hint?: string | null;
}

/** GET api/teacher/task-sets/{taskSetId}/tasks/{taskId}/grading-quality */
export interface GradingQualityDto {
  kind: 'code' | 'sql' | 'office';
  level: GradingQualityLevel;
  checks: GradingQualityCheckDto[];
  rubric: { status: 'none' | 'draft' | 'approved'; itemCount: number; machineCount: number };
}

export interface TeacherRubricItemDto {
  id: number;
  order: number;
  subTaskId: number | null;
  section: string | null;
  text: string;
  points: number;
  /** Van gépi szabálya (RuleJson). A szabályt a tanár nem szerkesztheti, csak a tételt törölheti. */
  machine: boolean;
  /** A kapu eredménye a tanár megoldásán; kód/SQL tételnél null. */
  gate: 'ok' | 'failed' | null;
  gateReason: string | null;
}

/** GET …/rubric (a legfrissebb tanári lista: vázlat vagy jóváhagyott). */
export interface TeacherRubricDto {
  id: number;
  status: 'draft' | 'approved';
  rawTotal: number;
  examPoints: number;
  model: string | null;
  createdAt: string;
  items: TeacherRubricItemDto[];
  /** Jóváhagyást akadályozó hibák. */
  problems: string[];
}

export interface UpdateTeacherRubricItemRequest {
  text: string;
  points: number;
}

/** GET api/teacher/rubric-quota - a havi szempontlista-készítési keret. */
export interface RubricQuotaDto {
  used: number;
  limit: number;
  month: string;
}

export interface AssignTaskSetToGroupRequest {
  groupId: number;
  opensAt?: string | null;
  dueAt?: string | null;
  /** Dolgozat mód: egy próbálkozás, szerver által mért idő, szünet nélkül. */
  isTest?: boolean;
  /** Dolgozatnál kötelező (5–240). */
  timeLimitMinutes?: number | null;
}

export interface TaskSetAssignmentDto {
  id: number;
  groupId: number;
  groupName: string;
  assignedAt: string;
  opensAt?: string | null;
  dueAt?: string | null;
  revokedAt?: string | null;
  isTest?: boolean;
  timeLimitSeconds?: number | null;
  resultsPublishedAt?: string | null;
}

export interface TeacherGroupTaskSetAssignmentDto {
  assignmentId: number;
  taskSetId: number;
  taskSetTitle: string;
  taskCount: number;
  assignedAt: string;
  opensAt?: string | null;
  dueAt?: string | null;
  completedMemberCount: number;
  memberCount: number;
  isTest?: boolean;
  timeLimitSeconds?: number | null;
  resultsPublishedAt?: string | null;
}
