import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { throwError, of } from 'rxjs';
import { JelentkezesComponent } from './jelentkezes.component';
import { TeacherApplicationStore } from '../../services/teacher-application/teacher-application.store';
import { AuthStore } from '../../services/auth/store/auth.store';
import { AuthService } from '../../services/auth/auth.service';
import { STORAGE_KEYS, TeacherUserLoginDto } from '../../models/auth.model';
import { TeacherApplicationDto } from '../../models/teacher-application.model';

function makeAuthUser(overrides: Partial<TeacherUserLoginDto> = {}): TeacherUserLoginDto {
  return {
    id: 1,
    userName: 'tanar',
    email: 'tanar@example.com',
    firstName: 'Teszt',
    lastName: 'Tanár',
    roles: ['teacher'],
    ...overrides,
  };
}

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
    refreshTokenWithoutAutoRedirect: ReturnType<typeof vi.fn>;
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
      refreshTokenWithoutAutoRedirect: vi.fn().mockResolvedValue('new-token'),
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
      authStoreMock.refreshTokenWithoutAutoRedirect.mockResolvedValue(null);

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
      authStoreMock.refreshTokenWithoutAutoRedirect.mockResolvedValue('new-token');

      const fixture = TestBed.createComponent(JelentkezesComponent);
      const router = TestBed.inject(Router);
      const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      fixture.detectChanges();

      await fixture.componentInstance.enterAsTeacher();

      expect(navigateSpy).toHaveBeenCalledWith('/dashboard', { replaceUrl: true });
      expect(fixture.componentInstance.enterAsTeacherError()).toBeNull();
    });

    // UI-TT-16/UI-TT-144 interakció-regresszió: a fenti két teszt teljesen
    // mockolja az AuthStore-t, ezért SOSEM futtatja át a valódi
    // AuthStore -> TokenService.doTokenRefresh() hibaláncot, amit a
    // UI-TT-144 fix (2026-07-27, `7fc0a46`) módosított - pontosan ez a rés
    // miatt nem vette észre a régi tesztkészlet, hogy a megosztott
    // `onTokenRefreshFailed` hook mostantól automatikusan /login-ra navigál.
    // Ez a blokk a VALÓDI AuthStore/TokenService láncot használja, csak a
    // HTTP-réteget (AuthService) mockolja.
    describe('valódi AuthStore/TokenService lánc (nem mockolt AuthStore)', () => {
      function configureWithRealAuthStore(authServiceMock: Partial<AuthService>) {
        storeMock = {
          application: signal(null),
          loading: signal(false),
          error: signal(null),
          checked: signal(true),
          status: signal(null),
          isPending: signal(false),
          isApproved: signal(true),
          isRejected: signal(false),
          loadMine: vi.fn(),
          apply: vi.fn(),
        };

        localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, 'access.tok.en');
        localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(makeAuthUser()));

        TestBed.configureTestingModule({
          imports: [JelentkezesComponent],
          providers: [
            provideRouter([]),
            AuthStore,
            { provide: TeacherApplicationStore, useValue: storeMock },
            { provide: AuthService, useValue: authServiceMock },
          ],
        });
      }

      afterEach(() => {
        localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.USER_DATA);
      });

      it(
        'UI-TT-16/UI-TT-144 regresszió-fix: a VALÓDI lánc token-refresh hibája NEM navigál /login-ra, hanem az inline enterAsTeacherError-t állítja be',
        async () => {
          configureWithRealAuthStore({
            // Érvényes, nem lejárt token az inicializációhoz - a munkamenet
            // MÁR authentikált (isAuthenticated=true), MIELŐTT enterAsTeacher()
            // fut, hogy a fixet ténylegesen igazoló true->false átmenetet
            // mérjük (egy sosem-authentikált állapotból induló teszt a
            // meglévő `wasAuthenticated` védelem miatt hamis-pozitívan
            // "átmenne" a fix nélkül is).
            getTokenExpiry: vi.fn().mockReturnValue(new Date(Date.now() + 60 * 60_000)),
            refreshTokens: vi.fn(() => throwError(() => new Error('hálózati hiba'))),
          } as unknown as Partial<AuthService>);

          const fixture = TestBed.createComponent(JelentkezesComponent);
          const router = TestBed.inject(Router);
          const navigateSpy = vi.spyOn(router, 'navigateByUrl');
          fixture.detectChanges();

          const authStore = TestBed.inject(AuthStore);
          await authStore.ensureInitialization();
          expect(authStore.isAuthenticated()).toBe(true);

          await fixture.componentInstance.enterAsTeacher();
          fixture.detectChanges();

          // A régi hiba pontosan ez volt: a megosztott onTokenRefreshFailed
          // hook (UI-TT-144 óta) automatikusan elnavigált /login-ra, mielőtt
          // ez a komponens a saját, dedikált hibaüzenetét megjeleníthette
          // volna - ezt kellett elnyomni refreshTokenWithoutAutoRedirect()-tel.
          expect(navigateSpy).not.toHaveBeenCalledWith('/login');
          expect(navigateSpy).not.toHaveBeenCalledWith('/dashboard', { replaceUrl: true });
          expect(fixture.componentInstance.enterAsTeacherError()).toBeTruthy();
          expect(authStore.isAuthenticated()).toBe(false);
        },
        10000,
      );

      it(
        'UI-TT-144 nem regresszált: egy ettől FÜGGETLEN, ambiens token-refresh-hiba a VALÓDI láncban továbbra is /login-ra navigál',
        async () => {
          configureWithRealAuthStore({
            getTokenExpiry: vi.fn().mockReturnValue(new Date(Date.now() + 60 * 60_000)),
            refreshTokens: vi.fn(() => throwError(() => new Error('lejárt refresh-token'))),
          } as unknown as Partial<AuthService>);

          const fixture = TestBed.createComponent(JelentkezesComponent);
          const router = TestBed.inject(Router);
          const navigateSpy = vi.spyOn(router, 'navigateByUrl');
          fixture.detectChanges();

          const authStore = TestBed.inject(AuthStore);
          await authStore.ensureInitialization();
          expect(authStore.isAuthenticated()).toBe(true);

          // Ez a hívás NEM az enterAsTeacher()-ből indul (a sima
          // refreshToken()-t hívja, nem a suppress-variánst) - egy háttérben
          // (pl. proaktív refresh-monitorozás) induló, független hibát szimulál.
          await authStore.refreshToken();

          expect(authStore.isAuthenticated()).toBe(false);
          expect(navigateSpy).toHaveBeenCalledWith('/login');
        },
        10000,
      );
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

  /**
   * BE-DATETIME-UTC-MARKER-MISSING-ON-DB-READ (0.A validációs kör, P2): a "Beadva:"
   * időbélyeg PONTOSAN 2 órát ugrott ugyanazon a változatlan jelentkezésen a beadás utáni
   * első render (18:40) és az 5 másodperces poll újratöltése (16:40) között.
   *
   * A gyökérok a BACKENDEN volt: a POST a memóriában létrehozott entitást adta vissza
   * (Kind=Utc -> "Z"-vel sorosodik), a GET viszont az adatbázisból olvasta vissza
   * (EF Core -> Kind=Unspecified -> "Z" NÉLKÜL sorosodik), a JS pedig a "Z" nélküli
   * alakot HELYI időként értelmezi. Javítva egy globális JSON-konverterrel, ami minden
   * kimenő időbélyeget "Z"-vel ír ki.
   *
   * Ezek a tesztek a FRONTEND-oldali szerződést őrzik: a komponens a kapott UTC
   * időbélyeget helyi időre konvertálva jelenítse meg (DatePipe), és NE a nyers ISO
   * falióra-értéket írja ki - különben a backend javítása hiába történt meg.
   */
  function expectedLocalText(iso: string): string {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  it('függőben lévő jelentkezésnél a "Beadva" időbélyeget helyi időre konvertálva jeleníti meg, nem nyers UTC-ként', () => {
    // Pontosan az az időpont, amin a hibát élesben megfigyeltük (DB: 16:40:28 UTC).
    const createdAt = '2026-07-27T16:40:28Z';
    configure({
      application: makeRejectedApplication({ status: 'Pending', createdAt, decidedAt: undefined }),
      isPending: true,
    });
    const fixture = TestBed.createComponent(JelentkezesComponent);
    fixture.detectChanges();

    const text: string = fixture.nativeElement.textContent;
    expect(text).toContain(expectedLocalText(createdAt));
  });

  it('ugyanazt az időpontot azonosan jeleníti meg, akár a beadás válaszából, akár a poll újratöltésből érkezik', () => {
    // A backend javítása után mindkét útvonal ugyanazt a "Z"-végű alakot küldi - a
    // nézetnek ezért bit-re azonos szöveget kell adnia. A hiba idején a poll-ág
    // "Z" nélküli alakot kapott, és emiatt 2 órával korábbit írt ki.
    const render = (createdAt: string): string => {
      configure({
        application: makeRejectedApplication({ status: 'Pending', createdAt, decidedAt: undefined }),
        isPending: true,
      });
      const fixture = TestBed.createComponent(JelentkezesComponent);
      fixture.detectChanges();
      const text: string = fixture.nativeElement.textContent;
      TestBed.resetTestingModule();
      return text;
    };

    const fromApply = render('2026-07-27T16:40:28.1234567Z');
    const fromPoll = render('2026-07-27T16:40:28.0000000Z');

    expect(fromApply).toContain(expectedLocalText('2026-07-27T16:40:28Z'));
    expect(fromPoll).toContain(expectedLocalText('2026-07-27T16:40:28Z'));
  });
});
