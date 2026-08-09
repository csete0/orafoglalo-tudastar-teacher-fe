import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DateRangeFilterComponent } from './date-range-filter.component';
import { ToastService } from '../toast/toast.service';
import { ReportDateRange, ReportRangeKey } from '../date-range/report-date-range';

// 7. fázis: a szűrő nem tölt be semmit, csak feloldott tartományt ad ki. A
// kliens-oldali validáció csak kényelmi réteg — a szerver a mérvadó —, de UI-TT-134
// miatt SOHA nem lehet néma no-op: ha nem szűrünk, meg kell mondani, miért.
describe('DateRangeFilterComponent', () => {
  let toastService: ToastService;
  // UI-TT-178: az emit payload a range mellett a KULCSOT is tartalmazza, hogy egy
  // fülváltás miatt újra-mountoló szülő vissza tudja tölteni a legördülő állapotát.
  let emitted: { key: ReportRangeKey; range: ReportDateRange }[];

  function createComponent(): DateRangeFilterComponent {
    const fixture = TestBed.createComponent(DateRangeFilterComponent);
    const component = fixture.componentInstance;
    emitted = [];
    component.rangeChange.subscribe((event) => emitted.push(event));
    fixture.detectChanges();
    return component;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [DateRangeFilterComponent, HostComponent] });
    toastService = TestBed.inject(ToastService);
  });

  it('gyorsválasztó kiválasztásakor azonnal kiadja a feloldott tartományt', () => {
    const component = createComponent();

    component.selectKey('last30');

    expect(emitted.length).toBe(1);
    expect(emitted[0].key).toBe('last30');
    expect(emitted[0].range.from).toBeInstanceOf(Date);
    expect(emitted[0].range.to).toBeUndefined();
  });

  it('a "Teljes időszak" üres tartományt ad — ez a mai, szűrő nélküli viselkedés', () => {
    const component = createComponent();

    component.selectKey('all');

    expect(emitted[0].key).toBe('all');
    expect(emitted[0].range).toEqual({});
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
    expect(emitted[0].key).toBe('custom');
    expect(emitted[0].range.from).toBeInstanceOf(Date);
    expect(emitted[0].range.to).toBeInstanceOf(Date);
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
    expect(emitted[0].key).toBe('custom');
    const { from, to } = emitted[0].range;

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

  // UI-TT-178: az initialRangeKey/initialCustomFrom/initialCustomTo inputok teszik
  // lehetővé, hogy egy fülváltás miatt destroy+recreate-elt szülő vissza tudja tölteni
  // a legördülőt a saját perzisztált állapotára, ahelyett hogy az mindig
  // DEFAULT_RANGE_KEY-re ("Teljes időszak") esne vissza.
  //
  // Egy gazda-komponens SAJÁT template-jén keresztül kötjük be az inputokat (nem
  // `componentRef.setInput()`-tal a bare fixture-ön), mert a signal input mezőket
  // seedelő field-initializer (`readonly rangeKey = signal(this.initialRangeKey())`)
  // csak akkor kapja meg a bekötött értéket, ha az a KOMPONENS LÉTREHOZÁSAKOR már
  // kötve van - pontosan úgy, ahogy egy valós szülő (`csoport-reszletek`/
  // `intezmeny-reszletek`) template-je is teszi minden fülváltáskor.
  @Component({
    standalone: true,
    imports: [DateRangeFilterComponent],
    template: `<app-date-range-filter [initialRangeKey]="key" [initialCustomFrom]="from" [initialCustomTo]="to" />`,
  })
  class HostComponent {
    key: ReportRangeKey = 'all';
    from = '';
    to = '';
  }

  it('BUG UI-TT-178 javítva: initialRangeKey inputtal a legördülő a megadott kulccsal jön létre, nem DEFAULT_RANGE_KEY-vel', async () => {
    const hostFixture = TestBed.createComponent(HostComponent);
    hostFixture.componentInstance.key = 'last30';
    hostFixture.detectChanges();
    // A [ngModel] a DOM-frissítést egy mikrotaszkra halasztja (ControlValueAccessor
    // writeValue), hogy elkerülje az ExpressionChangedAfterItHasBeenCheckedError-t -
    // a signal (rangeKey()) már itt is a helyes értéket adja vissza, csak a
    // renderelt <select>.value-hoz kell egy stabilizálási kör.
    await hostFixture.whenStable();
    hostFixture.detectChanges();

    const child = hostFixture.debugElement.children[0].componentInstance as DateRangeFilterComponent;
    expect(child.rangeKey()).toBe('last30');
    const select = hostFixture.nativeElement.querySelector('select#range-key') as HTMLSelectElement;
    expect(select.value).toBe('last30');
  });

  it('BUG UI-TT-178 javítva: initialRangeKey="custom" + initialCustomFrom/To inputtal az egyéni dátum-mezők is visszatöltődnek', async () => {
    const hostFixture = TestBed.createComponent(HostComponent);
    hostFixture.componentInstance.key = 'custom';
    hostFixture.componentInstance.from = '2026-08-01';
    hostFixture.componentInstance.to = '2026-08-09';
    hostFixture.detectChanges();
    await hostFixture.whenStable();
    hostFixture.detectChanges();

    const child = hostFixture.debugElement.children[0].componentInstance as DateRangeFilterComponent;
    expect(child.rangeKey()).toBe('custom');
    expect(child.customFrom()).toBe('2026-08-01');
    expect(child.customTo()).toBe('2026-08-09');
    const fromInput = hostFixture.nativeElement.querySelector('#range-from') as HTMLInputElement;
    const toInput = hostFixture.nativeElement.querySelector('#range-to') as HTMLInputElement;
    expect(fromInput.value).toBe('2026-08-01');
    expect(toInput.value).toBe('2026-08-09');
  });

  it('input nélkül a viselkedés változatlan: DEFAULT_RANGE_KEY-vel ("Teljes időszak") jön létre', () => {
    const fixture = TestBed.createComponent(DateRangeFilterComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.rangeKey()).toBe('all');
    const select = fixture.nativeElement.querySelector('select#range-key') as HTMLSelectElement;
    expect(select.value).toBe('all');
  });
});
