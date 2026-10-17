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
   * Katalógus-másolatnál a forrás hivatalos sor id-ja; a másolat a forrás hozzáférését örökli (isFree / isPremiumOnly).
   * Opcionális: a BE még nem minden válaszban adja.
   */
  copiedFromTaskSetId?: number | null;
  isFree?: boolean | null;
  isPremiumOnly?: boolean | null;

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

/**
 * OfficeSource: irodai feladat forrásfájlja (feladatonként több); OfficeSolution: a tanár saját
 * megoldása (a backend `<név>_megoldas.<kit>` néven tárolja, vizsga alatt rejtve). Image: kvízkép.
 */
export type TeacherFileKind = 'SolutionPdf' | 'InputTxt' | 'CreateSql' | 'CreateLiteSql' | 'Image' | 'OfficeSource' | 'OfficeSolution';

export interface TeacherFileDto {
  id: string;
  kind: TeacherFileKind;
  originalFileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  /** A jogosultság-ellenőrzött kiszolgáló endpoint URL-je. */
  url: string;
  /** A feladat, amelyhez a fájl tartozik (irodai forrás-/megoldásfájl); feladatsor-szintű fájlnál null. */
  taskId?: number | null;
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

/** GET/PUT …/run-input: a kód-feladat tárolt bemenete. Üres stdin + isRandom=false mentése törli. */
export interface TeacherRunInputDto {
  /** A billentyűzetről beolvasott sorok (soronként egy bemenet); null, ha nincs. */
  stdin: string | null;
  /** A program véletlenszámokat használ: a futtatásos összevetés kimarad, az MI pontoz. */
  isRandom: boolean;
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
  /** A lista eredete; „catalog-copy”: hivatalos lista másolata, a gépi szabályai rejtettek. Opcionális. */
  source?: string | null;
  createdAt: string;
  /** A vázlatot író modell megjegyzése (pl. a feladatszöveg és a megoldás eltérése) vagy a sikertelen önellenőrzés; null, ha nincs. */
  note: string | null;
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

// ── Hiányzó SQL-fájl elkészítése (POST /teacher/task-sets/{id}/sql-generation) ──

/** createSql: create.sql → create_lite.sql · createLiteSql: create_lite.sql → create.sql · dataFiles: bemeneti fájlokból mindkettő. */
export type SqlGenerationSource = 'createSql' | 'createLiteSql' | 'dataFiles';

export interface SqlGenerationRequest {
  source: SqlGenerationSource;
  description?: string | null;
  /** Adatfájlos módban a használt bemeneti fájlok (üres → mind). */
  fileIds?: string[] | null;
  hasHeader?: boolean;
}

export interface GeneratedSqlFileDto {
  kind: 'CreateSql' | 'CreateLiteSql';
  fileName: string;
  content: string;
  sizeBytes: number;
}

export interface GeneratedColumnDto {
  name: string;
  type: string;
  primaryKey: boolean;
  notNull: boolean;
  /** „tábla.oszlop”, ha idegen kulcs. */
  references: string | null;
}

export interface GeneratedTableDto {
  name: string;
  /** A forrás (tábla neve vagy adatfájl neve). */
  source: string;
  columns: GeneratedColumnDto[];
  expectedRows: number;
  /** A futtatón (SQLite) megszámolt sorok; null, ha nem futott. */
  actualRows: number | null;
}

export interface SqlValidationDto {
  status: 'ok' | 'failed' | 'unavailable';
  errors: string[];
}

export interface ReferenceSubtaskCheckDto {
  label: string;
  status: 'match' | 'different' | 'ok' | 'error' | 'not_query';
  rows: number | null;
  message: string | null;
}

export interface ReferenceCheckDto {
  taskId: number;
  taskTitle: string;
  subtasks: ReferenceSubtaskCheckDto[];
}

/** A kézzel javított fájl(ok) újraellenőrzése (POST …/sql-generation/validate) - legalább az egyik kell. */
export interface SqlFilesValidationRequest {
  createSql?: string | null;
  createLiteSql?: string | null;
}

export interface SqlGenerationResultDto {
  /** 'validate': az újraellenőrzés válasza. */
  source: SqlGenerationSource | 'validate';
  model: string;
  files: GeneratedSqlFileDto[];
  tables: GeneratedTableDto[];
  warnings: string[];
  validation: SqlValidationDto;
  referenceChecks: ReferenceCheckDto[];
  aiNotes: string | null;
  canSave: boolean;
  /** Újraellenőrzésnél: mivel vetettük össze a táblákat/sorszámokat (null: nem volt mivel). */
  comparedWith?: string | null;
}

// ── SQL megoldó lekérdezések MI-vel (POST /teacher/task-sets/{id}/tasks/{taskId}/sql-queries/…) ──

export interface SqlQueryGenerationRequest {
  /** true: a már SQL-megoldással rendelkező részfeladatokra is kér újat (mentéskor az overwrite dönt). */
  regenerate?: boolean;
  /** Mentéskor felülírja-e a meglévő SQL-megoldást - ettől függ a tételek `willSave` jelzése. */
  overwrite?: boolean;
  /** Csak ezekre a részfeladatokra (üres/null: mind). */
  subTaskIds?: number[] | null;
}

export interface SqlQueryInput {
  subTaskId: number;
  sql: string;
}

export interface SqlQueryPreviewDto {
  columns: string[];
  /** Legfeljebb az első 20 sor, cellánként max. 200 karakter. */
  rows: (string | null)[][];
  totalRows: number;
  truncated: boolean;
}

/** ok · not_query (nem lekérdezés, hibátlanul lefutott) · error · nondeterministic · missing (az MI nem adott rá) · not_run. */
export type SqlQueryStatus = 'ok' | 'not_query' | 'error' | 'nondeterministic' | 'missing' | 'not_run';

export interface SqlQueryItemDto {
  subTaskId: number;
  label: string;
  /** A részfeladatnak már van SQL-megoldása (mentéskor csak felülírással cserélődik). */
  hadSnippet: boolean;
  /** Az apply ugyanezzel a felülírás-beállítással menti-e (false: már van megoldás, felülírás nélkül). */
  willSave: boolean;
  sql: string | null;
  status: SqlQueryStatus;
  error: string | null;
  warnings: string[];
  preview: SqlQueryPreviewDto | null;
}

export interface SqlQueryResultDto {
  taskId: number;
  /** Ellenőrzésnél üres. */
  model: string;
  queries: SqlQueryItemDto[];
  warnings: string[];
  validationStatus: 'ok' | 'failed' | 'unavailable';
  canApply: boolean;
  aiNotes: string | null;
}

export interface SqlQueryApplyRequest {
  queries: SqlQueryInput[];
  overwrite: boolean;
}

export interface SqlQueryApplyResultDto {
  applied: number[];
  skipped: { subTaskId: number; reason: string }[];
}

// ── Másolás a katalógusból (GET /teacher/catalog/task-sets, POST …/{id}/copy) ──

export interface CatalogQuery {
  q?: string | null;
  categoryId?: number | null;
  levelId?: number | null;
  year?: number | null;
  page: number;
  pageSize: number;
}

export interface CatalogTaskSetDto {
  id: number;
  title: string;
  categoryId: number | null;
  categoryName: string | null;
  levelId: number;
  levelName: string | null;
  year: number | null;
  taskCount: number;
  isPremium: boolean;
  isFree: boolean;
  canCopy: boolean;
  alreadyCopied: boolean;
}

export interface CatalogPageDto {
  page: number;
  pageSize: number;
  totalCount: number;
  items: CatalogTaskSetDto[];
  /** A másolható sorok kategóriái (a szűrőhöz). */
  categories: { id: number; name: string }[];
}

export interface CatalogCopyResultDto {
  taskSetId: number;
  title: string;
  taskCount: number;
  fileCount: number;
  warnings: string[];
}
