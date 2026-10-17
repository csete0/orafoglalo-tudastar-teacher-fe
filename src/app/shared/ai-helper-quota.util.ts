/**
 * A rendszer által fizetett tanári MI-segítségek (kérdések szövegből, dolgozat-visszajelzés vázlat): csak Prémium tanárnak,
 * havi kerettel. A keretet a GET api/teacher/ai-helpers/quota és a két végpont válaszának `quota` mezője adja.
 */
export interface AiHelperQuotaItemDto {
  used: number;
  limit: number;
}

export interface AiHelperQuotaDto {
  /** UTC hónap (yyyy-MM) - a keret a hónap elején újraindul. */
  month: string;
  premium: boolean;
  /** Egy egység = egy generálás. */
  quizSource: AiHelperQuotaItemDto;
  /** Egy egység = egy diák vázlata. */
  testFeedback: AiHelperQuotaItemDto;
}

export const AI_HELPER_PREMIUM_REQUIRED = 'AiHelperPremiumRequired';
export const AI_HELPER_QUOTA_EXCEEDED = 'AiHelperQuotaExceeded';
export const AI_HELPER_PREMIUM_TEXT = 'Ez az MI-segítség Prémium tanári előfizetéssel érhető el.';

export type AiHelperBlock = 'premium' | 'quota';

/** Prémium hiánya vagy elfogyott keret miatti hiba-e (a BE `errorType` mezője alapján). */
export function aiHelperBlock(err: unknown): AiHelperBlock | null {
  const type = (err as { error?: { errorType?: string } })?.error?.errorType;
  if (type === AI_HELPER_PREMIUM_REQUIRED) return 'premium';
  if (type === AI_HELPER_QUOTA_EXCEEDED) return 'quota';
  return null;
}

/** A prémium / keret hibák érthető szövege (a keretnél a BE mondata, benne a havi limit); egyéb hibánál null. */
export function aiHelperErrorMessage(err: unknown): string | null {
  const block = aiHelperBlock(err);
  if (block === 'premium') return AI_HELPER_PREMIUM_TEXT;
  if (block === 'quota') {
    const message = (err as { error?: { errorMessage?: string } })?.error?.errorMessage;
    return message?.trim() || 'Elfogyott a havi kereted - a következő hónapban újra kérhetsz.';
  }
  return null;
}

export function quotaRemaining(q: AiHelperQuotaItemDto): number {
  return Math.max(0, q.limit - q.used);
}
