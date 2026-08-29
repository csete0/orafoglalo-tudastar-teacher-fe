import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AdminJelentkezesekComponent } from './admin-jelentkezesek.component';
import { AdminApplicationStore } from '../../services/admin/admin-application.store';
import { ToastService } from '../../shared/toast/toast.service';
import { TeacherApplicationAdminDto } from '../../models/teacher-application.model';

function makeApplication(overrides: Partial<TeacherApplicationAdminDto> = {}): TeacherApplicationAdminDto {
  return {
    id: 1,
    userId: 10,
    applicantName: 'Teszt Tanár',
    applicantEmail: 'teszt@example.com',
    motivation: 'Szeretnék tanítani.',
    status: 'Pending',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('AdminJelentkezesekComponent', () => {
  let storeMock: {
    applications: ReturnType<typeof signal<TeacherApplicationAdminDto[]>>;
    loading: ReturnType<typeof signal<boolean>>;
    error: ReturnType<typeof signal<string | null>>;
    statusFilter: ReturnType<typeof signal<'pending' | 'approved' | 'rejected' | 'all'>>;
    load: ReturnType<typeof vi.fn>;
    setStatusFilter: ReturnType<typeof vi.fn>;
    approve: ReturnType<typeof vi.fn>;
    reject: ReturnType<typeof vi.fn>;
  };
  let toastServiceMock: { success: ReturnType<typeof vi.fn> };

  function configure(applications: TeacherApplicationAdminDto[], loading = false) {
    storeMock = {
      applications: signal(applications),
      loading: signal(loading),
      error: signal(null),
      statusFilter: signal('pending'),
      load: vi.fn(),
      setStatusFilter: vi.fn(),
      approve: vi.fn(),
      reject: vi.fn(),
    };
    toastServiceMock = { success: vi.fn() };

    TestBed.configureTestingModule({
      imports: [AdminJelentkezesekComponent],
      providers: [
        { provide: AdminApplicationStore, useValue: storeMock },
        { provide: ToastService, useValue: toastServiceMock },
      ],
    });
  }

  // UI-TT-11: dupla-kattintás elleni védelem — amíg store.loading()===true,
  // az "Elfogadás"/"Elutasítás" gombok legyenek letiltva.
  it('a store.loading()===true alatt az "Elfogadás" és "Elutasítás" gombok le vannak tiltva', () => {
    configure([makeApplication()], true);
    const fixture = TestBed.createComponent(AdminJelentkezesekComponent);
    fixture.detectChanges();

    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    const approveButton = buttons.find((b) => b.textContent?.includes('Elfogadás'));
    const rejectButton = buttons.find((b) => b.textContent?.includes('Elutasítás'));

    expect(approveButton?.disabled).toBe(true);
    expect(rejectButton?.disabled).toBe(true);
  });

  it('a store.loading()===false alatt az "Elfogadás" és "Elutasítás" gombok engedélyezettek', () => {
    configure([makeApplication()], false);
    const fixture = TestBed.createComponent(AdminJelentkezesekComponent);
    fixture.detectChanges();

    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    const approveButton = buttons.find((b) => b.textContent?.includes('Elfogadás'));
    const rejectButton = buttons.find((b) => b.textContent?.includes('Elutasítás'));

    expect(approveButton?.disabled).toBe(false);
    expect(rejectButton?.disabled).toBe(false);
  });

  it('a store.loading()===true alatt az elutasítás "Megerősítés" gombja is le van tiltva', () => {
    configure([makeApplication()], true);
    const fixture = TestBed.createComponent(AdminJelentkezesekComponent);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.startReject(1);
    fixture.detectChanges();

    const buttons = Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];
    const confirmButton = buttons.find((b) => b.textContent?.includes('Megerősítés'));

    expect(confirmButton?.disabled).toBe(true);
  });

  it('approve() sikeres lezáráskor sikeres toastot mutat', () => {
    configure([makeApplication()], false);
    const fixture = TestBed.createComponent(AdminJelentkezesekComponent);
    fixture.detectChanges();

    fixture.componentInstance.approve(1);

    expect(storeMock.approve).toHaveBeenCalledTimes(1);
    const onSuccess = storeMock.approve.mock.calls[0][1] as () => void;
    onSuccess();
    expect(toastServiceMock.success).toHaveBeenCalledWith('Jelentkezés elfogadva.');
  });

  // UI-TT-216: az "Összes" fülön (statusFilter==='all') a kártya-template CSAK a
  // `status === 'Rejected' && rejectionReason` esetben ír ki bármit (a piros "Indoklás:"
  // sort) - egy Approved és egy indoklás NÉLKÜL elutasított (rejectionReason opcionális,
  // a `confirmReject()` üresen is elküldi) jelentkezés emiatt PIXEL-AZONOSAN, semmilyen
  // státusz-jelzés nélkül jelenik meg. A backend valós "status" mezőt küld (élőben
  // ellenőrizve: GET /api/admin/teacher-applications?status=all), a frontend csak nem
  // jeleníti meg.
  it('UI-TT-216: "Összes" fülön egy Approved és egy indoklás nélkül Rejected jelentkezés státusza megkülönböztethető', () => {
    configure(
      [
        makeApplication({ id: 1, applicantName: 'Elfogadott Tanár', status: 'Approved' }),
        makeApplication({ id: 2, applicantName: 'Indoklás Nélkül Elutasított', status: 'Rejected', rejectionReason: undefined }),
      ],
      false,
    );
    storeMock.statusFilter = signal('all');
    const fixture = TestBed.createComponent(AdminJelentkezesekComponent);
    fixture.detectChanges();

    const cards = Array.from(fixture.nativeElement.querySelectorAll('li.card')) as HTMLLIElement[];
    const approvedCard = cards.find((c) => c.textContent?.includes('Elfogadott Tanár'));
    const rejectedCard = cards.find((c) => c.textContent?.includes('Indoklás Nélkül Elutasított'));

    expect(approvedCard?.textContent).toMatch(/Elfogadva/i);
    expect(rejectedCard?.textContent).toMatch(/Elutasítva/i);
  });
});
