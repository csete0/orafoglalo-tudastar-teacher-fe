import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { FeladatsorokListaComponent } from './feladatsorok-lista.component';
import { TeacherTaskSetStore } from '../../services/teacher-taskset/teacher-taskset.store';
import { CategoryService } from '../../services/category/category.service';

describe('FeladatsorokListaComponent', () => {
  let storeMock: {
    taskSets: ReturnType<typeof signal<unknown[]>>;
    loading: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    loadMine: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };

  function configure() {
    storeMock = {
      taskSets: signal([]),
      loading: signal(false),
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

  // UI-TT-category-tosignal-unhandled-error: a `readonly categories = toSignal(this.categoryService.getAll(), ...)`
  // (feladatsorok-lista.component.ts:116) SEMMILYEN catchError-t nem alkalmaz a CategoryService.getAll()
  // Observable-jén. Angular toSignal() dokumentált viselkedése: ha a forrás Observable hibával fut le, a
  // visszaadott signal a KÖVETKEZŐ olvasáskor eldobja azt a hibát (node_modules/@angular/core/fesm2022/
  // rxjs-interop.mjs: "case 2: throw current.error"). A `categories()` a sablon `@for` ciklusában (95-98. sor)
  // FELTÉTEL NÉLKÜL kerül kiolvasásra minden change detection körben — tehát ha a publikus
  // GET /public/categories végpont akár egyszer hibázik (hálózati hiba, 500, stb.), a teljes
  // "Feladatsoraim" oldal (a MEGLÉVŐ feladatsor-lista ÉS az "Új feladatsor" űrlap is) törik, holott ez a
  // hiba kizárólag a "Tantárgyi kategória" legördülő menüt kellene, hogy érintse - ellentétben a lapon lévő
  // MÁSIK store-ral (TeacherTaskSetStore), aminek van saját, sablonban explicit kezelt error() signalja
  // (29-31. sor). Ez a bug reprodukálja azt a mintát, amit a UI-TT-67 már megtalált a csoport-/intézmény-
  // részletek "melléktermék" store-jainál (hiba-jelzés hiánya), csak itt a hiba nem is elnyelődik, hanem
  // KIDOBÓDIK és eldönti a teljes komponens renderelését.
  it('BUG UI-TT-category-tosignal-unhandled-error: a CategoryService.getAll() hibája esetén a teljes oldal ' +
    'renderelése eldől, ahelyett hogy csak a kategória-legördülő maradna üres', () => {
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
});
