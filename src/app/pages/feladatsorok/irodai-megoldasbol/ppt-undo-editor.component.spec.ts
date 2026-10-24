import { TestBed } from '@angular/core/testing';
import { OfficeSlideShape, OfficeUndoOp } from '../../../models/office-task.model';
import { PptUndoEditorComponent } from './ppt-undo-editor.component';

const NULLS = { sheet: null, range: null, name: null, index: null, columns: null, parts: null };
const op = (o: Partial<OfficeUndoOp> = {}): OfficeUndoOp => ({ op: 'resetFont', ...NULLS, slide: 1, shape: { id: 2, name: 'Cím 1' }, parts: ['size'], enabled: true, result: null, message: null, ...o });
const SHAPES: OfficeSlideShape[] = [
  { slide: 1, id: 2, name: 'Cím 1', kind: 'title', text: 'Tavaszi koncert' },
  { slide: 2, id: 3, name: 'Szövegdoboz 2', kind: 'textbox' },
  { slide: 2, id: 4, name: 'Kép 3', kind: 'picture' },
];

describe('PptUndoEditorComponent', () => {
  function create(initial: OfficeUndoOp, shapes: OfficeSlideShape[] = SHAPES, slideCount = 3) {
    const fixture = TestBed.createComponent(PptUndoEditorComponent);
    fixture.componentRef.setInput('op', initial);
    fixture.componentRef.setInput('key', '0-1');
    fixture.componentRef.setInput('shapes', shapes);
    fixture.componentRef.setInput('slideCount', slideCount);
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
  const texts = (el: HTMLElement | null) => Array.from((el as HTMLSelectElement).options).map((o) => o.textContent!.trim());

  function type(fixture: ReturnType<typeof create>['fixture'], id: string, value: string) {
    const el = q(fixture, id) as HTMLInputElement;
    el.value = value;
    el.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('dia és alakzat a listából (diánként); diaváltás törli az alakzatot, ugyanaz a dia nem', () => {
    const { fixture, emitted } = create(op());
    const c = fixture.componentInstance;
    expect(texts(q(fixture, 'io-slide-0-1'))).toEqual(['válassz…', '1. dia', '2. dia', '3. dia']);
    expect(texts(q(fixture, 'io-shape-0-1'))).toEqual(['válassz…', '#2 „Cím 1” (title) - Tavaszi koncert']);
    c.setSlide(1);
    expect(emitted.at(-1)).toMatchObject({ slide: 1, shape: { id: 2, name: 'Cím 1' } });
    c.setSlide(2);
    fixture.detectChanges();
    expect(emitted.at(-1)).toMatchObject({ slide: 2, shape: null });
    expect(texts(q(fixture, 'io-shape-0-1'))).toEqual(['válassz…', '#3 „Szövegdoboz 2” (textbox)', '#4 „Kép 3” (picture)']);
    c.setShape(4);
    expect(emitted.at(-1)!.shape).toEqual({ id: 4, name: 'Kép 3' });
    c.setShape(99);
    expect(emitted.at(-1)!.shape).toBeNull();
  });

  it('animációnál az alakzat elhagyható, áttűnésnél „minden dia” és nincs alakzat', () => {
    const { fixture, emitted } = create(op());
    fixture.componentInstance.changeKind('removeAnimation');
    fixture.detectChanges();
    expect(emitted.at(-1)).toMatchObject({ op: 'removeAnimation', parts: null });
    expect(texts(q(fixture, 'io-shape-0-1'))[0]).toBe('a dia összes animációja');
    expect(q(fixture, 'io-part-0-1-color')).toBeNull();
    fixture.componentInstance.changeKind('removeTransition');
    fixture.detectChanges();
    expect(texts(q(fixture, 'io-slide-0-1'))[0]).toBe('minden dia');
    expect(q(fixture, 'io-shape-0-1')).toBeNull();
  });

  it('lista nélkül kézi azonosító és név; a művelet saját diája választható; üres azonosító = null', () => {
    const { fixture, emitted } = create(op({ slide: 2 }), [], 0);
    expect(texts(q(fixture, 'io-slide-0-1'))).toEqual(['válassz…', '1. dia', '2. dia']);
    expect(q(fixture, 'io-shape-0-1')).toBeNull();
    type(fixture, 'io-shape-id-0-1', '7');
    type(fixture, 'io-shape-name-0-1', 'Téglalap 6');
    expect(emitted.at(-1)!.shape).toEqual({ id: 7, name: 'Téglalap 6' });
    type(fixture, 'io-shape-id-0-1', '');
    expect(emitted.at(-1)!.shape).toEqual({ id: null, name: 'Téglalap 6' });
  });

  it('betű-részek a felület sorrendjében; semmi = null', () => {
    const { fixture, emitted } = create(op());
    q(fixture, 'io-part-0-1-color')!.click();
    expect(emitted.at(-1)!.parts).toEqual(['size', 'color']);
    q(fixture, 'io-part-0-1-size')!.click();
    q(fixture, 'io-part-0-1-color')!.click();
    expect(emitted.at(-1)!.parts).toBeNull();
  });
});
