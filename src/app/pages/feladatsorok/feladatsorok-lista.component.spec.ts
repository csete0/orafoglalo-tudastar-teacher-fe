import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
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
});
