import { TestBed } from '@angular/core/testing';
import { OfficeParagraphAnchor } from '../../models/office-task.model';
import { PICKER_LIMIT, WordParagraphPickerComponent } from './word-paragraph-picker.component';

const PARAGRAPHS = ['Osztálykirándulás', '', 'Az indulás  2026. május 21-én reggel 7 órakor lesz az iskola elől, kérjük, időben érkezzetek!', 'Kérjük, hogy hozzatok kulacsot.'];

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

  it('a bekezdéseket sorszámmal és az első 60 karakterrel listázza; választáskor horgonyt ad', () => {
    const { fixture, emitted } = create();
    expect(q(fixture, 'pk-value')!.textContent).toContain('nincs kiválasztva');
    expect(q(fixture, 'pk-option-0')!.textContent).toContain('[0] Osztálykirándulás');
    expect(q(fixture, 'pk-option-1')!.textContent).toContain('(üres bekezdés)');
    expect(q(fixture, 'pk-option-2')!.textContent!.trim()).toBe('[2] Az indulás 2026. május 21-én reggel 7 órakor lesz az iskola…');
    q(fixture, 'pk-option-2')!.click();
    expect(emitted).toEqual([{ index: 2, startsWith: 'Az indulás 2026. május 21-én reggel 7 ór' }]);
  });

  it('a kiválasztott bekezdést jelöli; a kereső szövegre és sorszámra szűr', () => {
    const { fixture } = create({ anchor: { index: 3, startsWith: 'Kérjük' } });
    expect(q(fixture, 'pk-value')!.textContent).toContain('[3] „Kérjük”');
    expect(q(fixture, 'pk-option-3')!.closest('li')!.getAttribute('aria-selected')).toBe('true');
    fixture.componentInstance.search.set('KULACS');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('[role="option"]').length).toBe(1);
    expect(q(fixture, 'pk-option-3')).not.toBeNull();
    fixture.componentInstance.search.set('0');
    fixture.detectChanges();
    expect(q(fixture, 'pk-option-0')).not.toBeNull();
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
    const { fixture } = create({ paragraphs: Array.from({ length: PICKER_LIMIT + 20 }, (_, i) => `Bekezdés ${i}`) });
    expect(fixture.nativeElement.querySelectorAll('[role="option"]').length).toBe(PICKER_LIMIT);
    expect(q(fixture, 'pk-more')!.textContent).toContain('Még 20 bekezdés');
  });

  it('lista nélkül (betöltés / hiba) kézzel adható meg a sorszám és a szöveg eleje', () => {
    const { fixture, emitted } = create({ paragraphs: null, error: 'nem sikerült', anchor: { index: 2, startsWith: 'Az' } });
    expect(q(fixture, 'pk-list')).toBeNull();
    expect(q(fixture, 'pk-error')!.textContent).toContain('nem sikerült');
    fixture.componentInstance.setIndex('4');
    fixture.componentInstance.setText('Kérjük');
    fixture.componentInstance.setIndex('');
    expect(emitted).toEqual([
      { index: 4, startsWith: 'Az' },
      { index: 2, startsWith: 'Kérjük' },
      { index: null, startsWith: 'Az' },
    ]);
  });
});
