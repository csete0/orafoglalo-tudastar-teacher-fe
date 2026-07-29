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
    reinstateTaskSet: ReturnType<typeof vi.fn>;
  };
  let confirmServiceMock: { ask: ReturnType<typeof vi.fn> };
  let toastServiceMock: { success: ReturnType<typeof vi.fn>; warning: ReturnType<typeof vi.fn> };

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
      reinstateTaskSet: vi.fn(),
    };
    confirmServiceMock = { ask: vi.fn().mockResolvedValue(false) };
    toastServiceMock = { success: vi.fn(), warning: vi.fn() };

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

  // UI-TT-134 fix: saveQuota() (181-191. sor) negatív értéknél korábban feltétel nélkül, néma
  // korai return-nel futott ki — sem store.setQuota() nem hívódott, sem toast/hibaüzenet nem
  // jelent meg, az admin számára a "Mentés" gomb kattintása megkülönböztethetetlen volt attól,
  // mintha el sem sült volna. A fix a korai return elé egy figyelmeztető toastot iktat be.
  it('saveQuota() negatív "Max feladatsor" értéknél figyelmeztető toastot ad, és nem hívja meg store.setQuota()-t', () => {
    configure([makeTeacher({ id: 1, maxTaskSets: 10 })]);
    const fixture = TestBed.createComponent(AdminTanarokComponent);
    fixture.detectChanges();

    fixture.componentInstance.toggleQuotaEdit(makeTeacher({ id: 1, maxTaskSets: 10 }));
    fixture.componentInstance.quotaTaskSets = -5;
    fixture.componentInstance.saveQuota(1);
    fixture.detectChanges();

    expect(storeMock.setQuota).not.toHaveBeenCalled();
    expect(toastServiceMock.warning).toHaveBeenCalledWith('A kvóta nem lehet negatív.');
    // A panel is nyitva marad — az admin még módosíthatja az érvénytelen értéket.
    expect(fixture.componentInstance.quotaEditId()).toBe(1);
  });

  it('saveQuota() negatív "Max tárhely" értéknél is figyelmeztető toastot ad, és nem hívja meg store.setQuota()-t', () => {
    configure([makeTeacher({ id: 1 })]);
    const fixture = TestBed.createComponent(AdminTanarokComponent);
    fixture.detectChanges();

    fixture.componentInstance.toggleQuotaEdit(makeTeacher({ id: 1 }));
    fixture.componentInstance.quotaStorageMb = -1;
    fixture.componentInstance.saveQuota(1);
    fixture.detectChanges();

    expect(storeMock.setQuota).not.toHaveBeenCalled();
    expect(toastServiceMock.warning).toHaveBeenCalledWith('A kvóta nem lehet negatív.');
  });

  // BE-ADMINTEACHER-QUOTASAVE-FALSE-SUCCESS fix: a store `_loading`-ja megosztott a
  // setActive/setQuota/takedownTaskSet között — amíg egy admin-művelet fut, a többi
  // gombnak is tiltottnak kell lennie, különben az admin egy másik mutációt indítana
  // el, amit a store guardja csendben, HTTP-hívás nélkül elnyelne.
  it('minden admin-akció gomb [disabled], amíg store.loading() igaz', () => {
    configure([makeTeacher({ id: 1, isActive: true })]);
    storeMock.selectedTeacherId.set(1);
    storeMock.taskSets.set([
      { id: 100, title: 'Feladatsor', taskCount: 1, isPublished: true } as AdminTaskSetDto,
    ]);
    storeMock.loading.set(true);
    const fixture = TestBed.createComponent(AdminTanarokComponent);
    fixture.detectChanges();
    fixture.componentInstance.toggleQuotaEdit(makeTeacher({ id: 1 }));
    fixture.detectChanges();

    const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
    const suspendButton = buttons.find((b) => b.textContent?.includes('Felfüggesztés'));
    const quotaSaveButton = buttons.find((b) => b.textContent?.trim() === 'Mentés');
    const takedownButton = buttons.find((b) => b.textContent?.includes('Publikálás visszavonása'));

    expect(suspendButton?.disabled).toBe(true);
    expect(quotaSaveButton?.disabled).toBe(true);
    expect(takedownButton?.disabled).toBe(true);
  });

  // A takedown óta a tanár SAJÁT újra-publikálását a backend elutasítja, tehát a levett
  // állapotnak felületi feloldó útja kell legyen - enélkül az admin döntése csak nyers
  // API-hívással lenne visszafordítható. A takedownAt (nem az isPublished) különbözteti
  // meg az admin-takedownt a tanár saját piszkozatától.
  it('admin-takedown alatt álló feladatsornál a feloldó gomb jelenik meg, és a store-t hívja', () => {
    configure([makeTeacher({ id: 1, isActive: true })]);
    storeMock.selectedTeacherId.set(1);
    storeMock.taskSets.set([
      {
        id: 100,
        title: 'Feladatsor',
        taskCount: 1,
        isPublished: false,
        takedownAt: '2026-07-29T10:00:00Z',
      } as AdminTaskSetDto,
    ]);
    const fixture = TestBed.createComponent(AdminTanarokComponent);
    fixture.detectChanges();

    const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
    const reinstateButton = buttons.find((b) => b.textContent?.includes('Visszavonás feloldása'));
    expect(reinstateButton).toBeTruthy();
    expect(buttons.find((b) => b.textContent?.includes('Publikálás visszavonása'))).toBeUndefined();

    reinstateButton!.click();
    expect(storeMock.reinstateTaskSet).toHaveBeenCalledWith(100, expect.any(Function));
  });

  // Kontraszt az előző teszthez: a tanár SAJÁT piszkozatánál (nincs admin-takedown)
  // nem szabad feloldó gombot mutatni - nincs mit feloldani.
  it('a tanár saját piszkozatánál nem jelenik meg feloldó gomb', () => {
    configure([makeTeacher({ id: 1, isActive: true })]);
    storeMock.selectedTeacherId.set(1);
    storeMock.taskSets.set([
      { id: 100, title: 'Piszkozat', taskCount: 1, isPublished: false, takedownAt: null } as AdminTaskSetDto,
    ]);
    const fixture = TestBed.createComponent(AdminTanarokComponent);
    fixture.detectChanges();

    const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button'));
    expect(buttons.find((b) => b.textContent?.includes('Visszavonás feloldása'))).toBeUndefined();
  });

  // BE-ADMINTEACHER-QUOTASAVE-FALSE-SUCCESS: korábban saveQuota() feltétel nélkül zárta
  // be a kvóta-panelt közvetlenül a store.setQuota() hívása UTÁN, függetlenül attól, hogy
  // az ténylegesen elindított-e egy kérést. Ha a store megosztott _loading guardja miatt
  // a hívás csendben no-op (a mockolt setQuota itt szándékosan SOSEM hívja meg az
  // onSuccess callback-et — pont ezt az esetet szimulálva), a panelnek NYITVA kell
  // maradnia, és semmilyen "Kvóta mentve." toast nem jelenhet meg.
  it('saveQuota() nem zárja be a panelt és nem ad sikertoastot, ha a store.setQuota() csendben no-op (megosztott loading guard miatt)', () => {
    configure([makeTeacher({ id: 1, maxTaskSets: 10 })]);
    const fixture = TestBed.createComponent(AdminTanarokComponent);
    fixture.detectChanges();

    fixture.componentInstance.toggleQuotaEdit(makeTeacher({ id: 1, maxTaskSets: 10 }));
    fixture.componentInstance.quotaTaskSets = 5;
    fixture.componentInstance.saveQuota(1);
    fixture.detectChanges();

    expect(storeMock.setQuota).toHaveBeenCalled();
    expect(toastServiceMock.success).not.toHaveBeenCalled();
    // Bukó elvárás (fix előtt): a panel ettől függetlenül bezárult (quotaEditId() === null).
    expect(fixture.componentInstance.quotaEditId()).toBe(1);
  });
});
