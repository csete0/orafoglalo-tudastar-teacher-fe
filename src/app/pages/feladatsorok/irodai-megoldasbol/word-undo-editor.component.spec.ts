import { TestBed } from '@angular/core/testing';
import { OfficeUndoOp, OfficeWordParagraph } from '../../../models/office-task.model';
import { WordUndoEditorComponent } from './word-undo-editor.component';

const W_NULLS = { sheet: null, range: null, name: null, index: null, columns: null, parts: null };

const op = (o: Partial<OfficeUndoOp> = {}): OfficeUndoOp => ({
  op: 'clearRunFormatting',
  ...W_NULLS,
  from: { index: 1, startsWith: 'Program' },
  to: null,
  enabled: true,
  result: null,
  message: null,
  ...o,
});

const PARAGRAPHS: OfficeWordParagraph[] = [
  { index: 0, text: 'Osztálykirándulás', truncated: false, style: 'Heading1', inTable: false },
  { index: 1, text: 'Program', truncated: false, style: null, inTable: false },
  { index: 2, text: '', truncated: false, style: null, inTable: false },
];

describe('WordUndoEditorComponent', () => {
  function create(initial: OfficeUndoOp, paragraphs: OfficeWordParagraph[] | null = PARAGRAPHS, unavailable: string | null = null) {
    const fixture = TestBed.createComponent(WordUndoEditorComponent);
    fixture.componentRef.setInput('op', initial);
    fixture.componentRef.setInput('key', '0-3');
    fixture.componentRef.setInput('paragraphs', paragraphs);
    fixture.componentRef.setInput('paragraphsUnavailable', unavailable);
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

  it('bekezdés-horgonyok a listából; a „to” csak „from” mellett, és nem lehet előtte', () => {
    const { fixture, emitted } = create(op());
    expect(q(fixture, 'io-undo-editor-0-3')).not.toBeNull();
    expect(q(fixture, 'io-to-0-3-option-0')).toBeNull();
    q(fixture, 'io-to-0-3-option-2')!.click();
    fixture.detectChanges();
    expect(emitted.at(-1)).toMatchObject({ from: { index: 1, startsWith: 'Program' }, to: { index: 2, startsWith: '' } });
    q(fixture, 'io-from-0-3-option-0')!.click();
    fixture.detectChanges();
    expect(emitted.at(-1)!.from).toEqual({ index: 0, startsWith: 'Osztálykirándulás' });
  });

  it('a „from” törlése a „to”-t is törli; „from” nélkül nincs „to”-választó', () => {
    const { fixture, emitted } = create(op({ op: 'removeHyperlinks', to: { index: 2, startsWith: '' } }));
    q(fixture, 'io-from-0-3-clear')!.click();
    fixture.detectChanges();
    expect(emitted.at(-1)).toMatchObject({ from: null, to: null });
    expect(q(fixture, 'io-to-0-3')).toBeNull();
  });

  it('szövegcserénél nincs „to”, van keresett és eredeti szöveg', () => {
    const { fixture, emitted } = create(op({ op: 'replaceText', find: 'Program', original: null }));
    expect(q(fixture, 'io-to-0-3')).toBeNull();
    type(fixture, 'io-original-0-3', 'Napirend');
    expect(emitted.at(-1)).toMatchObject({ op: 'replaceText', find: 'Program', original: 'Napirend' });
  });

  it('bekezdés-lista hiányában az indok és a kézi megadás látszik', () => {
    const { fixture } = create(op(), null, 'A megoldás bekezdéseinek listája nem érhető el');
    expect(q(fixture, 'io-from-0-3-list')).toBeNull();
    expect(q(fixture, 'io-from-0-3-unavailable')!.textContent).toContain('nem érhető el');
    expect(q(fixture, 'io-from-0-3-index')).not.toBeNull();
  });

  it('műveletváltás; a sorszám a felületen 1-től, a szerződésben 0-alapú', () => {
    const { fixture, emitted } = create(op());
    fixture.componentInstance.changeKind('removeImage');
    fixture.detectChanges();
    expect(emitted.at(-1)).toMatchObject({ op: 'removeImage', from: null, parts: null });
    expect(fixture.nativeElement.querySelector('label[for="io-index-0-3"]')!.textContent).toContain('A(z) rajz sorszáma');
    type(fixture, 'io-index-0-3', '4');
    expect(emitted.at(-1)!.index).toBe(3);
    type(fixture, 'io-index-0-3', '');
    expect(emitted.at(-1)!.index).toBeNull();
  });

  it('szakasz (10 + „minden”) és mező választható', () => {
    const { fixture, emitted } = create(op({ op: 'removeHeader', from: null, section: null }));
    const options = q(fixture, 'io-section-0-3')!.querySelectorAll('option');
    expect(options.length).toBe(11);
    expect(options[3].textContent).toContain('3. szakasz');

    fixture.componentInstance.changeKind('removeField');
    fixture.detectChanges();
    expect(q(fixture, 'io-field-0-3')!.textContent).toContain('NUMPAGES - oldalak száma');
    fixture.componentInstance.set({ field: 'DATE' });
    expect(emitted.at(-1)).toMatchObject({ op: 'removeField', field: 'DATE' });
  });

  it('részek a művelet saját listájából, a felület sorrendjében; semmi = null', () => {
    const { fixture, emitted } = create(op({ op: 'removeFootnotes', from: null }));
    q(fixture, 'io-part-0-3-endnotes')!.click();
    q(fixture, 'io-part-0-3-footnotes')!.click();
    expect(emitted.at(-1)!.parts).toEqual(['footnotes', 'endnotes']);
    q(fixture, 'io-part-0-3-endnotes')!.click();
    q(fixture, 'io-part-0-3-footnotes')!.click();
    expect(emitted.at(-1)!.parts).toBeNull();
  });
});
