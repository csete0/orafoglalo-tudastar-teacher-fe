import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AdminTanarokComponent } from './admin-tanarok.component';
import { AdminTeacherStore } from '../../services/admin/admin-teacher.store';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';
import { TeacherProfileAdminDto, AdminTaskSetDto } from '../../models/teacher-moderation.model';

function makeTeacher(overrides: Partial<TeacherProfileAdminDto> = {}): TeacherProfileAdminDto {
  return {
    id: 1,
    userId: 10,
    displayName: 'Teszt Tanár',
    email: 'teszt@example.com',
    isActive: true,
    createdAt: new Date().toISOString(),
    taskSetCount: 2,
    groupCount: 1,
    storageUsedBytes: 0,
    maxTaskSets: null,
    maxStorageBytes: null,
    ...overrides,
  };
}

describe('AdminTanarokComponent', () => {
  let storeMock: {
    teachers: ReturnType<typeof signal<TeacherProfileAdminDto[]>>;
    loading: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    selectedTeacherId: ReturnType<typeof signal<number | null>>;
    taskSets: ReturnType<typeof signal<AdminTaskSetDto[]>>;
    taskSetsLoading: ReturnType<typeof signal<boolean>>;
    load: ReturnType<typeof vi.fn>;
    setActive: ReturnType<typeof vi.fn>;
    setQuota: ReturnType<typeof vi.fn>;
    selectTeacher: ReturnType<typeof vi.fn>;
    takedownTaskSet: ReturnType<typeof vi.fn>;
  };
  let confirmServiceMock: { ask: ReturnType<typeof vi.fn> };
  let toastServiceMock: { success: ReturnType<typeof vi.fn> };

  function configure(teachers: TeacherProfileAdminDto[]) {
    storeMock = {
      teachers: signal(teachers),
      loading: signal(false),
      error: signal(null),
      selectedTeacherId: signal(null),
      taskSets: signal([]),
      taskSetsLoading: signal(false),
      load: vi.fn(),
      setActive: vi.fn(),
      setQuota: vi.fn(),
      selectTeacher: vi.fn(),
      takedownTaskSet: vi.fn(),
    };
    confirmServiceMock = { ask: vi.fn().mockResolvedValue(false) };
    toastServiceMock = { success: vi.fn() };

    TestBed.configureTestingModule({
      imports: [AdminTanarokComponent],
      providers: [
        { provide: AdminTeacherStore, useValue: storeMock },
        { provide: ConfirmService, useValue: confirmServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
      ],
    });
  }

  // UI-TT-129 kiterjesztés: ugyanaz az "aria-expanded hiánya" harmonika-altípus (ld.
  // feladatsor-szerkeszto.component.ts toggleSection/toggleTask), csak itt a dekoratív chevron-ikon
  // helyett egy szöveges ▲/▼ karakter jelzi vizuálisan a "Kvóta" szerkesztő-blokk nyitott/csukott
  // állapotát (toggleQuotaEdit(), 66-69. sor, quotaEditId signal). A gombon nincs aria-expanded,
  // ezért egy screen-reader-felhasználó a ▲/▼ karaktert nem tudja állapotként értelmezni.
  it('BUG (ÚJ, UI-TT-129): a "Kvóta ▲/▼" gombon (toggleQuotaEdit) nincs aria-expanded, csak a szöveges nyíl-karakter jelzi a nyitott/csukott állapotot', () => {
    configure([makeTeacher({ id: 1 })]);
    const fixture = TestBed.createComponent(AdminTanarokComponent);
    fixture.detectChanges();
    fixture.componentInstance.toggleQuotaEdit(makeTeacher({ id: 1 }));
    fixture.detectChanges();

    expect(fixture.componentInstance.quotaEditId()).toBe(1);

    const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
    const quotaToggleButton = buttons.find((b) => b.textContent?.includes('Kvóta'));
    expect(quotaToggleButton).toBeDefined();

    // Bukó elvárás: a kvóta-szerkesztő blokk ténylegesen nyitva van (quotaEditId()===1, a form
    // renderelve van a DOM-ban), de a gombon nincs aria-expanded="true".
    expect(quotaToggleButton!.getAttribute('aria-expanded')).toBe('true');
  });

  it('BUG (ÚJ, UI-TT-129): a "Feladatsorai ▲/▼" gombon (store.selectTeacher) sincs aria-expanded, holott ugyanaz a nyitott/csukott állapot-mintázat', () => {
    configure([makeTeacher({ id: 1 })]);
    storeMock.selectedTeacherId.set(1);
    const fixture = TestBed.createComponent(AdminTanarokComponent);
    fixture.detectChanges();

    const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
    const taskSetsToggleButton = buttons.find((b) => b.textContent?.includes('Feladatsorai'));
    expect(taskSetsToggleButton).toBeDefined();

    // Bukó elvárás: store.selectedTeacherId()===1 alatt a feladatsor-lista ténylegesen nyitva van,
    // de a gombon nincs aria-expanded="true".
    expect(taskSetsToggleButton!.getAttribute('aria-expanded')).toBe('true');
  });
});
