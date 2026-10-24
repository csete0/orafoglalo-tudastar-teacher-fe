import { AiCodeTaskLanguage, AiCodeTaskProposal, AiLanguageReport, AiSectionReport } from '../../../models/ai-code-task.model';
import { extractErrorMessage } from '../../../shared/http-error/extract-error-message.util';

/** A BE-vel azonos korlátok. */
export const MAX_TOPIC = 200;
export const MAX_IDEA = 2000;
export const MAX_DATA_FILE_BYTES = 1024 * 1024;
export const MAX_SUBTASKS = 12;

export const LANGUAGE_OPTIONS: { key: AiCodeTaskLanguage; name: string; platformId: number }[] = [
  { key: 'python', name: 'Python', platformId: 2 },
  { key: 'csharp', name: 'C#', platformId: 5 },
  { key: 'java', name: 'Java', platformId: 10 },
  { key: 'cpp', name: 'C++', platformId: 8 },
];

export const PREMIUM_REQUIRED_MESSAGE =
  'Az AI programozási feladat csak prémium előfizetéssel érhető el. Prémium előfizetéssel havonta 30 feladatot készíthetsz vagy egészíthetsz ki.';

export const languageName = (key: string): string => LANGUAGE_OPTIONS.find((l) => l.key === key)?.name ?? key;

export type AiTaskTab = 'feladat' | 'adatfajl' | 'megoldas' | 'ellenorzes';

export const AI_TASK_TABS: { id: AiTaskTab; label: string }[] = [
  { id: 'feladat', label: 'Feladat' },
  { id: 'adatfajl', label: 'Adatfájl' },
  { id: 'megoldas', label: 'Mintamegoldás' },
  { id: 'ellenorzes', label: 'Ellenőrzés' },
];

const SECTION_STATUS: Record<AiSectionReport['status'], { ok: boolean; label: string }> = {
  ok: { ok: true, label: 'rendben' },
  format: { ok: true, label: 'csak formában tér el a Pythonétól' },
  missing: { ok: false, label: 'nincs kimenet' },
  mismatch: { ok: false, label: 'eltér a Python-megoldásétól' },
};

const LANGUAGE_STATUS: Record<AiLanguageReport['status'], { label: string; badge: string }> = {
  ok: { label: 'lefutott', badge: 'badge-success' },
  error: { label: 'hiba', badge: 'badge-danger' },
  mismatch: { label: 'eltérés', badge: 'badge-danger' },
  skipped: { label: 'nem futott', badge: 'badge-neutral' },
};

export const languageStatusLabel = (l: AiLanguageReport): string => LANGUAGE_STATUS[l.status]?.label ?? l.status;
export const languageBadge = (l: AiLanguageReport): string => LANGUAGE_STATUS[l.status]?.badge ?? 'badge-neutral';
export const sectionOk = (s: AiSectionReport): boolean => SECTION_STATUS[s.status]?.ok ?? false;
export const sectionLabel = (s: AiSectionReport): string => SECTION_STATUS[s.status]?.label ?? s.status;

/** Címke nélküli részfeladat neve - ugyanaz a tartalék, mint a szerver ellenőrzési riportjában („1. részfeladat”). */
export const subtaskName = (label: string | null | undefined, index: number) => (label?.trim() ? label.trim() : `${index + 1}. részfeladat`);

/**
 * A mentés összefoglalója a toasthoz. A szerver 1. módban részfeladatonként „kódrészlet: <címke> (<nyelvek>)” sort ad, címke nélküli
 * részfeladatnál üres névvel - ezeket a javaslat sorrendjéből (a friss kódrészletes részfeladatok közül a címke nélküliek) pótoljuk.
 */
export function savedSummary(saved: string[], proposal: AiCodeTaskProposal): string[] {
  const unnamed = proposal.subtasks
    .map((s, i) => ({ s, i }))
    .filter(({ s, i }) => !s.label?.trim() && proposal.languages.some((l) => l.snippets[i] && !l.snippets[i].existing && l.snippets[i].code.trim()))
    .map(({ i }) => subtaskName(null, i));
  const blank = /^kódrészlet:\s+\((.*)\)$/;
  const blankCount = saved.filter((e) => blank.test(e)).length;
  let k = 0;
  return saved.map((entry) => {
    const m = blank.exec(entry);
    if (!m) return entry;
    const name = blankCount === unnamed.length ? unnamed[k++] : null;
    return name ? `kódrészlet: ${name} (${m[1]})` : `kódrészlet (${m[1]})`;
  });
}

export const sameProposal = (a: AiCodeTaskProposal | null, b: AiCodeTaskProposal | null) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Az AI-feladat végpontjainak hibái magyarul (errorType és státusz szerint), különben a szerver üzenete vagy a tartalék. */
export function aiTaskErrorText(err: unknown, fallback: string): string {
  const e = err as { status?: number; error?: { errorType?: string } } | null;
  switch (e?.error?.errorType) {
    case 'AiCodeTaskPremiumRequired':
      return PREMIUM_REQUIRED_MESSAGE;
    case 'AiCodeTaskQuotaExceeded':
      return 'Elfogyott a havi AI-feladat kereted - a következő hónapban újra kérhetsz.';
    case 'AiCodeTaskAlreadyRunning':
      return 'Már készül egy AI-feladatod - várd meg, amíg elkészül.';
    case 'RequestTooLarge':
      return 'A feladat túl nagy az ellenőrzéshez (legfeljebb 3 MB) - rövidítsd az adatfájlt (pl. kevesebb sor a generáló szkriptben).';
    case 'FeatureDisabled':
      return 'Az AI programozási feladat most nincs bekapcsolva. Próbáld később.';
  }
  if (e?.status === 429) return 'Túl sok kérés rövid időn belül - várj néhány percet, és próbáld újra.';
  if (e?.status === 413) return 'A feladat túl nagy az ellenőrzéshez (legfeljebb 3 MB) - rövidítsd az adatfájlt (pl. kevesebb sor a generáló szkriptben).';
  return extractErrorMessage(err, fallback);
}
