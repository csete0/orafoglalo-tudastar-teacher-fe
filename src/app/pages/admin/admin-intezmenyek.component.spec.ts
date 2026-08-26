import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AdminIntezmenyekComponent } from './admin-intezmenyek.component';
import { AdminSchoolStore } from '../../services/admin/admin-school.store';
import { AdminLicenseStore } from '../../services/admin/admin-license.store';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';
import { SchoolAdminDto } from '../../models/teacher-moderation.model';
import { InstitutionalLicenseDto } from '../../models/institutional-license.model';

function makeSchool(overrides: Partial<SchoolAdminDto> = {}): SchoolAdminDto {
  return {
    id: 1,
    name: 'Forrás Gimnázium',
    createdAt: new Date().toISOString(),
    teacherCount: 2,
    groupCount: 3,
    adminDisplayNames: [],
    ...overrides,
  };
}

function makeLicense(overrides: Partial<InstitutionalLicenseDto> = {}): InstitutionalLicenseDto {
  return {
    id: 10,
    schoolId: 1,
    teacherProfileId: null,
    ownerName: 'Forrás Gimnázium',
    tier: 'premium',
    capacity: 30,
    usedSeats: 12,
    heldSeats: 14,
    validFrom: '2026-08-25',
    validTo: '2027-08-25',
    idleWindowMinutes: 20,
    revokedAt: null,
    billingNote: null,
    createdAt: '2026-08-25T00:00:00Z',
    isActive: true,
    skippedDueToActiveSessionCount: 0,
    ...overrides,
  };
}

describe('AdminIntezmenyekComponent', () => {
  let storeMock: {
    schools: ReturnType<typeof signal<SchoolAdminDto[]>>;
    loading: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    lastMergeResult: ReturnType<typeof signal<unknown>>;
    load: ReturnType<typeof vi.fn>;
    merge: ReturnType<typeof vi.fn>;
  };
  let licenseStoreMock: {
    licenses: ReturnType<typeof signal<InstitutionalLicenseDto[]>>;
    seats: ReturnType<typeof signal<Record<number, unknown>>>;
    usage: ReturnType<typeof signal<Record<number, unknown>>>;
    loading: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    licensesForSchool: ReturnType<typeof vi.fn>;
    load: ReturnType<typeof vi.fn>;
    loadSeats: ReturnType<typeof vi.fn>;
    loadUsage: ReturnType<typeof vi.fn>;
    clearError: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    revoke: ReturnType<typeof vi.fn>;
    releaseSeat: ReturnType<typeof vi.fn>;
  };
  let confirmServiceMock: { ask: ReturnType<typeof vi.fn> };
  let toastServiceMock: { success: ReturnType<typeof vi.fn>; warning: ReturnType<typeof vi.fn> };

  function configure(
    schools: SchoolAdminDto[] = [makeSchool({ id: 1, name: 'Forrás' }), makeSchool({ id: 2, name: 'Cél' })],
    licenses: InstitutionalLicenseDto[] = [],
  ) {
    storeMock = {
      schools: signal(schools),
      loading: signal(false),
      error: signal(null),
      lastMergeResult: signal(null),
      load: vi.fn(),
      merge: vi.fn(),
    };
    licenseStoreMock = {
      licenses: signal(licenses),
      seats: signal({}),
      usage: signal({}),
      loading: signal(false),
      error: signal(null),
      licensesForSchool: vi.fn((schoolId: number) => licenses.filter((l) => l.schoolId === schoolId)),
      load: vi.fn(),
      loadSeats: vi.fn(),
      loadUsage: vi.fn(),
      clearError: vi.fn(),
      create: vi.fn(),
      // A valódi store `of()`-fal (RxJS-szel) SZINKRON emittál - az onSuccess callback
      // alapból, mint egy sikeres HTTP-válasz, azonnal lefut a frissített DTO-val. Az
      // egyes tesztek felülírhatják, ha hiba-ágat (callback NEM hívása) akarnak szimulálni.
      update: vi.fn((id: number, request: unknown, onSuccess?: (license: InstitutionalLicenseDto) => void) => {
        onSuccess?.(makeLicense({ id, ...(request as object) }));
      }),
      revoke: vi.fn(
        (
          _id: number,
          onSuccess?: (result: { releasedCount: number; skippedDueToActiveSessionCount: number }) => void,
        ) => {
          onSuccess?.({ releasedCount: 1, skippedDueToActiveSessionCount: 0 });
        },
      ),
      releaseSeat: vi.fn(),
    };
    confirmServiceMock = { ask: vi.fn().mockResolvedValue(true) };
    toastServiceMock = { success: vi.fn(), warning: vi.fn() };

    TestBed.configureTestingModule({
      imports: [AdminIntezmenyekComponent],
      providers: [
        { provide: AdminSchoolStore, useValue: storeMock },
        { provide: AdminLicenseStore, useValue: licenseStoreMock },
        { provide: ConfirmService, useValue: confirmServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
      ],
    });
  }

  it('betöltéskor meghívja a store.load()-ot', () => {
    configure();
    TestBed.createComponent(AdminIntezmenyekComponent).detectChanges();
    expect(storeMock.load).toHaveBeenCalled();
  });

  // canMerge(): mindkét intézményt ki kell választani, ÉS a forrás nem lehet
  // ugyanaz, mint a cél - ez az EGYETLEN kliens-oldali védelem, ami elé áll
  // ennek a visszavonhatatlan (forrás-törléssel járó) admin-műveletnek.
  it('canMerge() hamis, ha nincs kiválasztva forrás vagy cél', () => {
    configure();
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    expect(component.canMerge()).toBe(false);

    component.sourceId = 1;
    expect(component.canMerge()).toBe(false);

    component.targetId = 2;
    expect(component.canMerge()).toBe(true);
  });

  it('canMerge() hamis, ha a forrás és a cél ugyanaz az intézmény', () => {
    configure();
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.sourceId = 1;
    component.targetId = 1;

    expect(component.canMerge()).toBe(false);
  });

  it('az "Egyesítés" gomb kezdetben letiltva, amíg nincs érvényesen kiválasztva forrás és cél', () => {
    configure();
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button.disabled).toBe(true);
  });

  it('érvényes forrás+cél kiválasztás esetén az "Egyesítés" gomb engedélyezett', () => {
    configure();
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.componentInstance.sourceId = 1;
    fixture.componentInstance.targetId = 2;
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button.disabled).toBe(false);
  });

  it('store.loading() alatt az "Egyesítés" gomb letiltott, még érvényes kiválasztás mellett is', () => {
    configure();
    storeMock.loading.set(true);
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.componentInstance.sourceId = 1;
    fixture.componentInstance.targetId = 2;
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(button.disabled).toBe(true);
  });

  // Ez a visszavonhatatlan admin-akció (forrás intézmény törlődik, tanárai/
  // csoportjai átkerülnek) - a megerősítő dialógusnak `danger: true`-t KELL
  // kapnia, és a konkrét intézményneveket KELL tartalmaznia, hogy az admin
  // pontosan lássa, mit egyesít mivel, mielőtt jóváhagyná.
  it('confirmMerge() a konkrét forrás/cél intézménynévvel és danger=true-val kéri a megerősítést', async () => {
    configure([makeSchool({ id: 1, name: 'Duplikált Gimnázium' }), makeSchool({ id: 2, name: 'Fő Gimnázium' })]);
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();

    fixture.componentInstance.sourceId = 1;
    fixture.componentInstance.targetId = 2;
    await fixture.componentInstance.confirmMerge();

    expect(confirmServiceMock.ask).toHaveBeenCalledWith(
      expect.objectContaining({
        danger: true,
        message: expect.stringContaining('Duplikált Gimnázium'),
      }),
    );
    expect(confirmServiceMock.ask.mock.calls[0][0].message).toContain('Fő Gimnázium');
    expect(storeMock.merge).toHaveBeenCalledWith(1, 2);
  });

  it('a dialógus elutasítása esetén confirmMerge() NEM hívja meg a store.merge()-öt, és a kiválasztás megmarad', async () => {
    configure();
    confirmServiceMock.ask.mockResolvedValue(false);
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();

    fixture.componentInstance.sourceId = 1;
    fixture.componentInstance.targetId = 2;
    await fixture.componentInstance.confirmMerge();

    expect(storeMock.merge).not.toHaveBeenCalled();
    expect(fixture.componentInstance.sourceId).toBe(1);
    expect(fixture.componentInstance.targetId).toBe(2);
  });

  it('sikeres jóváhagyás után confirmMerge() törli a sourceId/targetId kiválasztást', async () => {
    configure();
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();

    fixture.componentInstance.sourceId = 1;
    fixture.componentInstance.targetId = 2;
    await fixture.componentInstance.confirmMerge();

    expect(storeMock.merge).toHaveBeenCalledWith(1, 2);
    expect(fixture.componentInstance.sourceId).toBeNull();
    expect(fixture.componentInstance.targetId).toBeNull();
  });

  // confirmMerge() a `canMerge()`-öt (és a store.loading()-ot) ÚJRA ellenőrzi
  // a metódus elején - egy dupla-kattintás (mielőtt a gomb [disabled]
  // bindingja ténylegesen letiltaná a DOM-elemet) nem indíthat két egyidejű
  // egyesítést.
  it('confirmMerge() store.loading() alatt no-op, még akkor is, ha canMerge() igaz', async () => {
    configure();
    storeMock.loading.set(true);
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();

    fixture.componentInstance.sourceId = 1;
    fixture.componentInstance.targetId = 2;
    await fixture.componentInstance.confirmMerge();

    expect(confirmServiceMock.ask).not.toHaveBeenCalled();
    expect(storeMock.merge).not.toHaveBeenCalled();
  });

  // UI-TT-195: a merge-eszköz kifejezetten VÉLETLENÜL DUPLIKÁLTAN létrejött,
  // tehát tipikusan AZONOS NEVŰ intézmények összevonására való (ld. a
  // komponens saját sablon-leírása: "Két véletlenül duplikáltan létrejött
  // intézmény egyesíthető"). Két ilyen, azonos nevű, de különböző
  // város/id-jű intézmény esetén sem a forrás/cél legördülő listák, sem a
  // végső, "Ez nem vonható vissza." jóváhagyó dialógus szövege NEM
  // különbözteti meg őket - mindkét <option> és a dialógus üzenete is
  // szó szerint ugyanaz a szöveg, city/id nélkül.
  it('BUG UI-TT-195: két AZONOS NEVŰ intézmény a forrás/cél legördülőben és a jóváhagyó dialógusban is megkülönböztethetetlen', async () => {
    configure([
      makeSchool({ id: 1, name: 'Duplikált Gimnázium', city: 'Budapest' }),
      makeSchool({ id: 2, name: 'Duplikált Gimnázium', city: 'Szeged' }),
    ]);
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();

    const sourceSelect: HTMLSelectElement = fixture.nativeElement.querySelector('select[name="sourceId"]');
    const optionTexts = Array.from(sourceSelect.options)
      .slice(1) // az első a "Válassz…" placeholder
      .map((o) => o.textContent?.trim());

    // Elvárás: a két KÜLÖNBÖZŐ intézményhez tartozó opciószöveg legyen
    // megkülönböztethető (pl. tartalmazza a várost is) - BUKIK, mindkettő
    // szó szerint "Duplikált Gimnázium".
    expect(new Set(optionTexts).size).toBe(2);

    fixture.componentInstance.sourceId = 1;
    fixture.componentInstance.targetId = 2;
    await fixture.componentInstance.confirmMerge();

    // Elvárás: a visszavonhatatlan művelet jóváhagyó szövege azonosítsa,
    // MELYIK "Duplikált Gimnázium"-ot törli (pl. várossal) - BUKIK, a
    // dialógus szó szerint kétszer ugyanazt a nevet tartalmazza, az admin
    // szövegből nem tudja megállapítani, a Budapesti vagy a Szegedi
    // példány törlődik-e.
    const message: string = confirmServiceMock.ask.mock.calls[0][0].message;
    expect(message).toContain('Budapest');
  });

  // BE-INSTLICENSEADMIN-CREATEFORM-LOCALMIDNIGHT-UTCDATE: startNewLicense() a
  // "mai naptól egy tanévnyi időre" alapértelmezést `toDateInput()`-tal tölti,
  // ami `date.toISOString().slice(0, 10)` - ez a Date UTC-komponenseiből
  // olvas, NEM a böngésző helyi (magyar) naptári napjából. Budapesten (nyáron
  // UTC+2, télen UTC+1) helyi éjfél és UTC éjfél között minden nap van egy
  // 1-2 órás ablak, amiben a UTC-nap még a TEGNAPI magyar nap - ilyenkor az
  // admin által "ma"-ként látott dátum-mezők valójában TEGNAPRA (és a
  // "tanévnyi" végdátum is tegnap+1évre) preselectálódnak.
  it('BUG BE-INSTLICENSEADMIN-CREATEFORM-LOCALMIDNIGHT-UTCDATE: helyi éjfél utáni, UTC éjfél előtti percben a "mai nap" alapértelmezés a TEGNAPI dátumot tölti be', () => {
    const originalTZ = process.env['TZ'];
    process.env['TZ'] = 'Europe/Budapest';

    // 2026-08-27 00:30 helyi idő (nyári, UTC+2) = 2026-08-26 22:30 UTC.
    // A helyi naptári nap már augusztus 27., de a UTC-nap még augusztus 26.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-26T22:30:00.000Z'));

    configure();
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();

    fixture.componentInstance.startNewLicense(1);

    expect(fixture.componentInstance.newValidFrom).toBe('2026-08-27');

    vi.useRealTimers();
    process.env['TZ'] = originalTZ;
  });

  it('confirmMerge() no-op, ha a forrás vagy a cél már nem szerepel a store.schools() listájában', async () => {
    configure([makeSchool({ id: 1 })]);
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();

    // A cél (id=2) időközben eltűnt a listából (pl. egy párhuzamos törlés/egyesítés miatt).
    fixture.componentInstance.sourceId = 1;
    fixture.componentInstance.targetId = 2;
    await fixture.componentInstance.confirmMerge();

    expect(confirmServiceMock.ask).not.toHaveBeenCalled();
    expect(storeMock.merge).not.toHaveBeenCalled();
  });

  // UI-TT-198: az AdminLicenseStore.update() (kapacitás/érvényesség/idle-window/
  // számlázási megjegyzés módosítása egy MEGLÉVŐ licencen) teljes körűen elkészült
  // a store és a service oldalon, de ezt a komponenst SOHA nem hívta meg semmi -
  // az admin-felület kizárólag Create/Revoke/ReleaseSeat műveleteket vezetett be.
  // Ld. a hunter proof-tesztjét: bug-hunt/2026-08-26-uitt198-no-license-edit-ui,
  // commit db9f8b7.
  it('BUG UI-TT-198 (javítva): van szerkesztés-képesség (startEditLicense) a komponensen egy MEGLÉVŐ licenchez', () => {
    configure();
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();

    const instance = fixture.componentInstance as unknown as Record<string, unknown>;
    const hasEditCapability = [
      'startEditLicense',
      'editLicense',
      'updateLicense',
      'saveLicenseEdit',
      'openEditLicense',
    ].some((name) => typeof instance[name] === 'function');

    expect(hasEditCapability).toBe(true);
  });

  it('a "Szerkesztés" gomb minden aktív (nem visszavont) licenc-kártyán megjelenik', () => {
    configure([makeSchool({ id: 1 })], [makeLicense({ id: 10, schoolId: 1, revokedAt: null })]);
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();

    const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
    const editButton = buttons.find((b) => b.textContent?.trim() === 'Szerkesztés');
    expect(editButton).toBeTruthy();
  });

  it('visszavont licencen NEM jelenik meg a "Szerkesztés" gomb', () => {
    configure(
      [makeSchool({ id: 1 })],
      [makeLicense({ id: 10, schoolId: 1, revokedAt: '2026-08-20T00:00:00Z', isActive: false })],
    );
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();

    const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
    const editButton = buttons.find((b) => b.textContent?.trim() === 'Szerkesztés');
    expect(editButton).toBeFalsy();
  });

  it('startEditLicense() a licenc jelenlegi adataival tölti fel a szerkesztő form mezőit', () => {
    configure();
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    const license = makeLicense({
      id: 42,
      capacity: 30,
      validFrom: '2026-08-25',
      validTo: '2027-08-25',
      idleWindowMinutes: 20,
      billingNote: 'Fenntartó Kft.',
    });
    component.startEditLicense(license);

    expect(component.editingLicenseId).toBe(42);
    expect(component.editCapacity).toBe(30);
    expect(component.editValidFrom).toBe('2026-08-25');
    expect(component.editValidTo).toBe('2027-08-25');
    expect(component.editIdleWindowMinutes).toBe(20);
    expect(component.editBillingNote).toBe('Fenntartó Kft.');
    expect(licenseStoreMock.clearError).toHaveBeenCalled();
  });

  // A lényeg: a szerkesztés VÉGSŐ soron a store már meglévő, tesztelt
  // update()-jét hívja meg - nem egy revoke+create workaroundot, ami
  // azonnal kirúgná a nem-vizsgázó diákokat és nullázná a kihasználtsági
  // előzményt egy vadonatúj licenc-id alatt.
  it('saveLicenseEdit() a szerkesztett mezőkkel meghívja a licenseStore.update()-öt, majd sikeres válasz után bezárja a formot', () => {
    configure();
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    const license = makeLicense({ id: 42 });
    component.startEditLicense(license);
    component.editCapacity = 40;
    component.editValidFrom = '2026-09-01';
    component.editValidTo = '2027-09-01';
    component.editIdleWindowMinutes = 25;
    component.editBillingNote = '  Új számlázási megjegyzés  ';

    component.saveLicenseEdit(license);

    expect(licenseStoreMock.update).toHaveBeenCalledWith(
      42,
      {
        capacity: 40,
        validFrom: '2026-09-01',
        validTo: '2027-09-01',
        billingNote: 'Új számlázási megjegyzés',
        idleWindowMinutes: 25,
      },
      expect.any(Function),
    );
    // A configure() alap update()-mock-ja szinkron hívja az onSuccess-t (mint a valódi
    // store `of()`-fal) - ez a sikeres válasz zárja a formot.
    expect(component.editingLicenseId).toBeNull();
  });

  it('saveLicenseEdit() üres számlázási megjegyzést null-ra alakít', () => {
    configure();
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    const license = makeLicense({ id: 42 });
    component.startEditLicense(license);
    component.editBillingNote = '   ';

    component.saveLicenseEdit(license);

    expect(licenseStoreMock.update).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ billingNote: null }),
      expect.any(Function),
    );
  });

  // UI-TT-199: `saveLicenseEdit()` korábban `editingLicenseId = null`-t FELTÉTEL NÉLKÜL, a
  // HTTP-válasz előtt állította be. Ha a backend elutasítja a kérést (pl. `ValidateRange`:
  // felcserélt validFrom/validTo - könnyű elgépelés két szomszédos dátum-mezőnél), a form már
  // bezárult, mire a hiba megérkezett - az admin begépelt módosítása véglegesen elveszett, a
  // form újranyitásakor az EREDETI adatokra ugrott vissza. A HELYES viselkedés: a store csak
  // SIKERES válasz esetén hívja az onSuccess-t (ld. `admin-license.store.spec.ts`), a
  // komponens pedig KIZÁRÓLAG onnan zár - hiba esetén a form (és a begépelt értékek) nyitva
  // maradnak.
  it('BUG UI-TT-199 javítva: saveLicenseEdit() sikertelen backend-válasz esetén NEM zárja be a formot, a begépelt módosítás megmarad', () => {
    configure([makeSchool({ id: 1 })], [makeLicense({ id: 42, capacity: 30, validFrom: '2026-08-25', validTo: '2027-08-25' })]);
    // A store `error`-ágát szimuláljuk: hiba esetén a valódi store SOSEM hívja az onSuccess-t.
    licenseStoreMock.update.mockImplementation(() => {
      /* onSuccess szándékosan nincs meghívva - a backend elutasította a kérést */
    });
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const license = makeLicense({ id: 42, capacity: 30, validFrom: '2026-08-25', validTo: '2027-08-25' });

    // Az admin megnyitja a szerkesztőt, és elgépeli a két dátumot (felcseréli őket) - ez
    // élesben a backend `ValidateRange`-jét biztosan elbuktatja.
    component.startEditLicense(license);
    component.editCapacity = 50;
    component.editValidFrom = '2027-09-01';
    component.editValidTo = '2026-09-01';
    component.saveLicenseEdit(license);

    // A backend elutasította -> a form NEM zárult be, és az admin begépelt értékei
    // megmaradtak, hogy csak a hibás mezőt kelljen javítania.
    expect(component.editingLicenseId).toBe(42);
    expect(component.editCapacity).toBe(50);
    expect(component.editValidFrom).toBe('2027-09-01');
    expect(component.editValidTo).toBe('2026-09-01');
  });

  // UI-TT-200: a kapacitás-csökkentéses update() válasza is hordozhatja a
  // `skippedDueToActiveSessionCount`-ot (BE-ADMINUPDATE-CAPACITYREDUCTION-SILENT-SKIP) - a
  // sikeres mentés utáni toast korrigálja, ha nem minden hely szabadult fel ténylegesen.
  it('saveLicenseEdit() sikeres válasz után toast-figyelmeztetést mutat, ha vizsgázó diák miatt hely maradt bent', () => {
    configure();
    licenseStoreMock.update.mockImplementation(
      (id: number, _req: unknown, onSuccess?: (license: InstitutionalLicenseDto) => void) => {
        onSuccess?.(makeLicense({ id, capacity: 5, skippedDueToActiveSessionCount: 2 }));
      },
    );
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    const license = makeLicense({ id: 42 });
    component.startEditLicense(license);
    component.saveLicenseEdit(license);

    expect(component.editingLicenseId).toBeNull();
    expect(toastServiceMock.warning).toHaveBeenCalledWith(expect.stringContaining('2 hely'));
  });

  it('saveLicenseEdit() no-op, ha a licenseStore éppen loading', () => {
    configure();
    licenseStoreMock.loading.set(true);
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.saveLicenseEdit(makeLicense({ id: 42 }));

    expect(licenseStoreMock.update).not.toHaveBeenCalled();
  });

  it('cancelEditLicense() bezárja a szerkesztő formot a store hívása nélkül', () => {
    configure();
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.startEditLicense(makeLicense({ id: 42 }));
    expect(component.editingLicenseId).toBe(42);

    component.cancelEditLicense();

    expect(component.editingLicenseId).toBeNull();
    expect(licenseStoreMock.update).not.toHaveBeenCalled();
  });

  it('a "Szerkesztés" gombra kattintva megnyílik a szerkesztő form a kapacitás-mezővel', () => {
    configure([makeSchool({ id: 1 })], [makeLicense({ id: 10, schoolId: 1, capacity: 30 })]);
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();

    const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
    const editButton = buttons.find((b) => b.textContent?.trim() === 'Szerkesztés');
    editButton!.click();
    fixture.detectChanges();

    const capacityInput: HTMLInputElement = fixture.nativeElement.querySelector(
      'input[name="edit-cap-10"]',
    );
    expect(capacityInput).toBeTruthy();
    expect(fixture.componentInstance.editingLicenseId).toBe(10);
    expect(fixture.componentInstance.editCapacity).toBe(30);
  });

  // UI-TT-200: a `confirmRevoke()` dialógusa feltétel nélkül ígéri, hogy "a jelenleg
  // használt N hely azonnal felszabadul" - ez szándékosan nem igaz, ha egy diák épp
  // vizsgázik/kvízt ír (a backend `BE-LICENSEREVOKE-BULK-SILENT-FALSE-SUCCESS` fixe óta
  // ilyenkor SZÁNDÉKOSAN kihagyja a helyét). Korábban `AdminLicenseService.revoke()`
  // `Observable<void>`-ra volt tipizálva, a store `next()`-ága pedig nem fogadott
  // callback-et - ez az információ sosem jutott el az adminig. A HELYES viselkedés: a
  // sikeres visszavonás után egy toast korrigálja az ígéretet, ha a valóság eltér tőle.
  it('confirmRevoke() sikeres visszavonás után toast-figyelmeztetést mutat, ha vizsgázó diák miatt hely maradt bent', async () => {
    configure([makeSchool({ id: 1 })], [makeLicense({ id: 42, schoolId: 1, heldSeats: 5 })]);
    licenseStoreMock.revoke.mockImplementation(
      (
        _id: number,
        onSuccess?: (result: { releasedCount: number; skippedDueToActiveSessionCount: number }) => void,
      ) => {
        onSuccess?.({ releasedCount: 3, skippedDueToActiveSessionCount: 2 });
      },
    );
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    await component.confirmRevoke(makeLicense({ id: 42, schoolId: 1, heldSeats: 5 }));

    expect(licenseStoreMock.revoke).toHaveBeenCalledWith(42, expect.any(Function));
    expect(toastServiceMock.warning).toHaveBeenCalledWith(expect.stringContaining('2 hely'));
  });

  it('confirmRevoke() NEM mutat toast-ot, ha minden hely felszabadult (skippedDueToActiveSessionCount = 0)', async () => {
    configure([makeSchool({ id: 1 })], [makeLicense({ id: 42, schoolId: 1, heldSeats: 5 })]);
    const fixture = TestBed.createComponent(AdminIntezmenyekComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    // A configure() alap revoke()-mock-ja skippedDueToActiveSessionCount: 0-val hívja
    // az onSuccess-t.
    await component.confirmRevoke(makeLicense({ id: 42, schoolId: 1, heldSeats: 5 }));

    expect(toastServiceMock.warning).not.toHaveBeenCalled();
  });
});
