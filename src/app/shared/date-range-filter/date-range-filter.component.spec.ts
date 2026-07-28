import { TestBed } from '@angular/core/testing';
import { DateRangeFilterComponent } from './date-range-filter.component';
import { ToastService } from '../toast/toast.service';
import { ReportDateRange } from '../date-range/report-date-range';

// 7. fázis: a szűrő nem tölt be semmit, csak feloldott tartományt ad ki. A
// kliens-oldali validáció csak kényelmi réteg — a szerver a mérvadó —, de UI-TT-134
// miatt SOHA nem lehet néma no-op: ha nem szűrünk, meg kell mondani, miért.
describe('DateRangeFilterComponent', () => {
  let toastService: ToastService;
  let emitted: ReportDateRange[];

  function createComponent(): DateRangeFilterComponent {
    const fixture = TestBed.createComponent(DateRangeFilterComponent);
    const component = fixture.componentInstance;
    emitted = [];
    component.rangeChange.subscribe((range) => emitted.push(range));
    fixture.detectChanges();
    return component;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [DateRangeFilterComponent] });
    toastService = TestBed.inject(ToastService);
  });

  it('gyorsválasztó kiválasztásakor azonnal kiadja a feloldott tartományt', () => {
    const component = createComponent();

    component.selectKey('last30');

    expect(emitted.length).toBe(1);
    expect(emitted[0].from).toBeInstanceOf(Date);
    expect(emitted[0].to).toBeUndefined();
  });

  it('a "Teljes időszak" üres tartományt ad — ez a mai, szűrő nélküli viselkedés', () => {
    const component = createComponent();

    component.selectKey('all');

    expect(emitted[0]).toEqual({});
  });

  it('az "Egyéni időszak" kiválasztása önmagában MÉG nem szűr', () => {
    const component = createComponent();

    component.selectKey('custom');

    expect(emitted.length).toBe(0);
  });

  it('fordított egyéni tartománynál figyelmeztet és NEM szűr (UI-TT-134)', () => {
    const warnSpy = vi.spyOn(toastService, 'warning');
    const component = createComponent();

    component.selectKey('custom');
    component.customFrom.set('2026-06-01');
    component.customTo.set('2026-05-01');
    component.applyCustom();

    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toContain('kezdő dátum');
    expect(emitted.length).toBe(0);
  });

  it('érvényes egyéni tartománynál szűr, figyelmeztetés nélkül', () => {
    const warnSpy = vi.spyOn(toastService, 'warning');
    const component = createComponent();

    component.selectKey('custom');
    component.customFrom.set('2026-05-01');
    component.customTo.set('2026-06-01');
    component.applyCustom();

    expect(warnSpy).not.toHaveBeenCalled();
    expect(emitted.length).toBe(1);
    expect(emitted[0].from).toBeInstanceOf(Date);
    expect(emitted[0].to).toBeInstanceOf(Date);
  });

  // Regresszió: az `options` KÖZVETLEN mezőként (`readonly options =
  // REPORT_RANGE_OPTIONS;`) némán `undefined` volt ebben a build-beállításban, így a
  // `@for (option of options; ...)` semmin iterált és a gyorsszűrő gombok EGYÁLTALÁN
  // NEM jelentek meg — miközben a 7. fázis mind a 21 tesztje zöld maradt, mert
  // egyik sem a renderelt gombokra asszertált. Ezek a tesztek a DOM-ot nézik.
  it('mind a négy gyorsszűrő lehetőség megjelenik a legördülőben', () => {
    const fixture = TestBed.createComponent(DateRangeFilterComponent);
    fixture.detectChanges();

    const labels = [...fixture.nativeElement.querySelectorAll('select#range-key option')].map((o) =>
      (o as HTMLElement).textContent?.trim(),
    );

    expect(labels).toEqual(['Teljes időszak', 'Utolsó 30 nap', 'Ebben a félévben', 'Egyéni időszak']);
  });

  it('az options nem undefined (a mező-hozzárendelés csapdája)', () => {
    const fixture = TestBed.createComponent(DateRangeFilterComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.options).toBeDefined();
    expect(fixture.componentInstance.options.length).toBe(4);
  });
});
