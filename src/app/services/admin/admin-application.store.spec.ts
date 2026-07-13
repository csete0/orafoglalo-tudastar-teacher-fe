import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { AdminApplicationStore } from './admin-application.store';
import { AdminApplicationService } from './admin-application.service';
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

describe('AdminApplicationStore', () => {
  let serviceMock: {
    getApplications: ReturnType<typeof vi.fn>;
    approve: ReturnType<typeof vi.fn>;
    reject: ReturnType<typeof vi.fn>;
  };

  function configure() {
    serviceMock = {
      getApplications: vi.fn(),
      approve: vi.fn(),
      reject: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        AdminApplicationStore,
        { provide: AdminApplicationService, useValue: serviceMock },
      ],
    });
  }

  beforeEach(() => configure());

  it('approve siker esetén eltávolítja a listából és meghívja az onSuccess-t', async () => {
    serviceMock.getApplications.mockReturnValue(of([makeApplication()]));
    serviceMock.approve.mockReturnValue(of({}));

    const store = TestBed.inject(AdminApplicationStore);
    store.load();
    await Promise.resolve();

    const onSuccess = vi.fn();
    store.approve(1, onSuccess);
    await Promise.resolve();

    expect(store.applications().length).toBe(0);
    expect(onSuccess).toHaveBeenCalled();
    expect(store.loading()).toBe(false);
  });

  // UI-TT-11: dupla-kattintás (átfedő approve() hívás) ne indítson második,
  // valós hálózati kérést, amíg az első még folyamatban van.
  it('loading true az approve kérés alatt, és egy átfedő approve() hívás nem indít második kérést', async () => {
    serviceMock.getApplications.mockReturnValue(of([makeApplication()]));
    const approveSubject = new Subject<unknown>();
    serviceMock.approve.mockReturnValue(approveSubject.asObservable());

    const store = TestBed.inject(AdminApplicationStore);
    store.load();
    await Promise.resolve();

    store.approve(1);
    expect(store.loading()).toBe(true);
    expect(serviceMock.approve).toHaveBeenCalledTimes(1);

    // dupla-kattintás, amíg az első hívás még folyamatban van
    store.approve(1);
    expect(serviceMock.approve).toHaveBeenCalledTimes(1);

    approveSubject.next({});
    approveSubject.complete();
    await Promise.resolve();

    expect(store.loading()).toBe(false);
  });

  it('loading true a reject kérés alatt, és egy átfedő reject() hívás nem indít második kérést', async () => {
    serviceMock.getApplications.mockReturnValue(of([makeApplication()]));
    const rejectSubject = new Subject<unknown>();
    serviceMock.reject.mockReturnValue(rejectSubject.asObservable());

    const store = TestBed.inject(AdminApplicationStore);
    store.load();
    await Promise.resolve();

    store.reject(1, {});
    expect(store.loading()).toBe(true);
    expect(serviceMock.reject).toHaveBeenCalledTimes(1);

    store.reject(1, {});
    expect(serviceMock.reject).toHaveBeenCalledTimes(1);

    rejectSubject.next({});
    rejectSubject.complete();
    await Promise.resolve();

    expect(store.loading()).toBe(false);
  });

  it('approve hiba esetén beállítja az error jelet, és NEM távolítja el az elemet a listából', async () => {
    serviceMock.getApplications.mockReturnValue(of([makeApplication()]));
    serviceMock.approve.mockReturnValue(
      throwError(() => ({ error: { errorMessage: 'Csak elbírálásra váró jelentkezés hagyható jóvá.' } })),
    );

    const store = TestBed.inject(AdminApplicationStore);
    store.load();
    await Promise.resolve();

    store.approve(1);
    await Promise.resolve();

    expect(store.error()).toBe('Csak elbírálásra váró jelentkezés hagyható jóvá.');
    expect(store.applications().length).toBe(1);
    expect(store.loading()).toBe(false);
  });
});
