import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { FeladatsorSzerkesztoComponent } from './feladatsor-szerkeszto.component';
import { TeacherTaskSetStore } from '../../services/teacher-taskset/teacher-taskset.store';
import { SchoolStore } from '../../services/school/school.store';
import { AuthorizedFileService } from '../../services/file/authorized-file.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
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
  let authorizedFileServiceMock: { resolveUrl: ReturnType<typeof vi.fn>; revoke: ReturnType<typeof vi.fn> };
  let confirmServiceMock: { ask: ReturnType<typeof vi.fn>; pending: ReturnType<typeof signal<null>>; resolve: ReturnType<typeof vi.fn> };

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
    authorizedFileServiceMock = {
      resolveUrl: vi.fn((url: string) => of(`blob:resolved-${url}`)),
      revoke: vi.fn(),
    };
    confirmServiceMock = { ask: vi.fn().mockResolvedValue(false), pending: signal(null), resolve: vi.fn() };

    TestBed.configureTestingModule({
      imports: [FeladatsorSzerkesztoComponent],
      providers: [
        { provide: TeacherTaskSetStore, useValue: taskSetStoreMock },
        { provide: SchoolStore, useValue: schoolStoreMock },
        { provide: AuthorizedFileService, useValue: authorizedFileServiceMock },
        { provide: ConfirmService, useValue: confirmServiceMock },
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

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="publish-button"]');
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Publikálva');
  });

  it('piszkozat feladatsornál a publikálás gomb aktív', () => {
    configure(makeDetail({ isPublished: false }));

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="publish-button"]');
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain('Publikálás');
  });

  it('publish hívás előtt intézményi tagságnál megerősítést kér (ConfirmService)', async () => {
    configure(makeDetail({ isPublished: false }));
    schoolStoreMock.schools.set([{ id: 1 }]);

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    await component.publish(1);

    expect(confirmServiceMock.ask).toHaveBeenCalled();
    expect(taskSetStoreMock.publish).not.toHaveBeenCalled();
  });

  it('a "Megnyitás" link a bearer tokennel lekért blob URL-re mutat, nem a nyers (401-et adó) API URL-re', () => {
    configure(
      makeDetail({
        files: [
          { id: 'f1', kind: 'SolutionPdf', originalFileName: 'solution.pdf', contentType: 'application/pdf', sizeBytes: 10, createdAt: '', url: '/api/teacher-files/f1' },
        ],
      }),
    );

    const fixture = TestBed.createComponent(FeladatsorSzerkesztoComponent);
    fixture.detectChanges();

    const expectedApiUrl = fixture.componentInstance.apiOrigin + '/api/teacher-files/f1';
    expect(authorizedFileServiceMock.resolveUrl).toHaveBeenCalledWith(expectedApiUrl);

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a.text-primary');
    expect(link.getAttribute('href')).toBe(`blob:resolved-${expectedApiUrl}`);
  });
});
