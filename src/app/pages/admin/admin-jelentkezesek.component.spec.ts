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
});
