const KB = 1024;
const MB = KB * KB;

/** Fájlméret emberi alakban: 1 KB alatt bájtban, 1 MB alatt egész KB-ban,
 *  fölötte egy tizedes MB-ban (a korábbi komponensenkénti `sizeLabel`-ek
 *  közös utódja). */
export function byteSize(bytes: number): string {
  if (bytes < KB) return `${bytes} bájt`;
  if (bytes < MB) return `${Math.round(bytes / KB)} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}
