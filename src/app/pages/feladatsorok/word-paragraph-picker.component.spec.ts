import { TestBed } from '@angular/core/testing';
import { OfficeParagraphAnchor, OfficeWordParagraph } from '../../models/office-task.model';
import { PICKER_LIMIT, WordParagraphPickerComponent } from './word-paragraph-picker.component';

const LONG = 'Az indulás 2026. május 21-én reggel 7 órakor lesz az iskola elől, a buszmegállótól,';
const PARAGRAPHS: OfficeWordParagraph[] = [
  { index: 0, text: 'Osztálykirándulás', truncated: false, style: 'heading 1', inTable: false },
  { index: 1, text: '', truncated: false, style: 'Normal', inTable: false },
  { index: 2, text: LONG, truncated: true, style: 'Normal', inTable: false },
  { index: 3, text: 'Kérjük, hogy hozzatok kulacsot.', truncated: false, inTable: false },
  { index: 4, text: 'Nap', truncated: true, inTable: true },
];

describe('WordParagraphPickerComponent', () => {
  function create(inputs: Record<string, unknown> = {}) {
    TestBed.configureTestingModule({ imports: [WordParagraphPickerComponent] });
    const fixture = TestBed.createComponent(WordParagraphPickerComponent);
    fixture.componentRef.setInput('label', 'Első bekezdés');
    fixture.componentRef.setInput('testId', 'pk');
    fixture.componentRef.setInput('paragraphs', PARAGRAPHS);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    const emitted: (OfficeParagraphAnchor | null)[] = [];
    fixture.componentInstance.anchorChange.subscribe((a) => emitted.push(a));
    fixture.detectChanges();
    return { fixture, emitted };
  }

  const q = (f: { nativeElement: HTMLElement }, id: string) => f.nativeElement.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  it('a bekezdéseket 1-től számozva, az első 60 karakterrel listázza; választáskor a szerver szövegét adja „…” nélkül, 0-alapú sorszámmal', () => {
    const { fixture, emitted } = create();
    expect(q(fixture, 'pk-value')!.textContent).toContain('nincs kiválasztva');
    expect(q(fixture, 'pk-option-0')!.textContent).toContain('[1] Osztálykirándulás');
    expect(q(fixture, 'pk-option-0')!.textContent).toContain('(heading 1)');
    expect(q(fixture, 'pk-option-1')!.textContent).toContain('(üres bekezdés)');
    expect(q(fixture, 'pk-option-2')!.textContent!.trim()).toBe('[3] Az indulás 2026. május 21-én reggel 7 órakor lesz az iskola…');
    expect(q(fixture, 'pk-option-4')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('[5] Nap… (táblázatban)');
    q(fixture, 'pk-option-2')!.click();
    q(fixture, 'pk-option-4')!.click();
    expect(emitted).toEqual([
      { index: 2, startsWith: LONG },
      { index: 4, startsWith: 'Nap' },
    ]);
  });

  it('a kiválasztott bekezdést jelöli; a kereső szövegre és sorszámra szűr', () => {
    const { fixture } = create({ anchor: { index: 3, startsWith: 'Kérjük' } });
    expect(q(fixture, 'pk-value')!.textContent).toContain('[4] „Kérjük”');
    expect(q(fixture, 'pk-option-3')!.closest('li')!.getAttribute('aria-selected')).toBe('true');
    fixture.componentInstance.search.set('KULACS');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('[role="option"]').length).toBe(1);
    expect(q(fixture, 'pk-option-3')).not.toBeNull();
    fixture.componentInstance.search.set('5');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('[role="option"]').length).toBe(1);
    expect(q(fixture, 'pk-option-4')).not.toBeNull();
    fixture.componentInstance.search.set('nincs ilyen');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Nincs találat.');
  });

  it('a „to”-nál a „from” előtti bekezdés nem választható; az elhagyható horgony törölhető', () => {
    const { fixture, emitted } = create({ anchor: { index: 3, startsWith: 'Kérjük' }, minIndex: 2, optional: true, clearLabel: 'Csak az első' });
    expect((q(fixture, 'pk-option-1') as HTMLButtonElement).disabled).toBe(true);
    expect((q(fixture, 'pk-option-2') as HTMLButtonElement).disabled).toBe(false);
    expect(q(fixture, 'pk-clear')!.textContent).toContain('Csak az első');
    q(fixture, 'pk-clear')!.click();
    expect(emitted).toEqual([null]);
  });

  it('nagy dokumentumnál legfeljebb 100 találat, a többihez a kereső', () => {
    const many = Array.from({ length: PICKER_LIMIT + 20 }, (_, i) => ({ index: i, text: `Bekezdés ${i}`, truncated: false, inTable: false }));
    const { fixture } = create({ paragraphs: many });
    expect(fixture.nativeElement.querySelectorAll('[role="option"]').length).toBe(PICKER_LIMIT);
    expect(q(fixture, 'pk-more')!.textContent).toContain('Még 20 bekezdés');
  });

  it('lista nélkül kézzel adható meg a sorszám (1-től) és a szöveg eleje', () => {
    const { fixture, emitted } = create({ paragraphs: null, unavailable: 'túl sok bekezdés', anchor: { index: 2, startsWith: 'Az' } });
    expect(q(fixture, 'pk-list')).toBeNull();
    expect(q(fixture, 'pk-unavailable')!.textContent).toContain('túl sok bekezdés');
    expect(fixture.componentInstance.number()).toBe(3);
    fixture.componentInstance.setIndex('5');
    fixture.componentInstance.setText('Kérjük');
    fixture.componentInstance.setIndex('');
    expect(emitted).toEqual([
      { index: 4, startsWith: 'Az' },
      { index: 2, startsWith: 'Kérjük' },
      { index: null, startsWith: 'Az' },
    ]);
  });
});
