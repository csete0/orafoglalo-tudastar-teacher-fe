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
});
