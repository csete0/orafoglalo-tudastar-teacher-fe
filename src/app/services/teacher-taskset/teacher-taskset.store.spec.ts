import { TestBed } from '@angular/core/testing';
import { Subject, of } from 'rxjs';
import { TeacherTaskSetStore } from './teacher-taskset.store';
import { TeacherTaskSetService } from './teacher-taskset.service';
import { PublishResultDto, TeacherTaskSetDetailDto } from '../../models/teacher-content.model';

function makeDetail(overrides: Partial<TeacherTaskSetDetailDto> = {}): TeacherTaskSetDetailDto {
  return {
    id: 1,
    title: 'Teszt feladatsor',
    slug: 'teszt-feladatsor',
    description: 'd',
    levelId: 1,
    isPublished: false,
    createdAt: new Date().toISOString(),
    taskCount: 0,
    tasks: [],
    files: [],
    ...overrides,
  };
}

describe('TeacherTaskSetStore', () => {
  let serviceMock: {
    addTask: ReturnType<typeof vi.fn>;
    getDetail: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
  };
  let store: TeacherTaskSetStore;

  function configure() {
    serviceMock = {
      addTask: vi.fn(),
      getDetail: vi.fn(),
      publish: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [{ provide: TeacherTaskSetService, useValue: serviceMock }],
    });

    store = TestBed.inject(TeacherTaskSetStore);
  }

  // UI-TT-45: a mutateAndReload()-on (és a publish()-en) átmenő metódusoknál a loading()
  // a mutáció válaszának megérkezésekor NEM válthat azonnal false-ra — addig kell true-nak
  // maradnia, amíg a szinkron módon elindított loadDetail() reload-ja is tényleg le nem fut.
  it('addTask() (mutateAndReload) után loading()=true marad, amíg a reload válasza meg nem érkezik', () => {
    configure();
    serviceMock.addTask.mockReturnValue(of({ id: 1, title: 't', description: 'd', maxPoints: 10, taskOrder: 1, taskTypeIds: [6], solutions: [], completeSolutionSnippets: [] }));
    const reload$ = new Subject<TeacherTaskSetDetailDto>();
    serviceMock.getDetail.mockReturnValue(reload$.asObservable());

    store.addTask(1, { title: 't', description: 'd', maxPoints: 10, taskTypeIds: [6] });

    // A mutáció válasza már megérkezett (of() szinkron), a reload viszont MÉG NEM.
    expect(store.loading()).toBe(true);
    expect(store.selectedDetail()).toBeNull();

    const detail = makeDetail({ taskCount: 1 });
    reload$.next(detail);
    reload$.complete();

    expect(store.loading()).toBe(false);
    expect(store.selectedDetail()).toEqual(detail);
  });

  it('sikeres publish() után is loading()=true marad, amíg a reload válasza meg nem érkezik', () => {
    configure();
    const publishResult: PublishResultDto = { success: true, errors: [] };
    serviceMock.publish.mockReturnValue(of(publishResult));
    const reload$ = new Subject<TeacherTaskSetDetailDto>();
    serviceMock.getDetail.mockReturnValue(reload$.asObservable());

    let onSuccessCalled = false;
    store.publish(1, () => (onSuccessCalled = true));

    expect(store.loading()).toBe(true);
    expect(onSuccessCalled).toBe(false);

    reload$.next(makeDetail({ isPublished: true }));
    reload$.complete();

    expect(store.loading()).toBe(false);
    expect(store.selectedDetail()?.isPublished).toBe(true);
    expect(onSuccessCalled).toBe(true);
  });

  it('sikertelen publish() (result.success=false) esetén loading() azonnal false-ra vált (nincs reload)', () => {
    configure();
    const publishResult: PublishResultDto = { success: false, errors: ['hiba'] };
    serviceMock.publish.mockReturnValue(of(publishResult));

    store.publish(1);

    expect(store.loading()).toBe(false);
    expect(serviceMock.getDetail).not.toHaveBeenCalled();
  });

  // UI-TT-72: MÁSIK feladatsorra navigáláskor a korábban betöltött (A) adatot
  // azonnal törölni kell - a válasz megérkezéséig a régi adatlap látszott az
  // ÚJ (B) URL alatt.
  it('BUG UI-TT-72: loadDetail(masIkId) a válasz megérkezéséig NEM a korábban betöltött feladatsor adatát adja vissza', () => {
    configure();
    const detailA = makeDetail({ id: 1, title: 'A feladatsor' });
    serviceMock.getDetail.mockReturnValueOnce(of(detailA));

    store.loadDetail(1);
    expect(store.selectedDetail()).toEqual(detailA);

    const detailB$ = new Subject<TeacherTaskSetDetailDto>();
    serviceMock.getDetail.mockReturnValueOnce(detailB$.asObservable());

    store.loadDetail(2);

    // A válasz még nem érkezett meg - NEM szabad A adatát mutatnia.
    expect(store.selectedDetail()).toBeNull();

    const detailB = makeDetail({ id: 2, title: 'B feladatsor' });
    detailB$.next(detailB);
    detailB$.complete();

    expect(store.selectedDetail()).toEqual(detailB);
  });

  // Ugyanazon id újratöltésekor (mutateAndReload()/publish() minden sikeres
  // mentés után ide fut vissza) a régi adatot SZÁNDÉKOSAN megtartjuk, amíg a
  // friss válasz meg nem érkezik - loading() a UI-TT-45 fix óta ilyenkor is
  // true marad, egy null selectedDetail a teljes szerkesztő űrlapot egy
  // spinnerre cserélné minden egyes mentésnél.
  it('loadDetail(ugyanazAzId) újratöltésnél a korábbi adatot megtartja a válasz megérkezéséig', () => {
    configure();
    const detailA = makeDetail({ id: 1, title: 'A feladatsor' });
    serviceMock.getDetail.mockReturnValueOnce(of(detailA));

    store.loadDetail(1);
    expect(store.selectedDetail()).toEqual(detailA);

    const reload$ = new Subject<TeacherTaskSetDetailDto>();
    serviceMock.getDetail.mockReturnValueOnce(reload$.asObservable());

    store.loadDetail(1);

    // Ugyanaz az id - a korábbi adat marad látható, amíg a friss válasz meg nem érkezik.
    expect(store.selectedDetail()).toEqual(detailA);

    const detailAUpdated = makeDetail({ id: 1, title: 'A feladatsor (frissítve)' });
    reload$.next(detailAUpdated);
    reload$.complete();

    expect(store.selectedDetail()).toEqual(detailAUpdated);
  });
});
