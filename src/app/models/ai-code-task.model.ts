/** AI programozási feladat (backend: TeacherAiCodeTaskController, szerződés: AI-FELADAT-BE-REPORT.md). */

export type AiCodeTaskMode = 'complete' | 'new';
export type AiCodeTaskLanguage = 'python' | 'csharp' | 'java' | 'cpp';
export type AiCodeTaskJobStatus = 'queued' | 'generating' | 'running' | 'done' | 'failed';
export type AiCodeTaskLevel = 'kozep' | 'emelt';

export interface AiCodeTaskQuotaDto {
  used: number;
  limit: number;
  month: string;
  isPremium: boolean;
}

export interface AiCodeTaskStartRequest {
  mode: AiCodeTaskMode;
  taskId?: number;
  regenerateSolution?: boolean;
  languages: AiCodeTaskLanguage[];
  topic?: string;
  level?: AiCodeTaskLevel;
  subtaskCount?: number;
  idea?: string | null;
}

export interface AiCodeTaskStartResult {
  jobId: number;
  status: AiCodeTaskJobStatus;
  quota: AiCodeTaskQuotaDto;
}

export interface AiProposalSubtask {
  subTaskId: number | null;
  label: string;
  text: string;
  points: number | null;
  existing: boolean;
  pointsExisting: boolean;
}

export interface AiProposalDataFile {
  fileName: string;
  generatorPython: string | null;
  content: string | null;
}

export interface AiProposalSnippet {
  code: string;
  existing: boolean;
}

export interface AiProposalLanguage {
  language: AiCodeTaskLanguage;
  solution: string;
  solutionExisting: boolean;
  snippets: AiProposalSnippet[];
}

export interface AiCodeTaskProposal {
  title: string | null;
  description: string | null;
  subtasks: AiProposalSubtask[];
  dataFile: AiProposalDataFile | null;
  existingInputFiles: string[];
  stdin: string | null;
  stdinExisting: boolean;
  languages: AiProposalLanguage[];
}

export interface AiSectionReport {
  order: number;
  label: string;
  section: number;
  status: 'ok' | 'missing' | 'mismatch' | 'format';
  preview: string | null;
}

export interface AiLanguageReport {
  language: AiCodeTaskLanguage;
  status: 'ok' | 'error' | 'mismatch' | 'skipped';
  error: string | null;
  deterministic: boolean | null;
  sections: AiSectionReport[];
}

export interface AiDataFileReport {
  fileName: string;
  sizeBytes: number;
  lineCount: number;
  preview: string;
  generated: boolean;
}

export interface AiCodeTaskReport {
  status: 'ok' | 'failed' | 'unavailable';
  canSave: boolean;
  errors: string[];
  warnings: string[];
  dataFile: AiDataFileReport | null;
  languages: AiLanguageReport[];
}

export interface AiCodeTaskResultDto {
  proposal: AiCodeTaskProposal;
  report: AiCodeTaskReport;
  model: string;
  notes: string | null;
  reasked: boolean;
}

export interface AiCodeTaskJobDto {
  jobId: number;
  mode: AiCodeTaskMode;
  taskId: number | null;
  status: AiCodeTaskJobStatus;
  progressText: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  appliedTaskId: number | null;
  result: AiCodeTaskResultDto | null;
}

export interface AiCodeTaskValidateResult {
  proposal: AiCodeTaskProposal;
  report: AiCodeTaskReport;
}

export interface AiCodeTaskApplyResult {
  taskId: number;
  created: boolean;
  saved: string[];
}
