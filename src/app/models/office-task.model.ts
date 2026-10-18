/**
 * „Irodai feladat a megoldott fájlból” (PATRICKS-IRODAI-FELADAT-MEGOLDASBOL-TERV.md, 1. fázis: Excel) - a backend
 * `OfficeTaskModels.cs` tükre. A ★ mezőket a szerver tölti minden ellenőrzéskor, a kliens értéke nem számít.
 */

export type OfficeTaskLevel = 'kozep' | 'emelt';
export type OfficeTaskStatus = 'queued' | 'generating' | 'running' | 'done' | 'failed';
export type OfficeSourceMode = 'derived' | 'own';

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

export interface OfficeUndoOp {
  op: string;
  sheet: string | null;
  range: string | null;
  /** removeDefinedName: a név; removeChart: a diagram neve vagy címe. */
  name: string | null;
  /** removeChart: a lap diagramjainak 0-alapú sorszáma. */
  index: number | null;
  /** resetColumnWidth: „B” vagy „B:D”. */
  columns: string | null;
  /** resetStyle: null = minden rész. */
  parts: ExcelStylePart[] | null;
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
}

export interface OfficeTaskJobDto {
  jobId: number;
  fileKind: string;
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
