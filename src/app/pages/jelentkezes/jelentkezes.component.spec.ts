import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { JelentkezesComponent } from './jelentkezes.component';
import { TeacherApplicationStore } from '../../services/teacher-application/teacher-application.store';
import { AuthStore } from '../../services/auth/store/auth.store';
import { TeacherApplicationDto } from '../../models/teacher-application.model';

function makeRejectedApplication(overrides: Partial<TeacherApplicationDto> = {}): TeacherApplicationDto {
  return {
    id: 1,
    status: 'Rejected',
    motivation: 'Tíz éve tanítok informatikát egy középiskolában, szeretnék feladatsorokat készíteni.',
    institutionName: 'Teszt Gimnázium',
    createdAt: '2026-01-01T00:00:00Z',
    decidedAt: '2026-01-02T00:00:00Z',
    rejectionReason: 'Hiányos bemutatkozás.',
    ...overrides,
  };
}

describe('JelentkezesComponent', () => {
  let storeMock: {
    application: ReturnType<typeof signal<TeacherApplicationDto | null>>;
    loading: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    checked: ReturnType<typeof signal<boolean>>;
    status: ReturnType<typeof signal<string | null>>;
    isPending: ReturnType<typeof signal<boolean>>;
    isApproved: ReturnType<typeof signal<boolean>>;
    isRejected: ReturnType<typeof signal<boolean>>;
    loadMine: ReturnType<typeof vi.fn>;
    apply: ReturnType<typeof vi.fn>;
  };
  let authStoreMock: {
    hasTeacherRole: ReturnType<typeof signal<boolean>>;
    refreshToken: ReturnType<typeof vi.fn>;
  };

  function configure(options: {
    application?: TeacherApplicationDto | null;
    checked?: boolean;
    isPending?: boolean;
    isApproved?: boolean;
    isRejected?: boolean;
    hasTeacherRole?: boolean;
  }) {
    storeMock = {
      application: signal(options.application ?? null),
      loading: signal(false),
      error: signal(null),
      checked: signal(options.checked ?? true),
      status: signal(null),
      isPending: signal(options.isPending ?? false),
      isApproved: signal(options.isApproved ?? false),
      isRejected: signal(options.isRejected ?? false),
      loadMine: vi.fn(),
      apply: vi.fn(),
    };
    authStoreMock = {
      hasTeacherRole: signal(options.hasTeacherRole ?? false),
      refreshToken: vi.fn().mockResolvedValue('new-token'),
    };

    TestBed.configureTestingModule({
      imports: [JelentkezesComponent],
      providers: [
        provideRouter([]),
        { provide: TeacherApplicationStore, useValue: storeMock },
        { provide: AuthStore, useValue: authStoreMock },
      ],
    });
  }

  // UI-TT-17: elutasított jelentkezés után a form előtöltése a korábbi adatokkal.
  it('elutasított jelentkezésnél előtölti a formot a korábban beadott bemutatkozással és intézménynévvel', () => {
    configure({ application: makeRejectedApplication(), isRejected: true });
    const fixture = TestBed.createComponent(JelentkezesComponent);
    fixture.detectChanges();

    const raw = fixture.componentInstance.form.getRawValue();
    expect(raw.motivation).toBe(
      'Tíz éve tanítok informatikát egy középiskolában, szeretnék feladatsorokat készíteni.',
    );
    expect(raw.institutionName).toBe('Teszt Gimnázium');
  });

  it('elutasított jelentkezésnél, hiányzó intézménynév esetén a mezőt üresen hagyja, a bemutatkozást előtölti', () => {
    configure({
      application: makeRejectedApplication({ institutionName: undefined }),
      isRejected: true,
    });
    const fixture = TestBed.createComponent(JelentkezesComponent);
    fixture.detectChanges();

    const raw = fixture.componentInstance.form.getRawValue();
    expect(raw.motivation).not.toBe('');
    expect(raw.institutionName).toBe('');
  });

  it('nem elutasított (első jelentkezés) esetben a form üresen indul', () => {
    configure({ application: null, checked: true });
    const fixture = TestBed.createComponent(JelentkezesComponent);
    fixture.detectChanges();

    const raw = fixture.componentInstance.form.getRawValue();
    expect(raw.motivation).toBe('');
    expect(raw.institutionName).toBe('');
  });

  // UI-TT-50: már "teacher" role-lal rendelkező felhasználónak nem az üres jelentkezési formot mutatja.
  it('már teacher role-lal rendelkező felhasználónak NEM jeleníti meg a jelentkezési formot', () => {
    configure({ application: null, checked: true, hasTeacherRole: true });
    const fixture = TestBed.createComponent(JelentkezesComponent);
    fixture.detectChanges();

    const motivationField = fixture.nativeElement.querySelector('#motivation');
    expect(motivationField).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Már rendelkezel tanári hozzáféréssel');
  });

  it('teacher role nélkül, checked=true, elbírálatlan állapotban megjeleníti a jelentkezési formot', () => {
    configure({ application: null, checked: true, hasTeacherRole: false });
    const fixture = TestBed.createComponent(JelentkezesComponent);
    fixture.detectChanges();

    const motivationField = fixture.nativeElement.querySelector('#motivation');
    expect(motivationField).not.toBeNull();
  });

  // UI-TT-16: "Belépés tanárként" sikertelen token-frissítésnél ne navigáljon tovább
  // néma teljes kijelentkeztetésként, hanem jelezze a hibát a felhasználónak.
  describe('enterAsTeacher()', () => {
    it('BUG UI-TT-16: sikertelen refresh esetén NEM navigál a dashboardra, hanem hibaüzenetet jelenít meg', async () => {
      configure({ application: null, checked: true, isApproved: true });
      authStoreMock.refreshToken.mockResolvedValue(null);

      const fixture = TestBed.createComponent(JelentkezesComponent);
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigateByUrl');
      fixture.detectChanges();

      await fixture.componentInstance.enterAsTeacher();
      fixture.detectChanges();

      expect(navigateSpy).not.toHaveBeenCalled();
      expect(fixture.componentInstance.enterAsTeacherError()).toBeTruthy();
      expect(fixture.nativeElement.textContent).toContain(fixture.componentInstance.enterAsTeacherError());
    });

    it('sikeres refresh esetén a dashboardra navigál, hiba nélkül', async () => {
      configure({ application: null, checked: true, isApproved: true });
      authStoreMock.refreshToken.mockResolvedValue('new-token');

      const fixture = TestBed.createComponent(JelentkezesComponent);
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      fixture.detectChanges();

      await fixture.componentInstance.enterAsTeacher();

      expect(navigateSpy).toHaveBeenCalledWith('/dashboard', { replaceUrl: true });
      expect(fixture.componentInstance.enterAsTeacherError()).toBeNull();
    });
  });

  /**
   * UI-TT-128 (ARIA/screen-reader-szemantika lencse, "dinamikus állapot nem
   * jelentve `aria-live` régión" altípus - a UI-TT-127 mintája, most a
   * tanári-jelentkezés oldalon). A konstruktor (jelentkezes.component.ts:57-66)
   * 5 másodpercenként (`POLL_INTERVAL_MS`) újratölti a jelentkezés státuszát,
   * AMÍG `store.isPending()` igaz - ha eközben a jelentkezést elbírálják
   * (elfogadva/elutasítva), a `@else if (store.isApproved())`/`isPending()`
   * ág (jelentkezes.component.ts sablonja) egy TELJESEN MÁS DOM-blokkra
   * cserélődik ("Jelentkezésed elbírálás alatt." -> "Tanári jelentkezésed
   * elfogadva!"), miközben a diák a lapon marad, esetleg máshova fókuszálva
   * (pl. egy másik fülre váltva). A teljes komponens sablonjában nincs
   * `aria-live`/`role="status"`/`role="alert"` - egy screen-reader-felhasználó
   * SOSEM értesül a háttérben, a saját beavatkozása NÉLKÜL bekövetkező
   * státuszváltásról, csak akkor, ha kézzel újra a tartalomhoz navigál.
   */
  it('BUG UI-TT-128: a jelentkezés-státusz háttérben (pollozással) történő megváltozása (pending -> approved) nincs aria-live/role=alert/role=status régióban jelezve', () => {
    configure({ application: null, checked: true, isPending: true });
    const fixture = TestBed.createComponent(JelentkezesComponent);
    fixture.detectChanges();

    // Kezdetben "elbírálás alatt" állapot látszik.
    expect(fixture.nativeElement.textContent).toContain('Jelentkezésed elbírálás alatt.');

    // A háttérben (a store saját pollozása szimulálva) a jelentkezés
    // elfogadásra kerül - a felhasználó SEMMILYEN saját interakciót nem
    // végzett, ez egy tisztán háttérben, a poll-ciklus miatt bekövetkező
    // állapotváltás.
    storeMock.isPending.set(false);
    storeMock.isApproved.set(true);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Tanári jelentkezésed elfogadva!');

    // A háttérben történt kritikus státuszváltásnak egy aria-live/role=alert/
    // role=status régióban kellene lennie, hogy egy screen-reader-felhasználó
    // értesüljön róla a saját fókuszától/beavatkozásától függetlenül. BUKIK:
    // a teljes renderelt DOM-ban egyetlen ilyen elem sincs.
    const liveRegions = fixture.nativeElement.querySelectorAll(
      '[aria-live], [role="alert"], [role="status"]',
    );
    expect(liveRegions.length).toBeGreaterThan(0);
  });

  /**
   * UI-TT-132: a repó saját
   * `notBlankValidator`-ját (`shared/validators/not-blank.validator.ts`, a
   * UI-TT-60 fixje) a `csoportok-lista`/`feladatsorok-lista`/`intezmenyek-lista`
   * komponensek mind alkalmazzák a saját cím/név mezőjükön, DE a `motivation`
   * mezőn (jelentkezes.component.ts:111) csak `Validators.required` +
   * `Validators.minLength(20)` fut - egy 20+ hosszú, KIZÁRÓLAG szóközökből álló
   * bemutatkozás mindkettőn átmegy (a `minLength` a whitespace karaktereket is
   * számolja), a submit gomb aktívvá válik, a form.invalid `false`. A backend
   * (`TeacherApplicationService.ApplyAsync`,
   * `string.IsNullOrWhiteSpace(request.Motivation)`) viszont elutasítja - a
   * felhasználó csak egy felesleges, sikertelen kör-út után kap hibaüzenetet,
   * pontosan az a UX-hiba, amit a `notBlankValidator` a testvér-formokon már
   * megelőz. BUKIK: a form ma érvényesnek jelzi a kizárólag szóközökből álló
   * bemutatkozást.
   */
  it('BUG UI-TT-132: 20+ hosszú, kizárólag szóközökből álló bemutatkozást a kliens-oldali validáció érvényesnek jelzi, holott a backend elutasítaná', () => {
    configure({ application: null, checked: true });
    const fixture = TestBed.createComponent(JelentkezesComponent);
    fixture.detectChanges();

    fixture.componentInstance.form.controls.motivation.setValue(' '.repeat(25));

    // Helyesen invalid-nak KELLENE lennie (ahogy a notBlankValidator a testvér-formokon
    // biztosítja) - BUKIK: ma `false`, a submit gomb aktív marad.
    expect(fixture.componentInstance.form.invalid).toBe(true);
  });
});
