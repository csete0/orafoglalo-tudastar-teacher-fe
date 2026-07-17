import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { IntezmenyekListaComponent } from './intezmenyek-lista.component';
import { SchoolStore } from '../../services/school/school.store';

describe('IntezmenyekListaComponent', () => {
  let storeMock: {
    schools: ReturnType<typeof signal<unknown[]>>;
    loading: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    loadMine: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    join: ReturnType<typeof vi.fn>;
  };

  function configure() {
    storeMock = {
      schools: signal([]),
      loading: signal(false),
      error: signal(null),
      loadMine: vi.fn(),
      create: vi.fn(),
      join: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [IntezmenyekListaComponent],
      providers: [provideRouter([]), { provide: SchoolStore, useValue: storeMock }],
    });
  }

  // UI-TT-60: whitespace-only intézménynév a beépített Validators.required mellett érvényesnek
  // számítana — a notBlankValidator ezt hivatott elkapni, kliens-oldalon.
  it('BUG UI-TT-60 javítva: whitespace-only név esetén a "Létrehozás" gomb letiltva marad, inline hibaüzenettel', () => {
    configure();
    const fixture = TestBed.createComponent(IntezmenyekListaComponent);
    fixture.detectChanges();

    fixture.componentInstance.createForm.controls.name.setValue('Valid Placeholder');
    fixture.detectChanges();

    fixture.componentInstance.createForm.controls.name.setValue('   ');
    fixture.detectChanges();

    expect(fixture.componentInstance.createForm.invalid).toBe(true);
    // Az oldalon két form van (Új intézmény / Csatlakozás kóddal) — az elsőt (createForm) nézzük.
    const submitButton: HTMLButtonElement = fixture.nativeElement.querySelectorAll('button[type="submit"]')[0];
    expect(submitButton.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Az intézmény neve nem állhat kizárólag szóközökből.');
  });

  it('valódi név esetén a form érvényes', () => {
    configure();
    const fixture = TestBed.createComponent(IntezmenyekListaComponent);
    fixture.detectChanges();

    fixture.componentInstance.createForm.controls.name.setValue('Teszt Gimnázium');
    fixture.detectChanges();

    expect(fixture.componentInstance.createForm.valid).toBe(true);
  });

  it('createSchool() whitespace-only névvel NEM hívja meg a store.create()-et', () => {
    configure();
    const fixture = TestBed.createComponent(IntezmenyekListaComponent);
    fixture.detectChanges();

    fixture.componentInstance.createForm.controls.name.setValue('   ');
    fixture.componentInstance.createSchool();

    expect(storeMock.create).not.toHaveBeenCalled();
  });

  // UI-TT-6: a "Létrehozás" gomb korábban nem volt letiltva egy már folyamatban
  // lévő kérés alatt — dupla kattintás duplikált intézményt hozhatott létre.
  it('BUG UI-TT-6 javítva: store.loading() alatt a "Létrehozás" gomb letiltott és createSchool() no-op', () => {
    configure();
    storeMock.loading.set(true);
    const fixture = TestBed.createComponent(IntezmenyekListaComponent);
    fixture.detectChanges();

    fixture.componentInstance.createForm.controls.name.setValue('Teszt Gimnázium');
    fixture.detectChanges();

    const submitButton: HTMLButtonElement = fixture.nativeElement.querySelectorAll('button[type="submit"]')[0];
    expect(submitButton.disabled).toBe(true);

    fixture.componentInstance.createSchool();
    expect(storeMock.create).not.toHaveBeenCalled();
  });
});
