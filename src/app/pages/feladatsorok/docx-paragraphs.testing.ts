/** Teszt-segéd (csak specekből): minimális ZIP / .docx összeállítása tárolt (vagy előre tömörített) bejegyzésekkel. */

export interface ZipEntry {
  name: string;
  data: Uint8Array;
  /** 0 = tárolt (alap), 8 = deflate (a `data` ekkor már tömörített). */
  method?: 0 | 8;
}

export function buildZip(entries: ZipEntry[]): ArrayBuffer {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const local = new DataView(new ArrayBuffer(30 + name.length));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, e.method ?? 0, true);
    local.setUint32(18, e.data.length, true);
    local.setUint32(22, e.data.length, true);
    local.setUint16(26, name.length, true);
    new Uint8Array(local.buffer).set(name, 30);
    const central = new DataView(new ArrayBuffer(46 + name.length));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(10, e.method ?? 0, true);
    central.setUint32(20, e.data.length, true);
    central.setUint32(24, e.data.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    new Uint8Array(central.buffer).set(name, 46);
    locals.push(new Uint8Array(local.buffer), e.data);
    centrals.push(new Uint8Array(central.buffer));
    offset += 30 + name.length + e.data.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out.buffer;
}

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

/** document.xml a megadott törzs-tartalommal. */
export const documentXml = (body: string) => `<?xml version="1.0" encoding="UTF-8"?><w:document ${W}><w:body>${body}</w:body></w:document>`;

/** Egyszerű bekezdés egy szövegrésszel. */
export const para = (text: string) => `<w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

/** Tárolt .docx a megadott bekezdés-szövegekkel. */
export function buildDocx(paragraphs: string[]): ArrayBuffer {
  return buildZip([{ name: 'word/document.xml', data: new TextEncoder().encode(documentXml(paragraphs.map(para).join(''))) }]);
}
