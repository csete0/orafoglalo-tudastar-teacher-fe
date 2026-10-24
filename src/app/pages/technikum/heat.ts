import { EXAM_PASS_RATIO } from '../../models/technikum.model';

/** A vizsgarész-térkép színskálájának sávjai (a sikerességi határ 40%). */
export type Heat = 'fail' | 'low' | 'mid' | 'high';

export const HEAT_CLASS: Record<Heat, string> = {
  fail: 'bg-danger-subtle text-danger',
  low: 'bg-warning-subtle text-warning',
  mid: 'bg-primary-subtle text-primary',
  high: 'bg-success-subtle text-success',
};

/** Pontarány → színsáv. */
export function heat(ratio: number): Heat {
  if (ratio < EXAM_PASS_RATIO) return 'fail';
  if (ratio < 0.6) return 'low';
  return ratio < 0.8 ? 'mid' : 'high';
}
