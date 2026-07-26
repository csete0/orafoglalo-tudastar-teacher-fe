import { TestBed } from '@angular/core/testing';
import { of, throwError, Subject } from 'rxjs';
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

  // JelentkezesComponent 5 másodpercenként pollozza loadMine()-t, amíg isPending() igaz -
  // korábban semmi nem védte a válaszok kiérkezésének sorrendjét: ha egy KORÁBBAN indított
  // (de lassabb) hívás válasza egy KÉSŐBB indított (de gyorsabb) hívás válasza UTÁN
  // érkezett meg, a régi ("Pending") adat csendben felülírta volna a már megérkezett friss
  // ("Approved") állapotot.
  it('BUG-fix: két átfedő loadMine()-hívás közül a KÉSŐBB indított (de hamarabb megérkező) válasza nyer, a KORÁBBAN indított, de KÉSŐBB megérkező elavult válasz nem írja felül', async () => {
    const firstResponse = new Subject<TeacherApplicationDto>();
    const secondResponse = new Subject<TeacherApplicationDto>();
    serviceMock.getMine
      .mockReturnValueOnce(firstResponse)
      .mockReturnValueOnce(secondResponse);

    const store = TestBed.inject(TeacherApplicationStore);

    // Első (pollozási) hívás elindul...
    store.loadMine();
    // ...majd MIELŐTT visszaérne, egy második (a következő 5mp-es poll-tick) is elindul.
    store.loadMine();
    expect(serviceMock.getMine).toHaveBeenCalledTimes(2);

    // A hálózaton a válaszok FORDÍTOTT sorrendben érkeznek: előbb a KÉSŐBB indított
    // hívás (friss "Approved" állapot)...
    secondResponse.next(makeApplication({ status: 'Approved' }));
    secondResponse.complete();
    await Promise.resolve();

    expect(store.status()).toBe('Approved');

    // ...majd UTÁNA érkezik meg a KORÁBBAN indított, de már elavult hívás válasza
    // (stale "Pending" állapot).
    firstResponse.next(makeApplication({ status: 'Pending' }));
    firstResponse.complete();
    await Promise.resolve();

    // A JAVÍTOTT viselkedés: az elavult, később megérkező válasz NEM írja felül a
    // ténylegesen legutóbb indított híváséból már beállított "Approved" állapotot.
    expect(store.status()).toBe('Approved');
    expect(store.loading()).toBe(false);
    expect(store.checked()).toBe(true);
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
