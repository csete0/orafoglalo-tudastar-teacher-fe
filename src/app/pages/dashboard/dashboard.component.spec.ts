import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { AuthStore } from '../../services/auth/store/auth.store';
import { KahootHostService } from '../../services/kahoot-host/kahoot-host.service';
import { KahootActiveRoomDto } from '../../models/kahoot-host.model';
import { ReportService } from '../../services/report/report.service';
import { TeacherDashboardDto, TeacherWeakTopicDto } from '../../models/report.model';

/**
 * UX-audit: korábban egy éppen élő (vagy beragadt) Kahoot-szoba KIZÁRÓLAG abból a
 * kvíz-szerkesztőből volt felfedezhető, amelyikhez tartozott - a vezérlőpult "Élő
 * játék fut" kártyája ezt oldja fel, minden saját kvíz szobáját egy helyen mutatva.
 */
describe('DashboardComponent - "Élő játék fut" kártya', () => {
  let authStoreMock: {
    currentUser: ReturnType<typeof signal<{ firstName: string } | null>>;
    hasAdminRole: ReturnType<typeof signal<boolean>>;
  };
  let kahootHostServiceMock: { getActiveRooms: ReturnType<typeof vi.fn> };

  function configure(rooms: KahootActiveRoomDto[] | 'error', isAdmin = false, dashboard?: Partial<TeacherDashboardDto>) {
    authStoreMock = { currentUser: signal({ firstName: 'Anna' }), hasAdminRole: signal(isAdmin) };
    kahootHostServiceMock = {
      getActiveRooms: vi.fn().mockReturnValue(
        rooms === 'error' ? throwError(() => new Error('network')) : of(rooms),
      ),
    };
    const reportServiceMock = {
      getDashboard: vi.fn().mockReturnValue(of({
        recentQuizResults: [],
        upcomingDeadlines: [],
        weakTopics: [],
        ...dashboard,
      } as TeacherDashboardDto)),
    };

    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: authStoreMock },
        { provide: KahootHostService, useValue: kahootHostServiceMock },
        { provide: ReportService, useValue: reportServiceMock },
      ],
    });

    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('nincs élő szoba esetén nem jelenik meg a kártya', () => {
    const fixture = configure([]);
    expect(fixture.nativeElement.textContent).not.toContain('Élő játék fut');
  });

  it('élő szobánál megjelenik a kártya a kvíz+csoport adataival és a host-nézetbe mutató linkkel', () => {
    const fixture = configure([
      {
        kahootSessionId: 42,
        quizId: 7,
        quizTitle: 'Hálózatok dolgozat',
        groupName: '10.b',
        status: 'question',
        participantCount: 18,
      },
    ]);

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Élő játék fut');
    expect(text).toContain('Hálózatok dolgozat');
    expect(text).toContain('10.b');
    expect(text).toContain('18');

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a[href*="/elo/42"]');
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('/feladatsorok/kvizek/7/elo/42');
  });

  it('több élő szobánál mindegyik megjelenik', () => {
    const fixture = configure([
      { kahootSessionId: 1, quizId: 1, quizTitle: 'A', groupName: '9.a', status: 'lobby', participantCount: 0 },
      { kahootSessionId: 2, quizId: 2, quizTitle: 'B', groupName: '9.b', status: 'question', participantCount: 5 },
    ]);

    const links = fixture.nativeElement.querySelectorAll('a[href*="/elo/"]');
    expect(links.length).toBe(2);
  });

  it('hálózati hiba esetén csendben üresen marad, nem dönti el a vezérlőpult többi részét', () => {
    const fixture = configure('error');

    expect(fixture.componentInstance.activeRooms()).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('Feladatsoraim');
  });

  // C5: a platform-kvízek admin-oldala a 6-linkes nav-korlát miatt nem menüpont, hanem
  // vezérlőpult-kártya - és csak platform-adminnak.
  it('C5: a Platform-kvízek kártya csak platform-adminnak jelenik meg', () => {
    const teacher = configure([]);
    expect(teacher.nativeElement.querySelector('a[href="/admin/kvizek"]')).toBeNull();
    expect(teacher.nativeElement.textContent).toContain('Kvízeim');
    TestBed.resetTestingModule();

    const admin = configure([], true);
    const card = admin.nativeElement.querySelector('a[href="/admin/kvizek"]');
    expect(card).not.toBeNull();
    expect(card.textContent).toContain('Platform-kvízek');
    expect(admin.nativeElement.textContent).toContain('Kvízeim');
  });
});

describe('DashboardComponent - A2: csoportjaid gyenge témái', () => {
  function makeWeakTopic(overrides: Partial<TeacherWeakTopicDto> = {}): TeacherWeakTopicDto {
    return {
      topicId: 1, topicName: 'Hálózatok', topicColor: '#FF4444', topicIcon: null,
      studentCount: 5, totalAnswered: 50, totalCorrect: 15, successRate: 30,
      ...overrides,
    };
  }

  function configure(weakTopics: TeacherWeakTopicDto[]) {
    const authStoreMock = { currentUser: signal({ firstName: 'Tanár' }), hasAdminRole: signal(false) };
    const kahootMock = { getActiveRooms: vi.fn().mockReturnValue(of([])) };
    const reportMock = {
      getDashboard: vi.fn().mockReturnValue(of({
        recentQuizResults: [], upcomingDeadlines: [], weakTopics,
      } as TeacherDashboardDto)),
    };
    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        { provide: AuthStore, useValue: authStoreMock },
        { provide: KahootHostService, useValue: kahootMock },
        { provide: ReportService, useValue: reportMock },
      ],
    });
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('két gyenge téma esetén mindkét chip megjelenik a kártya fejléccel', () => {
    const fixture = configure([
      makeWeakTopic({ topicId: 1, topicName: 'Hálózatok', successRate: 30 }),
      makeWeakTopic({ topicId: 2, topicName: 'Algoritmusok', successRate: 25 }),
    ]);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Csoportjaid gyenge témái');
    expect(text).toContain('Hálózatok');
    expect(text).toContain('Algoritmusok');
  });

  it('üres lista esetén a gyenge témák kártya nem jelenik meg', () => {
    const fixture = configure([]);
    expect(fixture.nativeElement.textContent).not.toContain('Csoportjaid gyenge témái');
  });
});
