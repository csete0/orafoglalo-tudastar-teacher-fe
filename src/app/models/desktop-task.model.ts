import { AiHelperQuotaItemDto } from '../shared/ai-helper-quota.util';

/** Asztali (WPF/WinForms) feladatsor témából - a backend DesktopTaskModels.cs tükre. */

export type DesktopTaskLevel = 'alap' | 'kozep' | 'emelt';
export type DesktopFramework = 'any' | 'wpf' | 'winforms';

export interface DesktopTaskStartRequest {
  topic: string;
  level: DesktopTaskLevel;
  count: number;
  framework: DesktopFramework;
}

export interface DesktopTaskStartResult {
  jobId: number;
  status: string;
  quota: AiHelperQuotaItemDto;
}

export interface DesktopRubricItem {
  text: string;
  points: number;
}

export interface DesktopTaskItem {
  title: string;
  /** A diák bevezetője és a beadás módja. */
  description: string;
  /** A számozott feladatpontok - mentéskor részfeladatok. */
  steps: string[];
  rubric: DesktopRubricItem[];
  /** Megoldási vázlat a tanárnak / értékelőnek (mentéskor „referencia_megoldas.txt”). */
  reference: string;
}

export interface DesktopTaskProposal {
  tasks: DesktopTaskItem[];
}

export interface DesktopTaskJobDto {
  jobId: number;
  status: 'queued' | 'generating' | 'done' | 'failed' | string;
  progressText: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  appliedTaskId: number | null;
  request: DesktopTaskStartRequest | null;
  result: { proposal: DesktopTaskProposal; model: string } | null;
}

export interface DesktopTaskApplyResult {
  taskIds: number[];
  saved: string[];
}

/** A BE-vel azonos korlátok (DesktopTaskRules). */
export const DESKTOP_LIMITS = {
  minTopic: 3,
  maxTopic: 200,
  maxCount: 8,
  maxTitle: 200,
  maxDescription: 4500,
  maxSteps: 10,
  maxStep: 1500,
  maxItems: 8,
  maxItemText: 1000,
  minItemPoints: 2,
  maxItemPoints: 10,
  minTotal: 8,
  maxTotal: 15,
  maxReference: 4000,
} as const;

/** A feladat hibái a mentés előtt (a szerver ugyanezt ellenőrzi). */
export function desktopTaskProblems(t: DesktopTaskItem): string[] {
  const L = DESKTOP_LIMITS;
  const errors: string[] = [];
  const len = (s: string, max: number) => s.trim().length > 0 && s.trim().length <= max;
  if (!len(t.title, L.maxTitle)) errors.push(`A cím 1-${L.maxTitle} karakter lehet.`);
  if (!len(t.description, L.maxDescription)) errors.push(`A leírás 1-${L.maxDescription} karakter lehet.`);
  if (t.steps.length < 1 || t.steps.length > L.maxSteps) errors.push(`1-${L.maxSteps} feladatpont lehet.`);
  if (t.steps.some((s) => !len(s, L.maxStep))) errors.push(`Minden feladatpont 1-${L.maxStep} karakter legyen.`);
  if (t.rubric.length < 1 || t.rubric.length > L.maxItems) errors.push(`1-${L.maxItems} szempont lehet.`);
  if (t.rubric.some((r) => !len(r.text, L.maxItemText))) errors.push(`Minden szempont szövege 1-${L.maxItemText} karakter legyen.`);
  if (t.rubric.some((r) => !Number.isInteger(r.points) || r.points < L.minItemPoints || r.points > L.maxItemPoints))
    errors.push(`Szempontonként ${L.minItemPoints}-${L.maxItemPoints} pont adható.`);
  const total = t.rubric.reduce((sum, r) => sum + (Number(r.points) || 0), 0);
  if (total < L.minTotal || total > L.maxTotal) errors.push(`A szempontok összpontszáma ${L.minTotal} és ${L.maxTotal} között lehet (most ${total}).`);
  if (!len(t.reference, L.maxReference)) errors.push(`A megoldási vázlat 1-${L.maxReference} karakter lehet.`);
  return errors;
}
