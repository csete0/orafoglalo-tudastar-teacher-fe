import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { TeacherApplicationStore } from './teacher-application.store';
import { TeacherApplicationService } from './teacher-application.service';
import { TeacherApplicationDto } from '../../models/teacher-application.model';

function makeApplication(overrides: Partial<TeacherApplicationDto> = {}): TeacherApplicationDto {
  return {
    id: 1,
    status: 'Pending',
    motivation: 'Szeretném felkészíteni a diákjaimat.',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('TeacherApplicationStore', () => {
  let serviceMock: { apply: ReturnType<typeof vi.fn>; getMine: ReturnType<typeof vi.fn> };

  function configure() {
    serviceMock = { apply: vi.fn(), getMine: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        TeacherApplicationStore,
        { provide: TeacherApplicationService, useValue: serviceMock },
      ],
    });
  }

  beforeEach(() => configure());

  it('loadMine siker: application beállítva, checked=true, isPending igaz', async () => {
    serviceMock.getMine.mockReturnValue(of(makeApplication()));

    const store = TestBed.inject(TeacherApplicationStore);
    store.loadMine();
    await Promise.resolve();

    expect(store.checked()).toBe(true);
    expect(store.isPending()).toBe(true);
    expect(store.status()).toBe('Pending');
  });

  it('loadMine 404 (nincs jelentkezés): application null, de checked=true és nincs hiba', async () => {
    serviceMock.getMine.mockReturnValue(throwError(() => ({ status: 404 })));

    const store = TestBed.inject(TeacherApplicationStore);
    store.loadMine();
    await Promise.resolve();

    expect(store.checked()).toBe(true);
    expect(store.application()).toBeNull();
    expect(store.error()).toBeNull();
  });

  it('loadMine egyéb hiba esetén error-t állít', async () => {
    serviceMock.getMine.mockReturnValue(
      throwError(() => ({ status: 500, error: { errorMessage: 'Szerverhiba' } })),
    );

    const store = TestBed.inject(TeacherApplicationStore);
    store.loadMine();
    await Promise.resolve();

    expect(store.error()).toBe('Szerverhiba');
  });

  it('apply siker: application frissül és onSuccess meghívódik', async () => {
    serviceMock.apply.mockReturnValue(of(makeApplication({ institutionName: 'Petőfi Gimnázium' })));

    const store = TestBed.inject(TeacherApplicationStore);
    const onSuccess = vi.fn();
    store.apply({ motivation: 'x' }, onSuccess);
    await Promise.resolve();

    expect(store.application()?.institutionName).toBe('Petőfi Gimnázium');
    expect(onSuccess).toHaveBeenCalled();
  });

  it('apply hiba: error beállítva, application változatlan marad', async () => {
    serviceMock.apply.mockReturnValue(
      throwError(() => ({ error: { errorMessage: 'Már van elbírálásra váró jelentkezésed.' } })),
    );

    const store = TestBed.inject(TeacherApplicationStore);
    store.apply({ motivation: 'x' });
    await Promise.resolve();

    expect(store.error()).toBe('Már van elbírálásra váró jelentkezésed.');
    expect(store.application()).toBeNull();
  });

  it('isApproved/isRejected computed helyesen tükrözi a státuszt', async () => {
    serviceMock.getMine.mockReturnValue(of(makeApplication({ status: 'Approved' })));

    const store = TestBed.inject(TeacherApplicationStore);
    store.loadMine();
    await Promise.resolve();

    expect(store.isApproved()).toBe(true);
    expect(store.isPending()).toBe(false);
    expect(store.isRejected()).toBe(false);
  });
});
