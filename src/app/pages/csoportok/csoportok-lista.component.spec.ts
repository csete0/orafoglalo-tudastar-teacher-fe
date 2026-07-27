import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { CsoportokListaComponent } from './csoportok-lista.component';
import { GroupStore } from '../../services/group/group.store';
import { SchoolStore } from '../../services/school/school.store';

describe('CsoportokListaComponent', () => {
  let storeMock: {
    groups: ReturnType<typeof signal<unknown[]>>;
    loading: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    loadMine: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let schoolStoreMock: {
    schools: ReturnType<typeof signal<unknown[]>>;
    error: ReturnType<typeof signal<string | null>>;
    loadMine: ReturnType<typeof vi.fn>;
  };

  function configure() {
    storeMock = {
      groups: signal([]),
      loading: signal(false),
      error: signal(null),
      loadMine: vi.fn(),
      create: vi.fn(),
    };
    schoolStoreMock = { schools: signal([]), error: signal(null), loadMine: vi.fn() };

    TestBed.configureTestingModule({
      imports: [CsoportokListaComponent],
      providers: [
        provideRouter([]),
        { provide: GroupStore, useValue: storeMock },
        { provide: SchoolStore, useValue: schoolStoreMock },
      ],
    });
  }

  // UI-TT-60: whitespace-only csoportnév a beépített Validators.required mellett érvényesnek
  // számítana — a notBlankValidator ezt hivatott elkapni, kliens-oldalon.
  it('BUG UI-TT-60 javítva: whitespace-only név esetén a "Létrehozás" gomb letiltva marad, inline hibaüzenettel', () => {
    configure();
    const fixture = TestBed.createComponent(CsoportokListaComponent);
    fixture.detectChanges();

    // Előbb egy VALÓS értéket állítunk be, hogy a control érvényessége ténylegesen
    // "false"-ról induljon, mielőtt a whitespace-only értékre váltunk — enélkül a
    // kezdeti (üres stringes, required-hibás) állapot és a "blank"-hibás állapot
    // közti átmenet nem biztos, hogy egyetlen detectChanges()-ciklus alatt látszik.
    fixture.componentInstance.createForm.controls.name.setValue('Valid Name First');
    fixture.detectChanges();

    fixture.componentInstance.createForm.controls.name.setValue('   ');
    fixture.detectChanges();

    expect(fixture.componentInstance.createForm.invalid).toBe(true);
    const submitButton: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(submitButton.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('A csoport neve nem állhat kizárólag szóközökből.');
  });

  it('valódi név esetén a form érvényes, a gomb aktív', () => {
    configure();
    const fixture = TestBed.createComponent(CsoportokListaComponent);
    fixture.detectChanges();

    fixture.componentInstance.createForm.controls.name.setValue('11.A');
    fixture.detectChanges();

    expect(fixture.componentInstance.createForm.valid).toBe(true);
    const submitButton: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(submitButton.disabled).toBe(false);
  });

  // UI-TT-146: a backend a Name mezőt [MaxLength(255)]-tel korlátozza; a kliens-oldali
  // formnak korábban semmilyen hosszkorlátja nem volt, így egy 256+ karakteres név
  // csak a beküldés után, egy semmitmondó "A művelet sikertelen." üzenettel bukott.
  it('BUG UI-TT-146 javítva: 255 karakternél hosszabb név esetén a "Létrehozás" gomb letiltva marad, inline hibaüzenettel', () => {
    configure();
    const fixture = TestBed.createComponent(CsoportokListaComponent);
    fixture.detectChanges();

    // Két lépésben állítjuk be az értéket (előbb egy VALÓS, majd a túl hosszú érték),
    // ugyanazon okból, mint a fenti "blank" tesztnél - egyetlen hibás állapotból egy
    // másik hibás állapotba váltás nem biztos, hogy egy detectChanges()-ciklus alatt látszik.
    fixture.componentInstance.createForm.controls.name.setValue('Valid Name First');
    fixture.detectChanges();

    fixture.componentInstance.createForm.controls.name.setValue('a'.repeat(256));
    fixture.detectChanges();

    expect(fixture.componentInstance.createForm.invalid).toBe(true);
    const submitButton: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(submitButton.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('A csoport neve legfeljebb 255 karakter hosszú lehet.');
  });

  it('pontosan 255 karakteres név esetén a form érvényes', () => {
    configure();
    const fixture = TestBed.createComponent(CsoportokListaComponent);
    fixture.detectChanges();

    fixture.componentInstance.createForm.controls.name.setValue('a'.repeat(255));
    fixture.detectChanges();

    expect(fixture.componentInstance.createForm.valid).toBe(true);
  });

  it('create() whitespace-only névvel NEM hívja meg a store.create()-et', () => {
    configure();
    const fixture = TestBed.createComponent(CsoportokListaComponent);
    fixture.detectChanges();

    fixture.componentInstance.createForm.controls.name.setValue('   ');
    fixture.componentInstance.create();

    expect(storeMock.create).not.toHaveBeenCalled();
  });

  // UI-TT-6: a "Létrehozás" gomb korábban nem volt letiltva egy már folyamatban
  // lévő kérés alatt — dupla kattintás duplikált csoportot hozhatott létre.
  it('BUG UI-TT-6 javítva: store.loading() alatt a "Létrehozás" gomb letiltott és create() no-op', () => {
    configure();
    storeMock.loading.set(true);
    const fixture = TestBed.createComponent(CsoportokListaComponent);
    fixture.detectChanges();

    fixture.componentInstance.createForm.controls.name.setValue('11.A');
    fixture.detectChanges();

    const submitButton: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(submitButton.disabled).toBe(true);

    fixture.componentInstance.create();
    expect(storeMock.create).not.toHaveBeenCalled();
  });

  // UI-TT-112: harmadik előfordulás ugyanabból a családból, mint UI-TT-110/UI-TT-111 -
  // a schoolStore itt az "Új csoport" űrlap intézmény-<select>-jét vezérli
  // (`@if (schoolStore.schools().length > 0)`), de a komponens (sem TS, sem sablon)
  // sosem olvassa a `schoolStore.error()`-t. Egy sikertelen schoolStore.loadMine()
  // után a schools() örökre üres marad - a <select> csendben eltűnik, semmi nem
  // jelzi a tanárnak, hogy a betöltés hibázott, nem pedig azt, hogy nincs
  // intézményi tagsága.
  it('BUG UI-TT-112: ha a schoolStore.loadMine() hibázik, az "Új csoport" űrlap intézmény-<select>-je csendben eltűnik, semmilyen hibaüzenet nem jelzi a sikertelen betöltést', () => {
    configure();
    schoolStoreMock.error.set('Az intézmények betöltése sikertelen.');
    const fixture = TestBed.createComponent(CsoportokListaComponent);
    fixture.detectChanges();

    // Elvárás: a felhasználó lássa, hogy az intézmény-lista betöltése sikertelen volt.
    expect(fixture.nativeElement.textContent).toContain('Az intézmények betöltése sikertelen.');
  });
});
