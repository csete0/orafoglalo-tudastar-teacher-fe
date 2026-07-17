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
    update: ReturnType<typeof vi.fn>;
    regenerateInvite: ReturnType<typeof vi.fn>;
    setJoinEnabled: ReturnType<typeof vi.fn>;
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
      update: vi.fn(),
      regenerateInvite: vi.fn(),
      setJoinEnabled: vi.fn(),
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

    confirmServiceMock = { ask: vi.fn().mockResolvedValue(true) };

    TestBed.configureTestingModule({
      imports: [CsoportReszletekComponent],
      providers: [
        provideRouter([]),
        { provide: GroupStore, useValue: groupStoreMock },
        { provide: SchoolStore, useValue: { schools: signal(schools), loadMine: vi.fn() } },
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

    expect(groupStoreMock.update).toHaveBeenCalledWith(1, { name: 'Teszt Csoport', schoolId: school.id }, expect.any(Function));
    expect(fixture.componentInstance.displaySchoolId()).toBe(school.id);
  });
});
