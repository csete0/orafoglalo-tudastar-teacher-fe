import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { IntezmenyReszletekComponent } from './intezmeny-reszletek.component';
import { SchoolStore } from '../../services/school/school.store';
import { ReportStore } from '../../services/report/report.store';
import { LeaderboardStore } from '../../services/leaderboard/leaderboard.store';
import { SchoolDto } from '../../models/school.model';

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
  };

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
    };

    TestBed.configureTestingModule({
      imports: [IntezmenyReszletekComponent],
      providers: [
        provideRouter([]),
        { provide: SchoolStore, useValue: schoolStoreMock },
        {
          provide: ReportStore,
          useValue: { schoolActivity: signal([]), loadSchoolActivity: vi.fn() },
        },
        {
          provide: LeaderboardStore,
          useValue: { leaderboard: signal(null), loadSchoolLeaderboard: vi.fn() },
        },
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
});
