import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { IntezmenyOsztalyokComponent, sharePercent } from './intezmeny-osztalyok.component';
import { ReportService } from '../../services/report/report.service';
import { ResultsCsvExportService } from '../../services/export/results-csv-export.service';
import { SchoolClassOverviewDto, SchoolClassRowDto } from '../../models/report.model';

function row(overrides: Partial<SchoolClassRowDto>): SchoolClassRowDto {
  return {
    groupId: 1, name: '11.a', teacherDisplayName: 'Kiss Anna', canOpen: false,
    memberCount: 20, activeMemberCount: 15, averageScorePercent: 64,
    assignmentsGiven: 4, assignmentCompletions: 60, assignmentSlots: 80,
    readinessPercent: 58.5, readinessStudentCount: 12,
    weakestTopicName: 'Táblázatkezelés', weakestTopicSuccessRate: 38.2,
    ...overrides,
  };
}

function overview(days: 14 | 30, groups: SchoolClassRowDto[]): SchoolClassOverviewDto {
  return {
    periodDays: days, periodFrom: '2026-09-23T00:00:00Z', groups,
    kpi: { studentCount: 40, activeStudentCount: 30, averageScorePercent: 61, seatsUsed: 35, seatsTotal: 50, assignmentsThisMonth: 9 },
  };
}

describe('IntezmenyOsztalyokComponent (igazgatói osztály-összesítő)', () => {
  let service: { getSchoolClassOverview: ReturnType<typeof vi.fn> };
  let csv: { exportSchoolClassOverview: ReturnType<typeof vi.fn> };

  function create(groups = [row({ groupId: 1, name: '11.a', canOpen: true }), row({ groupId: 2, name: '12.b', teacherDisplayName: 'Nagy Béla' })]) {
    service = { getSchoolClassOverview: vi.fn((_: number, days: 14 | 30) => of(overview(days, groups))) };
    csv = { exportSchoolClassOverview: vi.fn() };
    TestBed.configureTestingModule({
      imports: [IntezmenyOsztalyokComponent],
      providers: [
        provideRouter([]),
        { provide: ReportService, useValue: service },
        { provide: ResultsCsvExportService, useValue: csv },
      ],
    });
    const fixture = TestBed.createComponent(IntezmenyOsztalyokComponent);
    fixture.componentRef.setInput('schoolId', 7);
    fixture.componentRef.setInput('schoolName', 'Teszt Gimnázium');
    fixture.detectChanges();
    return fixture;
  }

  it('betöltéskor 30 napra kéri az összesítőt, és kirajzolja a KPI-sávot', () => {
    const fixture = create();
    const el = fixture.nativeElement as HTMLElement;

    expect(service.getSchoolClassOverview).toHaveBeenCalledWith(7, 30);
    expect(el.querySelector('[data-testid="kpi-active"]')!.textContent).toContain('75%');
    expect(el.querySelector('[data-testid="kpi-active"]')!.textContent).toContain('30 / 40');
    expect(el.querySelector('[data-testid="kpi-average"]')!.textContent).toContain('61%');
    expect(el.querySelector('[data-testid="kpi-seats"]')!.textContent).toContain('35');
    expect(el.querySelector('[data-testid="kpi-seats"]')!.textContent).toContain('/ 50');
    expect(el.querySelector('[data-testid="kpi-assignments"]')!.textContent).toContain('9');
  });

  it('a sor mutatja az aktív arányt, a kiadás-teljesítést, a felkészültséget és a leggyengébb témát', () => {
    const fixture = create();
    const text = (fixture.nativeElement.querySelector('[data-testid="class-row-2"]') as HTMLElement).textContent!;
    expect(text).toContain('12.b');
    expect(text).toContain('Nagy Béla');
    expect(text).toContain('(75%)');
    expect(text).toContain('75% kész');
    expect(text).toContain('58.5%');
    expect(text).toContain('Táblázatkezelés');
  });

  it('időszak-váltáskor 14 napra újratölt', () => {
    const fixture = create();
    const buttons = [...fixture.nativeElement.querySelectorAll('[role="group"] button')] as HTMLButtonElement[];
    buttons[0].click();
    fixture.detectChanges();

    expect(service.getSchoolClassOverview).toHaveBeenLastCalledWith(7, 14);
    expect(buttons[0].getAttribute('aria-pressed')).toBe('true');
  });

  it('saját csoport a csoportoldalra linkel, idegen csoport helyben kinyíló, csak olvasható összefoglalót ad', () => {
    const fixture = create();
    const el = fixture.nativeElement as HTMLElement;

    const ownLink = el.querySelector('[data-testid="class-row-1"] a') as HTMLAnchorElement;
    expect(ownLink.getAttribute('href')).toBe('/csoportok/1');

    expect(el.querySelector('[data-testid="class-row-2"] a')).toBeNull();
    expect(el.querySelector('[data-testid="class-summary-2"]')).toBeNull();
    (el.querySelector('[data-testid="class-row-2"] button') as HTMLButtonElement).click();
    fixture.detectChanges();

    const summary = el.querySelector('[data-testid="class-summary-2"]') as HTMLElement;
    expect(summary.textContent).toContain('60 / 80 kész');
    expect(summary.textContent).toContain('Csak olvasható');
  });

  it('a rendezés a fejlécre kattintva átrendezi a sorokat', () => {
    const fixture = create([
      row({ groupId: 1, name: 'A', averageScorePercent: 40 }),
      row({ groupId: 2, name: 'B', averageScorePercent: 90 }),
    ]);
    fixture.componentInstance.sort.set({ key: 'avg', dir: 'desc' });
    fixture.detectChanges();
    const rows = [...fixture.nativeElement.querySelectorAll('tbody tr')] as HTMLElement[];
    expect(rows[0].getAttribute('data-testid')).toBe('class-row-2');
  });

  it('CSV-export az aktuális összesítővel és az intézmény nevével', () => {
    const fixture = create();
    (fixture.nativeElement.querySelector('[data-testid="class-overview-csv"]') as HTMLButtonElement).click();
    expect(csv.exportSchoolClassOverview).toHaveBeenCalledWith(expect.objectContaining({ periodDays: 30 }), 'Teszt Gimnázium');
  });

  it('403 esetén a backend üzenetét mutatja', () => {
    TestBed.configureTestingModule({
      imports: [IntezmenyOsztalyokComponent],
      providers: [
        provideRouter([]),
        {
          provide: ReportService,
          useValue: {
            getSchoolClassOverview: () => throwError(() => new HttpErrorResponse({
              status: 403, error: { errorMessage: 'Ehhez a riporthoz intézmény-admin (igazgató) szerep kell.' },
            })),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(IntezmenyOsztalyokComponent);
    fixture.componentRef.setInput('schoolId', 7);
    fixture.componentRef.setInput('schoolName', 'X');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('intézmény-admin (igazgató) szerep kell');
  });

  it('elavult (régebbi időszakra szóló) válasz nem írja felül az újat', () => {
    const slow = new Subject<SchoolClassOverviewDto>();
    TestBed.configureTestingModule({
      imports: [IntezmenyOsztalyokComponent],
      providers: [
        provideRouter([]),
        {
          provide: ReportService,
          useValue: {
            getSchoolClassOverview: vi.fn((_: number, days: number) => (days === 30 ? slow : of(overview(14, [row({ name: 'friss' })])))),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(IntezmenyOsztalyokComponent);
    fixture.componentRef.setInput('schoolId', 7);
    fixture.componentRef.setInput('schoolName', 'X');
    fixture.detectChanges();
    fixture.componentInstance.setDays(14);
    fixture.detectChanges();
    slow.next(overview(30, [row({ name: 'elavult' })]));
    fixture.detectChanges();

    expect(fixture.componentInstance.overview()!.periodDays).toBe(14);
  });

  it('sharePercent: üres nevezőnél null, egyébként lefelé kerekít', () => {
    expect(sharePercent(1, 0)).toBeNull();
    expect(sharePercent(2, 3)).toBe(66);
  });
});
