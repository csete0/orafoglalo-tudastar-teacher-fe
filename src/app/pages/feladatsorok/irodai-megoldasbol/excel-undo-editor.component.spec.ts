import { TestBed } from '@angular/core/testing';
import { OfficeUndoOp } from '../../../models/office-task.model';
import { ExcelUndoEditorComponent } from './excel-undo-editor.component';

const op = (o: Partial<OfficeUndoOp> = {}): OfficeUndoOp => ({
  op: 'clearFormulas',
  sheet: 'Adatok',
  range: 'B5',
  name: null,
  index: null,
  columns: null,
  parts: null,
  enabled: true,
  result: 'ok',
  message: null,
  ...o,
});

describe('ExcelUndoEditorComponent', () => {
  function create(initial: OfficeUndoOp) {
    const fixture = TestBed.createComponent(ExcelUndoEditorComponent);
    fixture.componentRef.setInput('op', initial);
    fixture.componentRef.setInput('key', '1-2');
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

  it('a mezők id-je és testid-je a kulcsból jön; csak a művelet mezői látszanak', () => {
    const { fixture } = create(op());
    expect(q(fixture, 'io-undo-editor-1-2')).not.toBeNull();
    expect(q(fixture, 'io-op-1-2')!.id).toBe('io-op-1-2');
    expect(fixture.nativeElement.querySelector('label[for="io-sheet-1-2"]')).not.toBeNull();
    expect(q(fixture, 'io-range-1-2')).not.toBeNull();
    expect(q(fixture, 'io-columns-1-2')).toBeNull();
    expect(q(fixture, 'io-name-1-2')).toBeNull();
    expect(q(fixture, 'io-index-1-2')).toBeNull();
  });

  it('szövegmező: a teljes, módosított műveletet adja ki; az üres szöveg null', () => {
    const { fixture, emitted } = create(op());
    type(fixture, 'io-sheet-1-2', 'Eredmények');
    expect(emitted.at(-1)).toEqual(op({ sheet: 'Eredmények' }));
    type(fixture, 'io-range-1-2', '   ');
    expect(emitted.at(-1)).toEqual(op({ sheet: 'Eredmények', range: null }));
  });

  it('műveletváltáskor a nem megengedett paraméterek törlődnek, és az új mezők jelennek meg', () => {
    const { fixture, emitted } = create(op({ parts: ['font'] }));
    fixture.componentInstance.changeKind('resetColumnWidth');
    fixture.detectChanges();
    expect(emitted.at(-1)).toMatchObject({ op: 'resetColumnWidth', sheet: 'Adatok', range: null, parts: null });
    expect(q(fixture, 'io-columns-1-2')).not.toBeNull();
    expect(q(fixture, 'io-range-1-2')).toBeNull();
  });

  it('diagram: a felület 1-től számoz, a szerződés 0-alapú; üres mező → null', async () => {
    const { fixture, emitted } = create(op({ op: 'removeChart', range: null, index: 0 }));
    await fixture.whenStable(); // az ngModel aszinkron írja az értéket
    expect((q(fixture, 'io-index-1-2') as HTMLInputElement).value).toBe('1');
    expect(fixture.nativeElement.textContent).toContain('Diagram neve vagy címe');
    type(fixture, 'io-index-1-2', '3');
    expect(emitted.at(-1)!.index).toBe(2);
    type(fixture, 'io-index-1-2', '');
    expect(emitted.at(-1)!.index).toBeNull();
  });

  it('formázás-részek: a felület sorrendjében, semmi bejelölve = null (minden rész)', () => {
    const { fixture, emitted } = create(op({ op: 'resetStyle', range: 'A1:D1' }));
    q(fixture, 'io-part-1-2-border')!.click();
    q(fixture, 'io-part-1-2-numberFormat')!.click();
    expect(emitted.at(-1)!.parts).toEqual(['numberFormat', 'border']);
    expect((q(fixture, 'io-part-1-2-border') as HTMLInputElement).checked).toBe(true);
    q(fixture, 'io-part-1-2-border')!.click();
    q(fixture, 'io-part-1-2-numberFormat')!.click();
    expect(emitted.at(-1)!.parts).toBeNull();
  });

  it('elhagyható tartománynál a címke jelzi', () => {
    const { fixture } = create(op({ op: 'removeConditionalFormatting', range: null }));
    expect(fixture.nativeElement.querySelector('label[for="io-range-1-2"]')!.textContent).toContain('elhagyható = az egész lap');
  });
});
