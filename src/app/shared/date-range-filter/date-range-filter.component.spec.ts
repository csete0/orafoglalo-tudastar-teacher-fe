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

  // BE-STUDENTACTIVITY-CUSTOMRANGE-FROM-TIMEZONE-GAP / -TO-TIMEZONE-OVERINCLUSION:
  // a korábbi `new Date(this.customFrom())` az "ÉÉÉÉ-HH-NN" stringet MINDIG UTC
  // éjfélként értelmezte (ECMA-262), függetlenül a böngésző időzónájától - egy
  // pozitív UTC-eltolású (pl. magyarországi) felhasználónál ez a helyi nap
  // kezdetét 1-2 órával KÉSŐBBRE tolta a `from`-nál (csendben kizárva a
  // kiválasztott nap kora reggeli aktivitását), a `to`-nál pedig a backend
  // korábbi `.Date.AddDays(1)`-je miatt a KÖVETKEZŐ nap kora reggelét is tévesen
  // befoglalta. A fix a `semesterStart()`/`last30` gyorsszűrőknél már bevált,
  // LOKÁLIS komponensenkénti `new Date(year, month, day)` konstrukciót használja.
  it('egyéni tartománynál a from/to a KIVÁLASZTOTT nap HELYI éjfeleként épül fel, nem UTC-ként (BE-STUDENTACTIVITY-CUSTOMRANGE-*-TIMEZONE-*)', () => {
    const component = createComponent();

    component.selectKey('custom');
    component.customFrom.set('2026-08-01');
    component.customTo.set('2026-08-01');
    component.applyCustom();

    expect(emitted.length).toBe(1);
    const { from, to } = emitted[0];

    // `from`: a kiválasztott nap HELYI éjfele - a helyi (teszt-környezeti)
    // időzóna komponenseiből épül, nem a "2026-08-01T00:00:00.000Z" UTC alakból.
    expect(from!.getFullYear()).toBe(2026);
    expect(from!.getMonth()).toBe(7); // 0-indexelt: augusztus
    expect(from!.getDate()).toBe(1);
    expect(from!.getHours()).toBe(0);
    expect(from!.getMinutes()).toBe(0);

    // `to`: a ZÁRÓ nap UTÁNI nap HELYI éjfele (kizáró felső határ) - egy nappal
    // később, mint `from`, ugyanabban a helyi órában/percben.
    expect(to!.getFullYear()).toBe(2026);
    expect(to!.getMonth()).toBe(7);
    expect(to!.getDate()).toBe(2);
    expect(to!.getHours()).toBe(0);
    expect(to!.getMinutes()).toBe(0);
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
