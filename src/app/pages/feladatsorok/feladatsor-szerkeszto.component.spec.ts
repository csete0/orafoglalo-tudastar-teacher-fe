import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { signal } from '@angular/core';
import { FeladatsorSzerkesztoComponent } from './feladatsor-szerkeszto.component';
import { TeacherTaskSetStore } from '../../services/teacher-taskset/teacher-taskset.store';
import { SchoolStore } from '../../services/school/school.store';
import { TeacherTaskSetDetailDto } from '../../models/teacher-content.model';

function makeDetail(overrides: Partial<TeacherTaskSetDetailDto> = {}): TeacherTaskSetDetailDto {
  return {
    id: 1,
    title: 'Teszt feladatsor',
    slug: 'teszt-feladatsor',
    description: 'd',
    levelId: 2,
    isPublished: false,
    createdAt: new Date().toISOString(),
    taskCount: 0,
    tasks: [],
    files: [],
    ...overrides,
  };
}

describe('FeladatsorSzerkesztoComponent', () => {
  let taskSetStoreMock: {
    selectedDetail: ReturnType<typeof signal<TeacherTaskSetDetailDto | null>>;
    loading: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    publishResult: ReturnType<typeof signal<null>>;
    loadDetail: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
  };
  let schoolStoreMock: { schools: ReturnType<typeof signal<unknown[]>>; loadMine: ReturnType<typeof vi.fn> };

  function configure(detail: TeacherTaskSetDetailDto | null) {
    taskSetStoreMock = {
      selectedDetail: signal(detail),
      loading: signal(false),
      error: signal(null),
      publishResult: signal(null),
      loadDetail: vi.fn(),
      publish: vi.fn(),
    };
    schoolStoreMock = { schools: signal([]), loadMine: vi.fn() };

    TestBed.configureTestingModule({
      imports: [FeladatsorSzerkesztoComponent],
      providers: [
        { provide: TeacherTaskSetStore, useValue: taskSetStoreMock },
        { provide: SchoolStore, useValue: schoolStoreMock },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: () => '1' } } },
        },
      ],
    });
  }

  it('SQL kódrészlet esetén create.sql/create_lite.sql nélkül figyelmeztetést mutat', () => {
    configure(
      makeDetail({
        tasks: [
          {
            id: 1,
            title: 'F1',
            description: 'd',
            maxPoints: 10,
            taskOrder: 1,
            taskTypeIds: [],
            completeSolutionSnippets: [],
            solutions: [
              {
                id: 1,
                description: 'd',
                snippets: [{ programmingLanguageId: 6, code: 'SELECT 1;' }],
              },
            ],
          },
        ],
        files: [],
      }),
    );

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();

    const warning = fixture.nativeElement.querySelector('.text-warning');
    expect(warning).not.toBeNull();
    expect(warning.textContent).toContain('kötelező');
  });

  it('SQL kódrészlethez mindkét fájl feltöltve esetén nincs figyelmeztetés', () => {
    configure(
      makeDetail({
        tasks: [
          {
            id: 1,
            title: 'F1',
            description: 'd',
            maxPoints: 10,
            taskOrder: 1,
            taskTypeIds: [],
            completeSolutionSnippets: [],
            solutions: [
              { id: 1, description: 'd', snippets: [{ programmingLanguageId: 6, code: 'SELECT 1;' }] },
            ],
          },
        ],
        files: [
          { id: 'a', kind: 'CreateSql', originalFileName: 'create.sql', contentType: 'application/sql', sizeBytes: 10, createdAt: '', url: '/x' },
          { id: 'b', kind: 'CreateLiteSql', originalFileName: 'create_lite.sql', contentType: 'application/sql', sizeBytes: 10, createdAt: '', url: '/y' },
        ],
      }),
    );

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('kötelező');
  });

  it('nem-SQL feladatsornál nincs SQL-figyelmeztetés', () => {
    configure(
      makeDetail({
        tasks: [
          {
            id: 1,
            title: 'F1',
            description: 'd',
            maxPoints: 10,
            taskOrder: 1,
            taskTypeIds: [],
            completeSolutionSnippets: [],
            solutions: [{ id: 1, description: 'd', snippets: [{ programmingLanguageId: 2, code: 'print(1)' }] }],
          },
        ],
        files: [],
      }),
    );

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();

    // A "create_lite.sql" felirat a fájl-feltöltő panelen mindig ott van
    // (statikus címke) — a figyelmeztető sáv jelenlétét kell ellenőrizni.
    expect(fixture.nativeElement.querySelector('.text-warning')).toBeNull();
  });

  it('publikált feladatsornál a publikálás gomb letiltva, "Publikálva" felirattal', () => {
    configure(makeDetail({ isPublished: true }));

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button.bg-primary.hover\\:bg-primary-hover');
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Publikálva');
  });

  it('piszkozat feladatsornál a publikálás gomb aktív', () => {
    configure(makeDetail({ isPublished: false }));

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button.bg-primary.hover\\:bg-primary-hover');
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain('Publikálás');
  });

  it('publish hívás előtt intézményi tagságnál megerősítést kér (confirm)', () => {
    configure(makeDetail({ isPublished: false }));
    schoolStoreMock.schools.set([{ id: 1 }]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.publish(1);

    expect(confirmSpy).toHaveBeenCalled();
    expect(taskSetStoreMock.publish).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });
});
