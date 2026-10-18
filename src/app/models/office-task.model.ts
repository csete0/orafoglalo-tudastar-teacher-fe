/**
 * „Irodai feladat a megoldott fájlból” (PATRICKS-IRODAI-FELADAT-MEGOLDASBOL-TERV.md, 1. fázis: Excel, 2. fázis: Word) - a backend
 * `OfficeTaskModels.cs` tükre. A ★ mezőket a szerver tölti minden ellenőrzéskor, a kliens értéke nem számít.
 */

export type OfficeTaskLevel = 'kozep' | 'emelt';
export type OfficeTaskStatus = 'queued' | 'generating' | 'running' | 'done' | 'failed';
export type OfficeSourceMode = 'derived' | 'own';
/** A feltöltött megoldás fajtája (a kiterjesztésből): ez dönti el a visszacsinálási szókészletet. */
export type OfficeFileKind = 'excel' | 'word';

/** A zárt Excel-szókészlet (ExcelUndo.Vocabulary). */
export type ExcelUndoOpName =
  | 'clearFormulas'
  | 'clearValues'
  | 'resetStyle'
  | 'removeChart'
  | 'removeConditionalFormatting'
  | 'removeAutoFilter'
  | 'removeDefinedName'
  | 'resetColumnWidth'
  | 'unmergeCells'
  | 'removeDataValidation';

export type ExcelStylePart = 'numberFormat' | 'font' | 'fill' | 'border' | 'alignment';

/** A zárt Word-szókészlet (WordUndo.Vocabulary). */
export type WordUndoOpName =
  | 'clearRunFormatting'
  | 'resetParagraphFormatting'
  | 'setParagraphStyle'
  | 'removeNumbering'
  | 'removeParagraphBorderShading'
  | 'removeHyperlinks'
  | 'replaceText'
  | 'removeTable'
  | 'convertTableToText'
  | 'removeImage'
  | 'removeHeader'
  | 'removeFooter'
  | 'removeToc'
  | 'removeField'
  | 'removeFootnotes'
  | 'resetPageSetup'
  | 'removeColumns'
  | 'removeSectionBreak';

/** Word-bekezdés horgonya: 0-alapú sorszám (a törzs bekezdései dokumentum-sorrendben, a szövegdobozokéi nélkül) + a szöveg eleje. */
export interface OfficeParagraphAnchor {
  index: number | null;
  startsWith: string | null;
}

export interface OfficeUndoOp {
  op: string;
  sheet: string | null;
  range: string | null;
  /** removeDefinedName: a név; removeChart: a diagram neve vagy címe. */
  name: string | null;
  /** Excel removeChart: a lap diagramjainak 0-alapú sorszáma; Word: táblázat / rajz / szakasz 0-alapú sorszáma. */
  index: number | null;
  /** resetColumnWidth: „B” vagy „B:D”. */
  columns: string | null;
  /** Excel resetStyle / Word clearRunFormatting, resetParagraphFormatting, resetPageSetup, removeFootnotes: null = minden rész. */
  parts: string[] | null;
  // ── Csak Word (a szerver csak kitöltve küldi; Excel-műveletnél hiányzik) ──
  /** Az első érintett bekezdés. */
  from?: OfficeParagraphAnchor | null;
  /** Az utolsó érintett bekezdés (elhagyva = csak a „from”). */
  to?: OfficeParagraphAnchor | null;
  /** Szakasz (0-tól); elhagyva = minden szakasz. */
  section?: number | null;
  /** removeField: a mező fajtája (pl. „PAGE”). */
  field?: string | null;
  /** replaceText: a megoldásban álló szövegrész. */
  find?: string | null;
  /** replaceText: az eredeti szöveg (üres = törlés). */
  original?: string | null;
  enabled: boolean;
  /** ★ ok | noop | error | null (kikapcsolva / saját kiinduló fájl). */
  result: 'ok' | 'noop' | 'error' | null;
  /** ★ a noop / error oka. */
  message: string | null;
}

export interface OfficeRubricItem {
  /** A szerver adja („r1”…); új, tanár által felvett tételnél null (az mindig MI-szempont). */
  key: string | null;
  text: string;
  points: number;
  /** ★ */
  machine: boolean;
  /** ★ ok = gépi; failed = a megoldáson sem teljesül; source = a kiinduló fájlon is teljesül; null = nincs szabály. */
  gate: 'ok' | 'failed' | 'source' | null;
  /** ★ */
  gateReason: string | null;
}

export interface OfficeProposalSubtask {
  label: string;
  text: string;
  points: number;
  undo: OfficeUndoOp[];
  rubric: OfficeRubricItem[];
}

export interface OfficeTaskProposal {
  title: string;
  description: string;
  sourceMode: OfficeSourceMode;
  subtasks: OfficeProposalSubtask[];
}

export interface OfficeTaskPreview {
  source: string[];
  solution: string[];
}

export interface OfficeTaskReport {
  status: 'ok' | 'failed';
  canSave: boolean;
  errors: string[];
  warnings: string[];
  sourceFileName: string;
  solutionFileName: string;
  recalculated: boolean;
  machineItems: number;
  aiItems: number;
  preview: OfficeTaskPreview | null;
}

export interface OfficeTaskResultDto {
  proposal: OfficeTaskProposal;
  report: OfficeTaskReport;
  model: string;
  notes: string | null;
  reasked: boolean;
  /** Word: a megoldás bekezdései a horgony-választóhoz (csak a generálás eredményében; olvashatatlan fájlnál és Excelnél hiányzik). */
  paragraphs?: OfficeWordParagraph[] | null;
  /** Word: a dokumentumnak több bekezdése van, mint amennyi a listában áll (a horgony kézzel adható meg). */
  paragraphsCapped?: boolean;
}

/** A Word-megoldás egy bekezdése a szerver horgony-számozásával. */
export interface OfficeWordParagraph {
  /** 0-alapú sorszám (= a horgony „index”-e). */
  index: number;
  /** A szöveg eleje szóközök összevonva, ≤ 80 karakter, rövidítésjel nélkül - változtatás nélkül mehet a „startsWith”-be. */
  text: string;
  /** A bekezdés hosszabb a „text”-nél. */
  truncated: boolean;
  /** Bekezdésstílus neve (pl. „heading 1”). */
  style?: string | null;
  inTable: boolean;
}

export interface OfficeTaskJobDto {
  jobId: number;
  fileKind: OfficeFileKind;
  fileName: string;
  status: OfficeTaskStatus;
  progressText: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  appliedTaskId: number | null;
  hasOwnSource: boolean;
  result: OfficeTaskResultDto | null;
}

export interface OfficeTaskQuotaDto {
  used: number;
  limit: number;
  month: string;
  isPremium: boolean;
}

export interface OfficeTaskStartRequest {
  file: File;
  level: OfficeTaskLevel;
  subtaskCount: number;
  notes: string | null;
}

export interface OfficeTaskStartResult {
  jobId: number;
  status: OfficeTaskStatus;
  quota: OfficeTaskQuotaDto;
}

export interface OfficeTaskValidateResult {
  proposal: OfficeTaskProposal;
  report: OfficeTaskReport;
}

export interface OfficeTaskApplyResult {
  taskId: number;
  saved: string[];
}

/** A letölthető fájlok: a (legutóbb ellenőrzött) kiinduló fájl és a feltöltött megoldás. */
export type OfficeTaskFileKind = 'source' | 'solution';
