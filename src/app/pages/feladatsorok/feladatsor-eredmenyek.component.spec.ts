import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { FeladatsorEredmenyekComponent } from './feladatsor-eredmenyek.component';
import { ReportStore } from '../../services/report/report.store';
import { TeacherTaskSetResultsDto } from '../../models/report.model';

function makeResults(): TeacherTaskSetResultsDto {
  return {
    taskSetId: 1,
    title: 'Teszt feladatsor',
    tasks: [
      { taskId: 1, title: 'Első feladat', maxPoints: 10, taskOrder: 1 },
      { taskId: 2, title: 'Második feladat', maxPoints: 5, taskOrder: 2 },
    ],
    students: [
      {
        userId: 1,
        name: 'Kiss Anna',
        hasSession: true,
        isCompleted: true,
        totalEarnedPoints: 12,
        totalMaxPoints: 15,
        taskResults: [
          { taskId: 1, isCompleted: true, earnedPoints: 10, maxPoints: 10 },
          { taskId: 2, isCompleted: true, earnedPoints: 2, maxPoints: 5 },
        ],
      },
      {
        userId: 2,
        name: 'Nagy Béla',
        hasSession: false,
        isCompleted: false,
        taskResults: [
          { taskId: 1, isCompleted: false },
          { taskId: 2, isCompleted: false },
        ],
      },
    ],
  };
}

describe('FeladatsorEredmenyekComponent', () => {
  let reportStoreMock: {
    taskSetResults: ReturnType<typeof signal<TeacherTaskSetResultsDto | null>>;
    loading: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    loadTaskSetResults: ReturnType<typeof vi.fn>;
  };

  function configure(results: TeacherTaskSetResultsDto | null) {
    reportStoreMock = {
      taskSetResults: signal(results),
      loading: signal(false),
      error: signal(null),
      loadTaskSetResults: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [FeladatsorEredmenyekComponent],
      providers: [
        provideRouter([]),
        { provide: ReportStore, useValue: reportStoreMock },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '1' } } } },
      ],
    });
  }

  it('betöltéskor meghívja a loadTaskSetResults-t a route id-vel', () => {
    configure(null);
    const fixture = TestBed.createComponent(FeladatsorEredmenyekComponent);
    fixture.detectChanges();

    expect(reportStoreMock.loadTaskSetResults).toHaveBeenCalledWith(1);
  });

  it('a feladat-oszlopok és diák-sorok helyesen jelennek meg', () => {
    configure(makeResults());
    const fixture = TestBed.createComponent(FeladatsorEredmenyekComponent);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Első feladat');
    expect(text).toContain('Második feladat');
    expect(text).toContain('Kiss Anna');
    expect(text).toContain('Nagy Béla');
    expect(text).toContain('12 / 15');
  });

  it('nem-kezdett diáknál "nem kezdte el" jelenik meg, nem pontszám', () => {
    configure(makeResults());
    const fixture = TestBed.createComponent(FeladatsorEredmenyekComponent);
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    const nagyRow = Array.from(rows).find((r) => (r as HTMLElement).textContent?.includes('Nagy Béla')) as HTMLElement;

    expect(nagyRow.textContent).toContain('nem kezdte el');
    expect(nagyRow.className).toContain('opacity-50');
  });
});
