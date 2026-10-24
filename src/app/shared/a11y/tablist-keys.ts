/** ARIA-fülsor billentyűzés (WAI-ARIA Tabs, kézi aktiválás nélkül): a
 *  ←/→ nyíl az előző/következő fülre lép, a végeken körbefordul. Visszaadja
 *  a cél-fül indexét, vagy `null`-t, ha a billentyű nem fül-navigáció — ekkor
 *  a hívó ne nyelje el az eseményt (`preventDefault`). */
export function tablistKeyTarget(key: string, index: number, count: number): number | null {
  const delta = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
  if (!delta || count <= 0) return null;
  return (index + delta + count) % count;
}
