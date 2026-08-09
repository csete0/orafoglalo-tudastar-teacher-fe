import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { IntezmenyReszletekComponent } from './intezmeny-reszletek.component';
import { SchoolStore } from '../../services/school/school.store';
import { ReportStore } from '../../services/report/report.store';
import { LeaderboardStore } from '../../services/leaderboard/leaderboard.store';
import { SchoolDto } from '../../models/school.model';
import { ConfirmService } from '../../shared/confirm/confirm.service';

function makeSchool(overrides: Partial<SchoolDto> = {}): SchoolDto {
  return {
    id: 1,
    name: 'Teszt Iskola',
    slug: 'teszt-iskola',
    createdAt: new Date().toISOString(),
    groupCount: 0,
    myRole: 'Teacher',
    teacherCount: 2,
    ...overrides,
  };
}

describe('IntezmenyReszletekComponent — szerep-függő fülek', () => {
  let schoolStoreMock: {
    selectedSchool: ReturnType<typeof signal<SchoolDto | null>>;
    isSelectedAdmin: ReturnType<typeof signal<boolean>>;
    schools: ReturnType<typeof signal<SchoolDto[]>>;
    members: ReturnType<typeof signal<unknown[]>>;
    schoolGroups: ReturnType<typeof signal<unknown[]>>;
    loading: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    loadMine: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    loadMembers: ReturnType<typeof vi.fn>;
    loadSchoolGroups: ReturnType<typeof vi.fn>;
    changeMemberRole: ReturnType<typeof vi.fn>;
    removeMember: ReturnType<typeof vi.fn>;
    clearError: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let reportStoreMock: {
    schoolActivity: ReturnType<typeof signal<unknown[]>>;
    error: ReturnType<typeof signal<string | null>>;
    loadSchoolActivity: ReturnType<typeof vi.fn>;
  };
  let leaderboardStoreMock: {
    leaderboard: ReturnType<typeof signal<unknown | null>>;
    error: ReturnType<typeof signal<string | null>>;
    loadSchoolLeaderboard: ReturnType<typeof vi.fn>;
  };
  let confirmServiceMock: { ask: ReturnType<typeof vi.fn> };

  function configure(school: SchoolDto, isAdmin: boolean) {
    schoolStoreMock = {
      selectedSchool: signal(school),
      isSelectedAdmin: signal(isAdmin),
      schools: signal([school]),
      members: signal([]),
      schoolGroups: signal([]),
      loading: signal(false),
      error: signal(null),
      loadMine: vi.fn(),
      select: vi.fn(),
      loadMembers: vi.fn(),
      loadSchoolGroups: vi.fn(),
      changeMemberRole: vi.fn(),
      removeMember: vi.fn(),
      clearError: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    };
    reportStoreMock = {
      schoolActivity: signal([]),
      error: signal(null),
      loadSchoolActivity: vi.fn(),
    };
    leaderboardStoreMock = {
      leaderboard: signal(null),
      error: signal(null),
      loadSchoolLeaderboard: vi.fn(),
    };
    confirmServiceMock = { ask: vi.fn().mockResolvedValue(true) };

    TestBed.configureTestingModule({
      imports: [IntezmenyReszletekComponent],
      providers: [
        provideRouter([]),
        { provide: SchoolStore, useValue: schoolStoreMock },
        { provide: ReportStore, useValue: reportStoreMock },
        { provide: LeaderboardStore, useValue: leaderboardStoreMock },
        { provide: ConfirmService, useValue: confirmServiceMock },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '1' } } } },
      ],
    });
  }

  it('igazgatónak (myRole=Admin) megjelenik az Áttekintés és Csoportok fül', () => {
    configure(makeSchool({ myRole: 'Admin', teacherInviteCode: 'ABCD1234' }), true);

    const fixture = TestBed.createComponent(IntezmenyReszletekComponent);
    fixture.detectChanges();

    const nav = fixture.nativeElement.querySelector('nav').textContent;
    expect(nav).toContain('Áttekintés');
    expect(nav).toContain('Csoportok');
  });

  it('sima tagnak (myRole=Teacher) NEM jelenik meg az Áttekintés és Csoportok fül', () => {
    configure(makeSchool({ myRole: 'Teacher' }), false);

    const fixture = TestBed.createComponent(IntezmenyReszletekComponent);
    fixture.detectChanges();

    const nav = fixture.nativeElement.querySelector('nav').textContent;
    expect(nav).not.toContain('Áttekintés');
    expect(nav).not.toContain('Csoportok');
    // A közös fülek (Tanárok/Ranglista) mindkét szerepnél megvannak
    expect(nav).toContain('Tanárok');
    expect(nav).toContain('Ranglista');
  });

  it('csak admin esetén jelenik meg a tanári meghívó kód', () => {
    configure(makeSchool({ myRole: 'Admin', teacherInviteCode: 'CODE1234' }), true);

    const fixture = TestBed.createComponent(IntezmenyReszletekComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('CODE1234');
  });

  it('sima tagnál nincs meghívó kód (a szerver sem küldi), a UI nem jelenít meg semmit', () => {
    configure(makeSchool({ myRole: 'Teacher', teacherInviteCode: undefined }), false);

    const fixture = TestBed.createComponent(IntezmenyReszletekComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('meghívó kód');
  });

  // BUG UI-TT-19: a "Ranglista" fül a LeaderboardStore.error()-t rejtette el a "Még nincs ranglista-adat." mögé.
  it('a Ranglista fülön megjelenik a LeaderboardStore valódi hibája "Nincs adat" helyett', () => {
    configure(makeSchool({ myRole: 'Teacher' }), false);
    leaderboardStoreMock.error.set('A ranglista betöltése sikertelen.');

    const fixture = TestBed.createComponent(IntezmenyReszletekComponent);
    fixture.detectChanges();
    fixture.componentInstance.setTab('ranglista');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('A ranglista betöltése sikertelen.');
    expect(fixture.nativeElement.textContent).not.toContain('Még nincs ranglista-adat.');
  });

  // BUG UI-TT-19: az "Áttekintés" fül a ReportStore.error()-t rejtette el a "Nincs adat." mögé.
  it('az Áttekintés fülön megjelenik a ReportStore valódi hibája "Nincs adat" helyett', () => {
    configure(makeSchool({ myRole: 'Admin' }), true);
    reportStoreMock.error.set('Ehhez a riporthoz intézmény-admin szerep kell.');

    const fixture = TestBed.createComponent(IntezmenyReszletekComponent);
    fixture.detectChanges();
    fixture.componentInstance.setTab('attekintes');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Ehhez a riporthoz intézmény-admin szerep kell.');
    expect(fixture.nativeElement.textContent).not.toContain('Nincs adat.');
  });

  // UI-TT-67: a schoolStore.error() egy KÖZÖS, minden fülön látszó blokkban
  // jelenik meg - setTab() korábban nem hívta a clearError()-t, ezért egy
  // korábbi fülről (pl. "Tanárok") maradt hibaüzenet félrevezető kontextusban
  // (pl. az "Áttekintés" fülön) ottmaradt volna.
  it('BUG UI-TT-67 javítva: setTab() törli a SchoolStore korábbi hibáját', () => {
    configure(makeSchool({ myRole: 'Admin' }), true);

    const fixture = TestBed.createComponent(IntezmenyReszletekComponent);
    fixture.detectChanges();

    fixture.componentInstance.setTab('attekintes');

    expect(schoolStoreMock.clearError).toHaveBeenCalled();
  });

  // BUG UI-TT-24: "Igazgatóvá tétel"/"Lefokozás" korábban megerősítés nélkül azonnal hívta a mutációt.
  it('toggleRole() a ConfirmService.ask()-ot hívja meg, mielőtt changeMemberRole()-t hívna', async () => {
    configure(makeSchool({ myRole: 'Admin' }), true);

    const fixture = TestBed.createComponent(IntezmenyReszletekComponent);
    fixture.detectChanges();

    await fixture.componentInstance.toggleRole(1, 42, 'Teacher', 'Kolléga Tanár');

    expect(confirmServiceMock.ask).toHaveBeenCalled();
    expect(schoolStoreMock.changeMemberRole).toHaveBeenCalledWith(1, 42, { role: 'Admin' }, expect.any(Function));
  });

  it('toggleRole() elutasított megerősítés esetén NEM hívja meg changeMemberRole()-t', async () => {
    configure(makeSchool({ myRole: 'Admin' }), true);
    confirmServiceMock.ask.mockResolvedValue(false);

    const fixture = TestBed.createComponent(IntezmenyReszletekComponent);
    fixture.detectChanges();

    await fixture.componentInstance.toggleRole(1, 42, 'Admin', 'Kolléga Igazgató');

    expect(confirmServiceMock.ask).toHaveBeenCalled();
    expect(schoolStoreMock.changeMemberRole).not.toHaveBeenCalled();
  });

  // UI-TT-35 (mis-triage correction): a 2026-07-17-i triázs kizárólag a backend-oldali
  // értesítés-küldést ellenőrizte (SchoolService.DeleteAsync mostantól korrektül értesíti
  // a többi aktív tanár-tagot) - az EREDETI lelet FE-fele (a megerősítő dialógus nem
  // nevezi meg, hogy más aktív tanárok is elveszítik a tagságukat) VÁLTOZATLANUL nyitva
  // maradt. Az elvárt viselkedés a szomszédos leave() mintáját követi (ami explicit
  // megnevezi a csoport-elvesztés következményét).
  it('deleteSchool() a megerősítő dialógusban megemlítené a többi aktív tanár tagságának elvesztését, ha van másik tag', async () => {
    configure(makeSchool({ myRole: 'Admin', groupCount: 0, teacherCount: 2 }), true);

    const fixture = TestBed.createComponent(IntezmenyReszletekComponent);
    fixture.detectChanges();

    await fixture.componentInstance.deleteSchool(1, 0);

    expect(confirmServiceMock.ask).toHaveBeenCalled();
    const askArg = confirmServiceMock.ask.mock.calls[0][0];
    expect(askArg.message).toMatch(/más|kolléga|tanár.*tagság|tagság.*elveszít/i);
  });

  // UI-TT-146: a backend a Name mezőt [MaxLength(255)]-tel korlátozza; az "Intézmény
  // szerkesztése" (rename) mező korábban csak egy üres-ellenőrzést kapott, hosszkorlátot
  // nem — egy 256+ karakteres név csak a beküldés után bukott, egy semmitmondó
  // "A művelet sikertelen." üzenettel.
  it('BUG UI-TT-146 javítva: 255 karakternél hosszabb átnevezés esetén a "Mentés" gomb letiltva marad, inline hibaüzenettel, saveEdit() no-op', () => {
    configure(makeSchool({ myRole: 'Admin' }), true);

    const fixture = TestBed.createComponent(IntezmenyReszletekComponent);
    fixture.detectChanges();

    // A `[(ngModel)]`-hez kötött mezőt a valós DOM `input`-eseményen keresztül állítjuk,
    // ahogy egy tényleges felhasználói gépelés is tenné - a komponens `editName` mezőjének
    // közvetlen, teszt-oldali felülírása ennél a mélyen egymásba ágyazott (`@if...as` +
    // `@switch` + `@if`) sablonszerkezetnél nem futtatja újra megbízhatóan a beágyazott
    // nézeteket egyetlen `detectChanges()`-ciklus alatt.
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input.input.flex-1');
    input.value = 'a'.repeat(256);
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(fixture.componentInstance.editName.length).toBe(256);
    const saveButton = Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Mentés'),
    ) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Az intézmény neve legfeljebb 255 karakter hosszú lehet.');

    fixture.componentInstance.saveEdit(1);
    expect(schoolStoreMock.update).not.toHaveBeenCalled();
  });

  it('pontosan 255 karakteres átnevezés esetén a "Mentés" gomb aktív, saveEdit() meghívja a store.update()-et', () => {
    configure(makeSchool({ myRole: 'Admin' }), true);

    const fixture = TestBed.createComponent(IntezmenyReszletekComponent);
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input.input.flex-1');
    input.value = 'a'.repeat(255);
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(fixture.componentInstance.editName.length).toBe(255);
    const saveButton = Array.from<HTMLButtonElement>(fixture.nativeElement.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Mentés'),
    ) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(false);

    fixture.componentInstance.saveEdit(1);
    expect(schoolStoreMock.update).toHaveBeenCalledWith(1, { name: 'a'.repeat(255) }, expect.any(Function));
  });

  // BE-INTEZMENYRESZLETEK-ADMINTAB-BODY-NOT-REGATED: a nav-gombok `isSelectedAdmin()`
  // mögé vannak zárva, de a fül-TEST (az "Áttekintés"/"Csoportok" @case ág) korábban
  // csak a `tab()` értékétől függött - ha az admin-jog megszűnik, amíg a tanár épp
  // ezen a fülön van (nincs push/poll, ami frissítené `_schools`-t), a tartalom
  // befagyva tovább jelenne meg, miközben a visszalépés gombja is eltűnt.
  it('BUG BE-INTEZMENYRESZLETEK-ADMINTAB-BODY-NOT-REGATED javítva: admin-jog elvesztésekor az Áttekintés fül tartalma eltűnik, fallback üzenet jelenik meg', () => {
    configure(makeSchool({ myRole: 'Admin' }), true);

    const fixture = TestBed.createComponent(IntezmenyReszletekComponent);
    fixture.detectChanges();
    fixture.componentInstance.setTab('attekintes');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('table')).toBeTruthy();

    // Az admin-jog megszűnik, MIALATT a tanár még ezen a fülön van (tab() változatlan).
    schoolStoreMock.isSelectedAdmin.set(false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('table')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="admin-tab-lost-access"]')).toBeTruthy();
  });

  it('BUG BE-INTEZMENYRESZLETEK-ADMINTAB-BODY-NOT-REGATED javítva: admin-jog elvesztésekor a Csoportok fül tartalma eltűnik, fallback üzenet jelenik meg', () => {
    configure(makeSchool({ myRole: 'Admin' }), true);

    const fixture = TestBed.createComponent(IntezmenyReszletekComponent);
    fixture.detectChanges();
    fixture.componentInstance.setTab('csoportok');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('ul.space-y-2')).toBeTruthy();

    schoolStoreMock.isSelectedAdmin.set(false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="admin-tab-lost-access"]')).toBeTruthy();
  });

  // UI-TT-175: a "Csoportok" fülön az `isArchived` mező eddig sehol nem volt kiolvasva a
  // template-ben, szemben a tanár saját csoport-nézeteivel (`csoportok-lista.component.ts`,
  // `csoport-reszletek.component.ts`), amik jól látható "Archivált" jelvényt mutatnak rá -
  // egy archivált csoport itt megkülönböztethetetlen volt egy élő csoporttól.
  it('BUG UI-TT-175 javítva: az archivált csoport a Csoportok fülön "Archivált" jelvényt kap, a nem-archivált nem', () => {
    configure(makeSchool({ myRole: 'Admin' }), true);
    schoolStoreMock.schoolGroups.set([
      { groupId: 1, name: 'Élő csoport', teacherDisplayName: 'Teszt Tanár', memberCount: 3, isArchived: false },
      { groupId: 2, name: 'Archivált csoport', teacherDisplayName: 'Teszt Tanár', memberCount: 1, isArchived: true },
    ]);

    const fixture = TestBed.createComponent(IntezmenyReszletekComponent);
    fixture.detectChanges();
    fixture.componentInstance.setTab('csoportok');
    fixture.detectChanges();

    const items: HTMLLIElement[] = Array.from(fixture.nativeElement.querySelectorAll('ul.space-y-2 > li'));
    expect(items.length).toBe(2);
    expect(items[0].textContent).not.toContain('Archivált');
    expect(items[1].textContent).toContain('Archivált');
  });

  // UI-TT-179: valódi, tartalom-váltó tab-widget (Tanárok/Ranglista/Áttekintés/Csoportok) -
  // a wrapper nav és a gombok korábban kizárólag a "tab-btn-active" CSS class-on keresztül
  // jelezték a kijelölt fület, semmilyen ARIA tab-szemantika nem volt jelen.
  it('BUG UI-TT-179 javítva: a fül-navigáció role="tablist"/"tab" + aria-selected szemantikát visel', () => {
    configure(makeSchool({ myRole: 'Admin' }), true);
    const fixture = TestBed.createComponent(IntezmenyReszletekComponent);
    fixture.detectChanges();

    const nav = fixture.nativeElement.querySelector('nav') as HTMLElement;
    expect(nav.getAttribute('role')).toBe('tablist');

    const tabs = [...fixture.nativeElement.querySelectorAll('nav button.tab-btn')] as HTMLButtonElement[];
    expect(tabs.length).toBe(4);
    tabs.forEach((tab) => expect(tab.getAttribute('role')).toBe('tab'));

    // Alapértelmezetten a "Tanárok" fül aktív.
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs.slice(1).every((tab) => tab.getAttribute('aria-selected') === 'false')).toBe(true);

    fixture.componentInstance.setTab('csoportok');
    fixture.detectChanges();

    expect(tabs[0].getAttribute('aria-selected')).toBe('false');
    expect(tabs[3].getAttribute('aria-selected')).toBe('true');
  });
});
