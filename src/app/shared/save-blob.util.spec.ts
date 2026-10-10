import { saveBlob } from './save-blob.util';

describe('saveBlob', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('a megadott fájlnéven, DOM-ba tett linkkel tölt le, és csak a kattintás után szabadítja fel a blob URL-t', () => {
    vi.useFakeTimers();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:teszt');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    let clicked: { download: string; href: string; inDom: boolean } | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked = { download: this.download, href: this.href, inDom: document.body.contains(this) };
    });

    saveBlob(new Blob(['x']), 'Kiss Anna – beadás.docx');

    expect(clicked).toEqual({ download: 'Kiss Anna – beadás.docx', href: 'blob:teszt', inDom: true });
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:teszt');
  });
});
