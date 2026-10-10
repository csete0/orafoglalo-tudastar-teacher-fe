/**
 * Egy memóriában lévő fájl (blob) letöltése a megadott néven. A link DOM-ba kerül, a blob URL pedig csak a
 * kattintás után szabadul fel - DOM-on kívüli linknél / azonnali felszabadításnál a Chromium a megadott név
 * helyett „download” vagy a blob azonosítója néven menti, nagy fájlnál pedig a letöltés még olvashatja az URL-t.
 */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
