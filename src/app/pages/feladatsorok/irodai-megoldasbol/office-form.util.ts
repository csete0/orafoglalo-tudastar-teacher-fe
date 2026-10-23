/** Szám-mező értéke: az üres mező NaN (a validálás jelzi), különben szám. */
export function toInt(value: unknown): number {
  return value === null || value === '' || value === undefined ? Number.NaN : Number(value);
}

/** Üres (csak szóközös) szöveg → null (a szerver a hiányzó paramétert várja). */
export function emptyToNull(value: string): string | null {
  return value.trim() ? value : null;
}

/** A felületen 1-től számozott sorszám a szerződés 0-alapú indexévé (üres → null). */
export function oneBasedToIndex(value: unknown): number | null {
  const n = toInt(value);
  return Number.isNaN(n) ? null : n - 1;
}

/** Egy rész (pl. betű, kitöltés) ki-/bekapcsolása a megadott sorrendben; ha semmi sincs bejelölve, null (= mindent). */
export function toggledParts(current: readonly string[] | null | undefined, part: string, order: readonly { key: string }[]): string[] | null {
  const selected = new Set(current ?? []);
  if (selected.has(part)) selected.delete(part);
  else selected.add(part);
  const parts = order.map((p) => p.key).filter((k) => selected.has(k));
  return parts.length === 0 ? null : parts;
}
