import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { FeladatsorokListaComponent } from './feladatsorok-lista.component';
import { TeacherTaskSetStore } from '../../services/teacher-taskset/teacher-taskset.store';
import { CategoryService } from '../../services/category/category.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { PublicCategoryDto } from '../../models/category.model';

describe('FeladatsorokListaComponent', () => {
  let storeMock: {
    taskSets: ReturnType<typeof signal<unknown[]>>;
    loading: ReturnType<typeof signal<boolean>>;
    mineLoading: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    loadMine: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };

  function configure() {
    storeMock = {
      taskSets: signal([]),
      loading: signal(false),
      mineLoading: signal(false),
      error: signal(null),
      loadMine: vi.fn(),
      create: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [FeladatsorokListaComponent],
      providers: [
        provideRouter([]),
        { provide: TeacherTaskSetStore, useValue: storeMock },
        { provide: CategoryService, useValue: { getAll: () => of([]) } },
      ],
    });
  }

  // UI-TT-60: whitespace-only cím a beépített Validators.required mellett érvényesnek
  // számítana — a notBlankValidator ezt hivatott elkapni, kliens-oldalon.
  it('BUG UI-TT-60 javítva: whitespace-only cím esetén a "Létrehozás" gomb letiltva marad, inline hibaüzenettel', () => {
    configure();
    const fixture = TestBed.createComponent(FeladatsorokListaComponent);
    fixture.detectChanges();

    const { title, description } = fixture.componentInstance.createForm.controls;
    title.setValue('   ');
    description.setValue('Valódi leírás');
    fixture.detectChanges();

    expect(fixture.componentInstance.createForm.invalid).toBe(true);
    const submitButton: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(submitButton.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('A cím nem állhat kizárólag szóközökből.');
  });

  it('valódi cím és leírás esetén a form érvényes, a gomb aktív', () => {
    configure();
    const fixture = TestBed.createComponent(FeladatsorokListaComponent);
    fixture.detectChanges();

    const { title, description } = fixture.componentInstance.createForm.controls;
    title.setValue('Valódi cím');
    description.setValue('Valódi leírás');
    fixture.detectChanges();

    expect(fixture.componentInstance.createForm.valid).toBe(true);
    const submitButton: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(submitButton.disabled).toBe(false);
  });

  it('üres cím esetén a required hiba jelentkezik, NEM a blank (nincs duplikált/félrevezető üzenet)', () => {
    configure();
    const fixture = TestBed.createComponent(FeladatsorokListaComponent);
    fixture.detectChanges();

    const { title } = fixture.componentInstance.createForm.controls;
    expect(title.hasError('required')).toBe(true);
    expect(title.hasError('blank')).toBe(false);
  });

  it('create() whitespace-only címmel NEM hívja meg a store.create()-et', () => {
    configure();
    const fixture = TestBed.createComponent(FeladatsorokListaComponent);
    fixture.detectChanges();

    fixture.componentInstance.createForm.controls.title.setValue('   ');
    fixture.componentInstance.createForm.controls.description.setValue('Valódi leírás');
    fixture.componentInstance.create();

    expect(storeMock.create).not.toHaveBeenCalled();
  });

  // UI-TT-6: a "Létrehozás" gomb korábban nem volt letiltva egy már folyamatban
  // lévő kérés alatt — dupla kattintás duplikált feladatsort hozhatott létre.
  it('BUG UI-TT-6 javítva: store.loading() alatt a "Létrehozás" gomb letiltott és create() no-op', () => {
    configure();
    storeMock.loading.set(true);
    const fixture = TestBed.createComponent(FeladatsorokListaComponent);
    fixture.detectChanges();

    const { title, description } = fixture.componentInstance.createForm.controls;
    title.setValue('Valódi cím');
    description.setValue('Valódi leírás');
    fixture.detectChanges();

    const submitButton: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(submitButton.disabled).toBe(true);

    fixture.componentInstance.create();
    expect(storeMock.create).not.toHaveBeenCalled();
  });

  // UI-TT-79: a valós BE TaskSets.title oszlop nvarchar(250), a form korábban
  // EGYÁLTALÁN nem alkalmazott hosszkorlátot - egy 251+ karakteres cím a BE-n
  // nyers SqlException-be futott volna mentéskor.
  it('BUG UI-TT-79 javítva: 250 karakternél hosszabb cím esetén a form érvénytelen, a gomb letiltva', () => {
    configure();
    const fixture = TestBed.createComponent(FeladatsorokListaComponent);
    fixture.detectChanges();

    const { title, description } = fixture.componentInstance.createForm.controls;
    title.setValue('a'.repeat(251));
    description.setValue('Valódi leírás');
    fixture.detectChanges();

    expect(title.hasError('maxlength')).toBe(true);
    expect(fixture.componentInstance.createForm.invalid).toBe(true);
    const submitButton: HTMLButtonElement = fixture.nativeElement.querySelector('button[type="submit"]');
    expect(submitButton.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('A cím legfeljebb 250 karakter hosszú lehet.');
  });

  it('pontosan 250 karakteres cím esetén a form érvényes', () => {
    configure();
    const fixture = TestBed.createComponent(FeladatsorokListaComponent);
    fixture.detectChanges();

    const { title, description } = fixture.componentInstance.createForm.controls;
    title.setValue('a'.repeat(250));
    description.setValue('Valódi leírás');
    fixture.detectChanges();

    expect(title.hasError('maxlength')).toBe(false);
    expect(fixture.componentInstance.createForm.valid).toBe(true);
  });

  // UI-TT-category-tosignal-unhandled-error — JAVÍTVA, ez már regresszió-védelem, nem
  // nyitott hiba: a `readonly categories = toSignal(this.categoryService.getAll(), ...)`
  // (feladatsorok-lista.component.ts:123-126) most `.pipe(catchError(() => of([])))`-ot
  // alkalmaz a CategoryService.getAll() Observable-jén. A hiba korábban (catchError
  // nélkül) a toSignal() dokumentált viselkedése miatt a KÖVETKEZŐ olvasáskor kidobódott
  // volna (node_modules/@angular/core/fesm2022/rxjs-interop.mjs: "case 2: throw
  // current.error") — mivel a `categories()` a sablon `@for` ciklusában feltétel nélkül
  // kerül kiolvasásra minden change detection körben, ez a teljes "Feladatsoraim" oldal
  // renderelését eldöntötte volna egyetlen kategória-hiba (hálózati hiba, 500) esetén is,
  // holott csak a "Tantárgyi kategória" legördülőt kellene érintenie. Ez a teszt azt
  // rögzíti, hogy a fix tartja magát: a hiba NEM dönti el a rendert, a meglévő
  // feladatsor-lista és az "Új feladatsor" űrlap is látszik.
  it('a CategoryService.getAll() hibája esetén a teljes oldal renderelése NEM dől el, ' +
    'csak a kategória-legördülő marad üres', () => {
    configure();
    TestBed.overrideProvider(CategoryService, {
      useValue: { getAll: () => throwError(() => new Error('network error')) },
    });
    storeMock.taskSets.set([{ id: 1, title: 'Meglévő feladatsor', taskCount: 3, isPublished: true }]);

    const fixture = TestBed.createComponent(FeladatsorokListaComponent);

    // Elvárt (helyes) viselkedés lenne: a kategória-hiba nem töri el a lapot, a meglévő feladatsor és az
    // űrlap továbbra is látszik. A jelenlegi kódban ez a detectChanges() hibát dob.
    expect(() => fixture.detectChanges()).not.toThrow();
    expect(fixture.nativeElement.textContent).toContain('Meglévő feladatsor');
  });
  // ---------------------------------------------------------------------------
  // BE-TASKSET-LEVEL-CATEGORY-MISMATCH: a `Szint` és a `Tantárgyi kategória` legördülők
  // egymástól teljesen függetlenek voltak, így egy nevében is kezdő szintet ígérő
  // kategóriába "Haladó" feladatsor kerülhetett. A javítás FIGYELMEZTET, nem tilt:
  // ezért a "megerősítés után létrejön" eset ugyanolyan fontos teszt, mint az elvetés.
  // ---------------------------------------------------------------------------
  function categoriesOf(...categories: Partial<PublicCategoryDto>[]) {
    return categories.map((c, i) => ({
      id: c.id ?? i + 1,
      name: c.name ?? `Kategória ${i + 1}`,
      slug: c.slug ?? `kategoria-${i + 1}`,
      description: c.description ?? '',
      suggestedLevelId: c.suggestedLevelId ?? null,
    }));
  }

  /** Feltölti az űrlapot érvényes adatokkal és beállítja a szintet/kategóriát. */
  function fillForm(fixture: { componentInstance: FeladatsorokListaComponent }, levelId: number,
                    subjectCategoryId: number | null) {
    const form = fixture.componentInstance.createForm;
    form.controls.title.setValue('Valódi cím');
    form.controls.description.setValue('Valódi leírás');
    form.controls.levelId.setValue(levelId);
    form.controls.subjectCategoryId.setValue(subjectCategoryId);
  }

  function setupWithCategories(categories: ReturnType<typeof categoriesOf>) {
    configure();
    TestBed.overrideProvider(CategoryService, { useValue: { getAll: () => of(categories) } });
    const confirmService = TestBed.inject(ConfirmService);
    const askSpy = vi.spyOn(confirmService, 'ask');
    const fixture = TestBed.createComponent(FeladatsorokListaComponent);
    fixture.detectChanges();
    return { fixture, askSpy };
  }

  it('BE-TASKSET-LEVEL-CATEGORY-MISMATCH: eltérő szintnél megerősítést kér, a kategória és mindkét ' +
    'szint nevével', async () => {
    const { fixture, askSpy } = setupWithCategories(
      categoriesOf({ id: 1010, name: 'Kezdő programozás', suggestedLevelId: 1 }),
    );
    askSpy.mockResolvedValue(true);

    fillForm(fixture, 3, 1010);
    await fixture.componentInstance.create();

    expect(askSpy).toHaveBeenCalledTimes(1);
    const message = askSpy.mock.calls[0][0].message;
    expect(message).toContain('Kezdő programozás');
    expect(message).toContain('Kezdő');
    expect(message).toContain('Haladó');
  });

  it('BE-TASKSET-LEVEL-CATEGORY-MISMATCH: a megerősítés elfogadása után a feladatsor LÉTREJÖN ' +
    '(figyelmeztetés, nem tiltás)', async () => {
    const { fixture, askSpy } = setupWithCategories(
      categoriesOf({ id: 1010, name: 'Kezdő programozás', suggestedLevelId: 1 }),
    );
    askSpy.mockResolvedValue(true);

    fillForm(fixture, 3, 1010);
    await fixture.componentInstance.create();

    expect(storeMock.create).toHaveBeenCalledTimes(1);
    expect(storeMock.create.mock.calls[0][0]).toMatchObject({ levelId: 3, subjectCategoryId: 1010 });
  });

  it('BE-TASKSET-LEVEL-CATEGORY-MISMATCH: a megerősítés elvetése esetén NEM hívódik a store.create()', async () => {
    const { fixture, askSpy } = setupWithCategories(
      categoriesOf({ id: 1010, name: 'Kezdő programozás', suggestedLevelId: 1 }),
    );
    askSpy.mockResolvedValue(false);

    fillForm(fixture, 3, 1010);
    await fixture.componentInstance.create();

    expect(askSpy).toHaveBeenCalledTimes(1);
    expect(storeMock.create).not.toHaveBeenCalled();
  });

  it('BE-TASKSET-LEVEL-CATEGORY-MISMATCH: suggestedLevelId=null esetén sosem kérdez ' +
    '(a kategória jogosan átfoghat több szintet)', async () => {
    const { fixture, askSpy } = setupWithCategories(
      categoriesOf({ id: 1012, name: 'Tanári feladatsorok', suggestedLevelId: null }),
    );

    fillForm(fixture, 3, 1012);
    await fixture.componentInstance.create();

    expect(askSpy).not.toHaveBeenCalled();
    expect(storeMock.create).toHaveBeenCalledTimes(1);
  });

  it('BE-TASKSET-LEVEL-CATEGORY-MISMATCH: egyező szintnél nem kérdez', async () => {
    const { fixture, askSpy } = setupWithCategories(
      categoriesOf({ id: 1011, name: 'Középhaladó programozás', suggestedLevelId: 2 }),
    );

    fillForm(fixture, 2, 1011);
    await fixture.componentInstance.create();

    expect(askSpy).not.toHaveBeenCalled();
    expect(storeMock.create).toHaveBeenCalledTimes(1);
  });

  // A szint-<select> [value]-t használ (nem [ngValue]-t), ezért a control értéke a DOM-on
  // keresztül STRING-ként érkezik, a FormControl number típusa ellenére. Number()-konverzió
  // nélkül a "3" === 3 összehasonlítás mindig hamis lenne, és az egyező szint is kérdezne.
  it('BE-TASKSET-LEVEL-CATEGORY-MISMATCH: a <select>-ből érkező string szint sem téveszti meg ' +
    'az összehasonlítást', async () => {
    const { fixture, askSpy } = setupWithCategories(
      categoriesOf({ id: 1011, name: 'Középhaladó programozás', suggestedLevelId: 2 }),
    );

    fillForm(fixture, 2, 1011);
    // Pontosan az, amit a DOM-hoz kötött select ír a controlba:
    fixture.componentInstance.createForm.controls.levelId.setValue('2' as unknown as number);
    await fixture.componentInstance.create();

    expect(askSpy).not.toHaveBeenCalled();
    expect(storeMock.create).toHaveBeenCalledTimes(1);
    expect(storeMock.create.mock.calls[0][0]).toMatchObject({ levelId: 2 });
  });
});
