import { unzipSync } from 'fflate';

export interface WebPreview {
  /** Szkriptmentes, önálló HTML a sandbox="" iframe-hez. */
  srcdoc: string;
  /** A képekhez létrehozott blob: címek; a hívó felel a visszavonásukról. */
  urls: string[];
}

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', ico: 'image/x-icon', avif: 'image/avif',
};
const EXTERNAL = /^([a-z][a-z0-9+.-]*:|\/\/|#)/i;
const text = (b: Uint8Array) => new TextDecoder().decode(b);

/** .zip vagy egyetlen .html bájtjaiból fájltérkép (útvonal → tartalom). */
export function readWebFiles(bytes: Uint8Array): Record<string, Uint8Array> {
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  return isZip ? unzipSync(bytes) : { 'index.html': bytes };
}

function resolve(baseDir: string, ref: string): string | null {
  const clean = ref.trim().split(/[?#]/)[0];
  if (!clean || EXTERNAL.test(ref.trim())) return null;
  const parts = baseDir ? baseDir.split('/') : [];
  for (const seg of decodeURI(clean).split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

const dirOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf('/'), 0));

export function buildWebPreview(files: Record<string, Uint8Array>): WebPreview {
  const names = Object.keys(files).filter((n) => !n.endsWith('/'));
  const htmls = names.filter((n) => /\.html?$/i.test(n)).sort((a, b) => a.split('/').length - b.split('/').length);
  const page = htmls.find((n) => /(^|\/)index\.html?$/i.test(n)) ?? htmls[0];
  if (!page) throw new Error('Nincs HTML-fájl a csomagban.');

  const urls: string[] = [];
  const cache = new Map<string, string>();
  const blobUrl = (baseDir: string, ref: string): string | null => {
    const path = resolve(baseDir, ref);
    const ext = path?.split('.').pop()?.toLowerCase() ?? '';
    if (!path || !files[path] || !MIME[ext]) return null;
    let url = cache.get(path);
    if (!url) {
      url = URL.createObjectURL(new Blob([files[path] as BlobPart], { type: MIME[ext] }));
      cache.set(path, url);
      urls.push(url);
    }
    return url;
  };
  const cssWithUrls = (css: string, baseDir: string) =>
    css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q: string, ref: string) => {
      const u = blobUrl(baseDir, ref);
      return u ? `url(${q}${u}${q})` : m;
    });

  const baseDir = dirOf(page);
  const doc = new DOMParser().parseFromString(text(files[page]), 'text/html');
  doc.querySelectorAll('script').forEach((s) => s.remove());
  doc.querySelectorAll('link[rel~="stylesheet"][href]').forEach((link) => {
    const path = resolve(baseDir, link.getAttribute('href')!);
    if (!path || files[path] === undefined) return;
    const style = doc.createElement('style');
    style.textContent = cssWithUrls(text(files[path]), dirOf(path));
    link.replaceWith(style);
  });
  doc.querySelectorAll('style').forEach((s) => (s.textContent = cssWithUrls(s.textContent ?? '', baseDir)));
  doc.querySelectorAll('[style*="url("]').forEach((el) => el.setAttribute('style', cssWithUrls(el.getAttribute('style')!, baseDir)));
  doc.querySelectorAll('[src], link[href]').forEach((el) => {
    const attr = el.hasAttribute('src') ? 'src' : 'href';
    const u = blobUrl(baseDir, el.getAttribute(attr)!);
    if (u) el.setAttribute(attr, u);
  });
  return { srcdoc: '<!doctype html>' + doc.documentElement.outerHTML, urls };
}

export async function webPreviewFromBlob(blob: Blob): Promise<WebPreview> {
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
  const bytes = new Uint8Array(buffer);
  return buildWebPreview(readWebFiles(bytes));
}
