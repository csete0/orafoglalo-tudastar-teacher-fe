import { MAX_PARAGRAPHS } from './irodai-undo.util';

/**
 * A Word-megoldás bekezdései a horgony-választóhoz, a szerver számozásával (WordUndo.BodyParagraphs / ParagraphText): a törzs összes
 * bekezdése dokumentum-sorrendben (táblázatcelláké is, szövegdobozoké nem); a szöveg a bekezdés saját szövegrészeiből (törölt nélkül),
 * tabulátor = \t, sortörés = \n, oldaltörés = \f, nem törő kötőjel = „-”. Függőség nélkül: ZIP-központi könyvtár + a böngésző
 * DecompressionStream-je + DOMParser.
 */

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const OFFICE_DOCUMENT = /\/officeDocument$/;

/** Egy ZIP-bejegyzés kicsomagolva (tárolt vagy deflate), vagy null, ha nincs ilyen / nem olvasható. */
export async function readZipEntry(data: ArrayBuffer, name: string): Promise<Uint8Array | null> {
  const view = new DataView(data);
  let eocd = -1;
  for (let i = data.byteLength - 22; i >= Math.max(0, data.byteLength - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = view.getUint16(eocd + 10, true);
  const decoder = new TextDecoder();
  let p = view.getUint32(eocd + 16, true);
  for (let n = 0; n < count && p + 46 <= data.byteLength; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) return null;
    const method = view.getUint16(p + 10, true);
    const size = view.getUint32(p + 20, true);
    const nameLength = view.getUint16(p + 28, true);
    const next = p + 46 + nameLength + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
    if (decoder.decode(new Uint8Array(data, p + 46, nameLength)) === name) {
      const local = view.getUint32(p + 42, true);
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const raw = new Uint8Array(data, start, size);
      if (method === 0) return raw;
      if (method !== 8) return null;
      const stream = new Response(raw).body!.pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    p = next;
  }
  return null;
}

const isW = (e: Element, localName: string) => e.namespaceURI === W && e.localName === localName;

function closest(e: Element, localName: string, stop: Element | null): Element | null {
  for (let a = e.parentElement; a && a !== stop; a = a.parentElement) if (isW(a, localName)) return a;
  return null;
}

function paragraphText(p: Element): string {
  let text = '';
  for (const run of Array.from(p.getElementsByTagNameNS(W, 'r'))) {
    if (closest(run, 'p', null) !== p || closest(run, 'del', p)) continue;
    for (const child of Array.from(run.children)) {
      if (child.namespaceURI !== W) continue;
      switch (child.localName) {
        case 't':
          text += child.textContent ?? '';
          break;
        case 'tab':
          text += '\t';
          break;
        case 'br':
          text += child.getAttributeNS(W, 'type') === 'page' ? '\f' : '\n';
          break;
        case 'noBreakHyphen':
          text += '-';
          break;
      }
    }
  }
  return text;
}

/** A document.xml törzsének bekezdés-szövegei (legfeljebb 5000, mint a tény-kinyerésben). */
export function documentParagraphs(xml: string): string[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  if (!body) throw new Error('nincs dokumentumtörzs');
  const result: string[] = [];
  for (const p of Array.from(body.getElementsByTagNameNS(W, 'p'))) {
    if (closest(p, 'txbxContent', body)) continue;
    result.push(paragraphText(p));
    if (result.length >= MAX_PARAGRAPHS) break;
  }
  return result;
}

/** A fő dokumentumrész útvonala a csomag kapcsolataiból (_rels/.rels), alapból word/document.xml. */
function mainPartPath(rels: string | null): string {
  if (!rels) return 'word/document.xml';
  const doc = new DOMParser().parseFromString(rels, 'application/xml');
  const rel = Array.from(doc.getElementsByTagName('Relationship')).find((r) => OFFICE_DOCUMENT.test(r.getAttribute('Type') ?? ''));
  return (rel?.getAttribute('Target') ?? 'word/document.xml').replace(/^\//, '');
}

/** A .docx bekezdései (a szerver horgony-számozásával). Olvashatatlan fájlnál hibát dob. */
export async function readDocxParagraphs(data: ArrayBuffer): Promise<string[]> {
  const decoder = new TextDecoder();
  const rels = await readZipEntry(data, '_rels/.rels');
  const main = await readZipEntry(data, mainPartPath(rels ? decoder.decode(rels) : null));
  if (!main) throw new Error('nem Word-dokumentum');
  return documentParagraphs(decoder.decode(main));
}
