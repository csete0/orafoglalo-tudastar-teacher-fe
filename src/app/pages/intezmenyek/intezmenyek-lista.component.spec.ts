import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { IntezmenyekListaComponent } from './intezmenyek-lista.component';
import { SchoolStore } from '../../services/school/school.store';
import { ConfirmService } from '../../shared/confirm/confirm.service';

describe('IntezmenyekListaComponent', () => {
  let storeMock: {
    schools: ReturnType<typeof signal<unknown[]>>;
    loading: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    loadMine: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    join: ReturnType<typeof vi.fn>;
  };
  let confirmServiceMock: { ask: ReturnType<typeof vi.fn> };

  function configure() {
    storeMock = {
      schools: signal([]),
      loading: signal(false),
      error: signal(null),
      loadMine: vi.fn(),
      create: vi.fn(),
      join: vi.fn(),
    };

    confirmServiceMock = { ask: vi.fn().mockResolvedValue(true) };

    TestBed.configureTestingModule({
      imports: [IntezmenyekListaComponent],
      providers: [
        provideRouter([]),
        { provide: SchoolStore, useValue: storeMock },
        { provide: ConfirmService, useValue: confirmServiceMock },
      ],
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

  // UI-TT-102: a csatlakozás a háttérben azonnal láthatóvá teszi a tanár már publikált
  // feladatsorait az intézmény meglévő csoportjainak diákjai számára - ehhez, a
  // testvér-műveletekhez (changeSchool(), publish()) hasonlóan, megerősítés szükséges.
  it('BUG UI-TT-102 javítva: joinSchool() megerősítő dialógust jelenít meg a store.join() hívása előtt', async () => {
    configure();
    const fixture = TestBed.createComponent(IntezmenyekListaComponent);
    fixture.detectChanges();

    fixture.componentInstance.joinForm.controls.code.setValue('ABCD1234');
    await fixture.componentInstance.joinSchool();

    expect(confirmServiceMock.ask).toHaveBeenCalled();
    expect(storeMock.join).toHaveBeenCalledWith({ code: 'ABCD1234' }, expect.any(Function));
  });

  it('a dialógus elutasítása esetén joinSchool() NEM hívja meg a store.join()-t, és nem üríti a formot', async () => {
    configure();
    confirmServiceMock.ask.mockResolvedValue(false);
    const fixture = TestBed.createComponent(IntezmenyekListaComponent);
    fixture.detectChanges();

    fixture.componentInstance.joinForm.controls.code.setValue('ABCD1234');
    await fixture.componentInstance.joinSchool();

    expect(storeMock.join).not.toHaveBeenCalled();
    expect(fixture.componentInstance.joinForm.controls.code.value).toBe('ABCD1234');
  });

  it('a dialógus elfogadása esetén joinSchool() a form aktuális kódjával hívja meg a store.join()-t', async () => {
    configure();
    const fixture = TestBed.createComponent(IntezmenyekListaComponent);
    fixture.detectChanges();

    fixture.componentInstance.joinForm.controls.code.setValue('XYZ98765');
    await fixture.componentInstance.joinSchool();

    expect(confirmServiceMock.ask).toHaveBeenCalled();
    expect(storeMock.join).toHaveBeenCalledWith({ code: 'XYZ98765' }, expect.any(Function));
  });
});
