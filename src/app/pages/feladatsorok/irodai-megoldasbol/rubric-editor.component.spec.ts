import { TestBed } from '@angular/core/testing';
import { OfficeProposalSubtask, OfficeRubricItem } from '../../../models/office-task.model';
import { MAX_RUBRIC_ITEMS, RubricEditorComponent, RubricItemPatch } from './rubric-editor.component';

const item = (o: Partial<OfficeRubricItem> = {}): OfficeRubricItem => ({ key: 'r1', text: 'B5: átlag.', points: 2, machine: false, gate: null, gateReason: null, ...o });
const subtask = (rubric: OfficeRubricItem[]): OfficeProposalSubtask =>
  ({ label: '2.', text: 'Számold ki!', points: 4, undo: [], rubric }) as OfficeProposalSubtask;

describe('RubricEditorComponent', () => {
  function create(rubric: OfficeRubricItem[], dirty = false) {
    const fixture = TestBed.createComponent(RubricEditorComponent);
    fixture.componentRef.setInput('subtask', subtask(rubric));
    fixture.componentRef.setInput('index', 1);
    fixture.componentRef.setInput('dirty', dirty);
    const changes: RubricItemPatch[] = [];
    const removed: number[] = [];
    let added = 0;
    fixture.componentInstance.itemChange.subscribe((e) => changes.push(e));
    fixture.componentInstance.itemRemove.subscribe((i) => removed.push(i));
    fixture.componentInstance.itemAdd.subscribe(() => added++);
    fixture.detectChanges();
    return { fixture, changes, removed, added: () => added };
  }

  const q = (fixture: { nativeElement: HTMLElement }, id: string) => fixture.nativeElement.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  it('gépi jelvény és kapu-állapot tételenként; a pontösszeg eltérése figyelmeztet', () => {
    const { fixture } = create([
      item({ machine: true, gate: 'ok' }),
      item({ key: 'r2', gate: 'source', gateReason: 'A kiinduló fájlon is teljesül.' }),
      item({ key: 'r3', gate: 'failed', points: 1 }),
    ]);
    expect(q(fixture, 'io-item-machine-1-0')!.textContent).toContain('gépi');
    expect(q(fixture, 'io-item-gate-1-0')!.className).toContain('badge-success');
    expect(q(fixture, 'io-item-machine-1-1')).toBeNull();
    expect(q(fixture, 'io-item-gate-1-1')!.textContent).toContain('a kiinduló fájlon is teljesül → AI-szempont');
    expect(q(fixture, 'io-item-1-1')!.textContent).toContain('A kiinduló fájlon is teljesül.');
    expect(q(fixture, 'io-item-gate-1-2')!.className).toContain('badge-danger');
    const sum = q(fixture, 'io-rubric-subtask-1')!.querySelector('span.text-xs')!;
    expect(sum.textContent).toContain('Szempontok: 5 / 4 pont');
    expect(sum.className).toContain('text-warning');
  });

  it('módosítás után a kapu-állapot elavult: nem látszik, az új tétel „új - AI-szempont”', () => {
    const { fixture } = create([item({ machine: true, gate: 'ok', gateReason: 'x' }), item({ key: null })], true);
    expect(q(fixture, 'io-item-machine-1-0')).toBeNull();
    expect(q(fixture, 'io-item-gate-1-0')).toBeNull();
    expect(q(fixture, 'io-item-1-0')!.textContent).not.toContain('új - AI-szempont');
    expect(q(fixture, 'io-item-1-1')!.textContent).toContain('új - AI-szempont');
  });

  it('a szöveg, a pont (üres = NaN), a törlés és az új tétel a szülőnek megy', () => {
    const { fixture, changes, removed, added } = create([item(), item({ key: 'r2' })]);
    const text = q(fixture, 'io-item-text-1-1') as HTMLTextAreaElement;
    text.value = 'Tengelyfelirat.';
    text.dispatchEvent(new Event('input'));
    const points = q(fixture, 'io-item-points-1-0') as HTMLInputElement;
    points.value = '3';
    points.dispatchEvent(new Event('input'));
    points.value = '';
    points.dispatchEvent(new Event('input'));
    expect(changes).toEqual([
      { index: 1, patch: { text: 'Tengelyfelirat.' } },
      { index: 0, patch: { points: 3 } },
      { index: 0, patch: { points: Number.NaN } },
    ]);
    q(fixture, 'io-item-remove-1-1')!.click();
    q(fixture, 'io-item-add-1')!.click();
    expect(removed).toEqual([1]);
    expect(added()).toBe(1);
  });

  it(`${MAX_RUBRIC_ITEMS} tételnél nincs „Szempont hozzáadása”`, () => {
    const { fixture } = create(Array.from({ length: MAX_RUBRIC_ITEMS }, (_, i) => item({ key: `r${i}`, points: 1 })));
    expect(q(fixture, 'io-item-add-1')).toBeNull();
  });
});
