import { TestBed } from '@angular/core/testing';
import { OfficeUndoOp, OfficeWebElement } from '../../../models/office-task.model';
import { WebUndoEditorComponent } from './web-undo-editor.component';

const NULLS = { sheet: null, range: null, name: null, index: null, columns: null, parts: null };
const op = (o: Partial<OfficeUndoOp> = {}): OfficeUndoOp => ({ op: 'removeAttribute', ...NULLS, file: 'index.html', element: { index: 12, tag: 'img' }, attribute: 'alt', enabled: true, result: null, message: null, ...o });
const el = (index: number, tag: string, depth: number, o: Partial<OfficeWebElement> = {}): OfficeWebElement => ({ file: 'index.html', index, tag, depth, text: '', ...o });
const ELEMENTS: OfficeWebElement[] = [
  el(0, 'html', 0, { attributes: 'lang="hu"' }),
  el(3, 'title', 2, { text: 'Kockafilm' }),
  el(12, 'img', 4, { id: 'plakat', class: ' kep  nagy ', attributes: 'src="a.png"' }),
  el(0, 'html', 0, { file: 'oldal.html' }),
];
const FILES = ['index.html', 'oldal.html', 'kep.png', 'stilus.css'];

describe('WebUndoEditorComponent', () => {
  function create(initial: OfficeUndoOp, elements: OfficeWebElement[] = ELEMENTS) {
    const fixture = TestBed.createComponent(WebUndoEditorComponent);
    fixture.componentRef.setInput('op', initial);
    fixture.componentRef.setInput('key', '1-2');
    fixture.componentRef.setInput('files', FILES);
    fixture.componentRef.setInput('elements', elements);
    const emitted: OfficeUndoOp[] = [];
    // A szülő viselkedése: a kiadott művelet lesz az új bemenet.
    fixture.componentInstance.opChange.subscribe((next) => {
      emitted.push(next);
      fixture.componentRef.setInput('op', next);
    });
    fixture.detectChanges();
    return { fixture, emitted };
  }

  const q = (fixture: { nativeElement: HTMLElement }, id: string) => fixture.nativeElement.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  function type(fixture: ReturnType<typeof create>['fixture'], id: string, value: string) {
    const el = q(fixture, id) as HTMLInputElement;
    el.value = value;
    el.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('elem-műveletnél csak a HTML-fájlok, CSS-műveletnél a stíluslapok is; a művelet saját (ismeretlen) fájlja is választható', () => {
    const { fixture } = create(op());
    const c = fixture.componentInstance;
    expect(Array.from((q(fixture, 'io-file-1-2') as HTMLSelectElement).options).map((o) => o.textContent!.trim())).toEqual(['válassz…', 'index.html', 'oldal.html']);
    expect(c.fileOptions(op({ op: 'removeCssRule', file: 'regi.css' }))).toEqual(['index.html', 'oldal.html', 'stilus.css', 'regi.css']);
  });

  it('elem a fájl listájából (behúzással, #id.osztály), a címke a megoldás szerinti; fájlváltás törli az elemet', () => {
    const { fixture, emitted } = create(op());
    const select = q(fixture, 'io-element-1-2') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent!)).toEqual([
      'válassz…', '[1] <html> lang="hu"', '    [4] <title> „Kockafilm”', ' '.repeat(8) + '[13] <img#plakat.kep.nagy> src="a.png"',
    ]);
    fixture.componentInstance.setElement(3);
    expect(emitted.at(-1)!.element).toEqual({ index: 3, tag: 'title' });
    fixture.componentInstance.setElement(99);
    expect(emitted.at(-1)!.element).toEqual({ index: null, tag: null });
    fixture.componentInstance.setFile('oldal.html');
    expect(emitted.at(-1)).toMatchObject({ file: 'oldal.html', element: { index: null, tag: null } });
  });

  it('elem-lista nélkül kézi sorszám (1-től) és címke; az üres sorszám null', () => {
    const { fixture, emitted } = create(op(), []);
    expect(q(fixture, 'io-element-1-2')).toBeNull();
    type(fixture, 'io-element-index-1-2', '20');
    expect(emitted.at(-1)!.element).toEqual({ index: 19, tag: 'img' });
    type(fixture, 'io-element-tag-1-2', 'li');
    expect(emitted.at(-1)!.element).toEqual({ index: 19, tag: 'li' });
    type(fixture, 'io-element-index-1-2', '');
    expect(emitted.at(-1)!.element).toEqual({ index: null, tag: 'li' });
  });

  it('műveletváltás: a nem megengedett mezők törlődnek; CSS-szabálynál szelektor és @media (üres = null)', () => {
    const { fixture, emitted } = create(op());
    fixture.componentInstance.changeKind('removeCssRule');
    fixture.detectChanges();
    expect(emitted.at(-1)).toMatchObject({ op: 'removeCssRule', element: null, attribute: null, selector: '' });
    expect(q(fixture, 'io-element-1-2')).toBeNull();
    type(fixture, 'io-selector-1-2', '#fejlec h1');
    type(fixture, 'io-media-1-2', '  ');
    expect(emitted.at(-1)).toMatchObject({ selector: '#fejlec h1', media: null });
    type(fixture, 'io-media-1-2', '(max-width: 600px)');
    expect(emitted.at(-1)!.media).toBe('(max-width: 600px)');
  });

  it('címke-visszaállításnál az eredeti címke, szövegcserénél a keresett és az eredeti szöveg szerkeszthető', () => {
    const { fixture, emitted } = create(op({ op: 'renameElement', attribute: null, original: 'td' }));
    expect(q(fixture, 'io-find-1-2')).toBeNull();
    type(fixture, 'io-original-tag-1-2', 'th');
    expect(emitted.at(-1)!.original).toBe('th');
    fixture.componentInstance.changeKind('replaceText');
    fixture.detectChanges();
    expect(q(fixture, 'io-original-tag-1-2')).toBeNull();
    type(fixture, 'io-find-1-2', 'Filmklub');
    type(fixture, 'io-original-1-2', 'Klub');
    expect(emitted.at(-1)).toMatchObject({ op: 'replaceText', find: 'Filmklub', original: 'Klub' });
  });
});
