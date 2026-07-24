import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { CsoportReszletekComponent } from './csoport-reszletek.component';
import { GroupStore } from '../../services/group/group.store';
import { SchoolStore } from '../../services/school/school.store';
import { ReportStore } from '../../services/report/report.store';
import { LeaderboardStore } from '../../services/leaderboard/leaderboard.store';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { GroupDto } from '../../models/group.model';
import { SchoolDto } from '../../models/school.model';

function makeGroup(overrides: Partial<GroupDto> = {}): GroupDto {
  return {
    id: 1,
    name: 'Teszt Csoport',
    inviteCode: 'ABCD1234',
    isJoinEnabled: true,
    isArchived: false,
    memberCount: 0,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('CsoportReszletekComponent', () => {
  let groupStoreMock: {
    selectedGroup: ReturnType<typeof signal<GroupDto | null>>;
    groups: ReturnType<typeof signal<GroupDto[]>>;
    members: ReturnType<typeof signal<unknown[]>>;
    loading: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    loadMine: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    loadMembers: ReturnType<typeof vi.fn>;
    removeMember: ReturnType<typeof vi.fn>;
    archive: ReturnType<typeof vi.fn>;
    unarchive: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    regenerateInvite: ReturnType<typeof vi.fn>;
    setJoinEnabled: ReturnType<typeof vi.fn>;
    clearError: ReturnType<typeof vi.fn>;
  };
  let reportStoreMock: {
    groupActivity: ReturnType<typeof signal<unknown[]>>;
    error: ReturnType<typeof signal<string | null>>;
    loadGroupActivity: ReturnType<typeof vi.fn>;
  };
  let leaderboardStoreMock: {
    leaderboard: ReturnType<typeof signal<unknown | null>>;
    error: ReturnType<typeof signal<string | null>>;
    loadGroupLeaderboard: ReturnType<typeof vi.fn>;
  };
  let schoolStoreMock: {
    schools: ReturnType<typeof signal<SchoolDto[]>>;
    error: ReturnType<typeof signal<string | null>>;
    loadMine: ReturnType<typeof vi.fn>;
  };
  let confirmServiceMock: { ask: ReturnType<typeof vi.fn> };

  function configure(group: GroupDto, schools: SchoolDto[] = []) {
    groupStoreMock = {
      selectedGroup: signal(group),
      groups: signal([group]),
      members: signal([]),
      loading: signal(false),
      error: signal(null),
      loadMine: vi.fn(),
      select: vi.fn(),
      loadMembers: vi.fn(),
      removeMember: vi.fn(),
      archive: vi.fn(),
      unarchive: vi.fn(),
      update: vi.fn(),
      regenerateInvite: vi.fn(),
      setJoinEnabled: vi.fn(),
      clearError: vi.fn(),
    };
    reportStoreMock = {
      groupActivity: signal([]),
      error: signal(null),
      loadGroupActivity: vi.fn(),
    };
    leaderboardStoreMock = {
      leaderboard: signal(null),
      error: signal(null),
      loadGroupLeaderboard: vi.fn(),
    };
    schoolStoreMock = {
      schools: signal(schools),
      error: signal(null),
      loadMine: vi.fn(),
    };

    confirmServiceMock = { ask: vi.fn().mockResolvedValue(true) };

    TestBed.configureTestingModule({
      imports: [CsoportReszletekComponent],
      providers: [
        provideRouter([]),
        { provide: GroupStore, useValue: groupStoreMock },
        { provide: SchoolStore, useValue: schoolStoreMock },
        { provide: ReportStore, useValue: reportStoreMock },
        { provide: LeaderboardStore, useValue: leaderboardStoreMock },
        { provide: ConfirmService, useValue: confirmServiceMock },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '1' } } } },
      ],
    });
  }

  // BUG UI-TT-18: az "Eredmények" fül a ReportStore.error()-t rejtette el a "Nincs adat." mögé.
  it('az Eredmények fülön megjelenik a ReportStore valódi hibája "Nincs adat" helyett', () => {
    configure(makeGroup());
    reportStoreMock.error.set('A csoport-aktivitás betöltése sikertelen.');

    const fixture = TestBed.createComponent(CsoportReszletekComponent);
    fixture.detectChanges();
    fixture.componentInstance.setTab('eredmenyek');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('A csoport-aktivitás betöltése sikertelen.');
    expect(fixture.nativeElement.textContent).not.toContain('Nincs adat.');
  });

  // UI-TT-54: az Eredmények táblázat wrapperje overflow-hidden mellett overflow-x-auto-t is kapott.
  it('az Eredmények táblázat wrapperje overflow-x-auto-t is tartalmaz', () => {
    configure(makeGroup());

    const fixture = TestBed.createComponent(CsoportReszletekComponent);
    fixture.detectChanges();
    fixture.componentInstance.setTab('eredmenyek');
    fixture.detectChanges();

    const table: HTMLElement = fixture.nativeElement.querySelector('table');
    expect(table.closest('.overflow-x-auto')).not.toBeNull();
  });

  // BUG UI-TT-4: az intézmény-<select> a törölt (Mégse-vel elutasított) intézményen maradt,
  // mert a [ngModel] bemenete (group.schoolId) Mégse esetén sosem változott.
  it('BUG UI-TT-4 javítva: Mégse után a displaySchoolId visszaáll az eredeti értékre', async () => {
    const school = { id: 5, name: 'Teszt Gimnázium', slug: 'teszt-gimnazium', createdAt: new Date().toISOString(), groupCount: 1, myRole: 'Teacher' as const, teacherCount: 3 };
    configure(makeGroup({ schoolId: undefined }), [school]);
    confirmServiceMock.ask.mockResolvedValue(false);

    const fixture = TestBed.createComponent(CsoportReszletekComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.displaySchoolId()).toBeNull();

    await fixture.componentInstance.changeSchool(1, 'Teszt Csoport', school.id);

    expect(confirmServiceMock.ask).toHaveBeenCalled();
    expect(groupStoreMock.update).not.toHaveBeenCalled();
    expect(fixture.componentInstance.displaySchoolId()).toBeNull();
  });

  it('elfogadott megerősítés esetén a displaySchoolId az új értéken marad és store.update() meghívódik', async () => {
    const school = { id: 5, name: 'Teszt Gimnázium', slug: 'teszt-gimnazium', createdAt: new Date().toISOString(), groupCount: 1, myRole: 'Teacher' as const, teacherCount: 3 };
    configure(makeGroup({ schoolId: undefined }), [school]);

    const fixture = TestBed.createComponent(CsoportReszletekComponent);
    fixture.detectChanges();

    await fixture.componentInstance.changeSchool(1, 'Teszt Csoport', school.id);

    expect(groupStoreMock.update).toHaveBeenCalledWith(
      1,
      { name: 'Teszt Csoport', schoolId: school.id },
      expect.any(Function),
      expect.any(Function),
    );
    expect(fixture.componentInstance.displaySchoolId()).toBe(school.id);
  });

  // BUG UI-TT-73: a UI-TT-4 fix (displaySchoolId + effect()) sikeres mentésnél helyes, DE
  // store.update() hiba-ága korábban csak _error()-t állított be, a displaySchoolId-t nem
  // érintette - a hibás, el nem mentett választáson maradt a <select>, a hibaüzenet mellett.
  it('BUG UI-TT-73 javítva: store.update() sikertelensége esetén a displaySchoolId visszaáll az eredeti (mentett) értékre', async () => {
    const school = { id: 5, name: 'Teszt Gimnázium', slug: 'teszt-gimnazium', createdAt: new Date().toISOString(), groupCount: 1, myRole: 'Teacher' as const, teacherCount: 3 };
    configure(makeGroup({ schoolId: undefined }), [school]);
    groupStoreMock.update.mockImplementation((_id, _req, _onSuccess, onError) => {
      groupStoreMock.error.set('A csoport frissítése sikertelen.');
      onError?.('A csoport frissítése sikertelen.');
    });

    const fixture = TestBed.createComponent(CsoportReszletekComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.displaySchoolId()).toBeNull();

    await fixture.componentInstance.changeSchool(1, 'Teszt Csoport', school.id);

    // A store.update() hívás lezajlott, de a szerver hibát adott - a select-nek
    // vissza kell állnia az eredeti (null), ténylegesen mentett állapotra.
    expect(fixture.componentInstance.displaySchoolId()).toBeNull();
  });

  // UI-TT-34: az archiválásnak eddig nem volt ellentétes irányú UI-eleme sem -
  // egy archivált csoport oldalán kizárólag egy tehetetlen "Archivált" badge
  // maradt, semmilyen gomb nem tudta visszaállítani.
  it('UI-TT-34 javítva: archivált csoportnál "Visszaállítás" gomb jelenik meg "Archiválás" helyett, és a store.unarchive()-ot hívja', () => {
    configure(makeGroup({ isArchived: true }));

    const fixture = TestBed.createComponent(CsoportReszletekComponent);
    fixture.detectChanges();

    const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
    const restoreButton = buttons.find((b) => b.textContent?.includes('Visszaállítás'));
    expect(restoreButton).toBeTruthy();
    expect(buttons.some((b) => b.textContent?.includes('Archiválás'))).toBe(false);

    restoreButton!.click();

    expect(groupStoreMock.unarchive).toHaveBeenCalledWith(1, expect.any(Function));
  });

  // UI-TT-67: a store.error() (GroupStore) egy KÖZÖS, minden fülön látszó
  // blokkban jelenik meg - setTab() korábban nem hívta a clearError()-t, ezért
  // egy korábbi fülről (pl. "Tagok") maradt hibaüzenet félrevezető kontextusban
  // (pl. az "Eredmények" fülön) ottmaradt volna.
  it('BUG UI-TT-67 javítva: setTab() törli a GroupStore korábbi hibáját', () => {
    configure(makeGroup());

    const fixture = TestBed.createComponent(CsoportReszletekComponent);
    fixture.detectChanges();

    fixture.componentInstance.setTab('eredmenyek');

    expect(groupStoreMock.clearError).toHaveBeenCalled();
  });

  // UI-TT-111: a SchoolStore.loadMine()-t (ngOnInit) sikertelenség esetén a komponens
  // SEHOL nem jelzi - a `schoolStore.error()`-t sem a sablon, sem a TS SOSEM olvassa
  // (grep -n "schoolStore.error" csoport-reszletek.component.ts -> 0 találat). Egy
  // sikertelen betöltés a schools()-t örökre üresen hagyja, ami a sablon `@if
  // (schoolStore.schools().length > 0)` ága miatt az EGÉSZ intézmény-hozzárendelő
  // <select>-et eltünteti - a tanár egyetlen visszajelzést sem kap arról, hogy a
  // funkció (a csoport intézményhez kötése) miért nem elérhető, és nem tudja
  // megkülönböztetni ezt attól az esettől, amikor ő ténylegesen nem tagja semmilyen
  // intézménynek.
  it('BUG UI-TT-111: ha a schoolStore.loadMine() hibázik, az intézmény-hozzárendelő UI csendben eltűnik, semmilyen hibaüzenet nem jelzi a sikertelen betöltést', () => {
    configure(makeGroup({ schoolId: undefined }), []);
    schoolStoreMock.error.set('Az intézmények betöltése sikertelen.');

    const fixture = TestBed.createComponent(CsoportReszletekComponent);
    fixture.detectChanges();

    // Elvárás: a felhasználó lássa, hogy az intézmény-lista betöltése sikertelen volt.
    expect(fixture.nativeElement.textContent).toContain('Az intézmények betöltése sikertelen.');
  });

  it('nem archivált csoportnál "Archiválás" gomb jelenik meg, "Visszaállítás" nem', () => {
    configure(makeGroup({ isArchived: false }));

    const fixture = TestBed.createComponent(CsoportReszletekComponent);
    fixture.detectChanges();

    const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
    expect(buttons.some((b) => b.textContent?.includes('Archiválás'))).toBe(true);
    expect(buttons.some((b) => b.textContent?.includes('Visszaállítás'))).toBe(false);
  });
});
