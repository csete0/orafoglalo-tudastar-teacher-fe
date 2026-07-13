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
    schoolStoreMock = { schools: signal([]), loadMine: vi.fn() };

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

  it('create() whitespace-only névvel NEM hívja meg a store.create()-et', () => {
    configure();
    const fixture = TestBed.createComponent(CsoportokListaComponent);
    fixture.detectChanges();

    fixture.componentInstance.createForm.controls.name.setValue('   ');
    fixture.componentInstance.create();

    expect(storeMock.create).not.toHaveBeenCalled();
  });
});
