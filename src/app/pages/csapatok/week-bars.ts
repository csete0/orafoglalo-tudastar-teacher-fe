import { TeamWeek } from '../../models/team.model';

/** Egy heti oszlop: a tagonkénti szakaszok (0-100 egységes nézetben, SVG-ben fentről mérve: `y` a szakasz teteje). */
export interface WeekBar { weekStart: string; total: number; segments: { key: string; count: number; y: number; h: number }[]; }

/**
 * Halmozott heti oszlopok: a sáv-magasság a legnagyobb heti összeghez arányos (az a hét 100 egység), az első kulcs legalul.
 * A diák FE (csapat/activity/week-bars.ts) szó szerint ugyanezt használja.
 */
export function weekBars(weeks: TeamWeek[], keys: string[]): WeekBar[] {
  const totals = weeks.map((w) => keys.reduce((sum, k) => sum + (w.commits[k] ?? 0), 0));
  const max = Math.max(1, ...totals);
  return weeks.map((w, i) => {
    let used = 0;
    const segments = keys.filter((k) => (w.commits[k] ?? 0) > 0).map((k) => {
      const h = Math.round(((w.commits[k] ?? 0) / max) * 100);
      used += h;
      return { key: k, count: w.commits[k] ?? 0, h, y: 0 };
    });
    // fentről: az utolsó kulcs van legfelül, az első legalul
    let top = 100 - used;
    for (let s = segments.length - 1; s >= 0; s--) {
      segments[s].y = top;
      top += segments[s].h;
    }
    return { weekStart: w.weekStart, total: totals[i], segments };
  });
}
