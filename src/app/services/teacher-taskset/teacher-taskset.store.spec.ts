import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, of, throwError } from 'rxjs';
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
    uploadFile: ReturnType<typeof vi.fn>;
  };
  let store: TeacherTaskSetStore;

  function configure() {
    serviceMock = {
      addTask: vi.fn(),
      getDetail: vi.fn(),
      publish: vi.fn(),
      uploadFile: vi.fn(),
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

  // UI-TT-89: a backend a publish validáció-hibáit a PublishResultDto `errors: string[]`
  // mezejében küldi, NEM `errorMessage`-ben - a store hibakezelője emiatt a konkrét,
  // hasznos backend-üzenetet csendben eldobta, és a tanár csak egy tartalmatlan
  // "A publikálás sikertelen."-t látott.
  it('BUG UI-TT-89: sikertelen publish() HTTP-hibaágán a backend `errors` tömbjének konkrét indoka helyett a tartalmatlan generikus üzenet jelenik meg', () => {
    configure();
    const httpError = {
      error: { success: false, errors: ['A(z) „browserhunt-feladat-1” feladathoz legalább egy részfeladat (megoldás) kell.'] },
    };
    serviceMock.publish.mockReturnValue(throwError(() => httpError));

    store.publish(1);

    expect(store.loading()).toBe(false);
    expect(store.error()).toContain('részfeladat');
  });

  // UI-TT-90: a backend CreateTeacherTaskRequest.Description mezője [Required], de a FE
  // "Új feladat hozzáadása" formja a "Hozzáadás" gombot kizárólag a Cím alapján engedélyezte -
  // a backend standard ASP.NET ValidationProblemDetails alakot ad vissza (mezőnév->üzenetek
  // szótár), amit a store szintén nem olvasott ki.
  it('BUG UI-TT-90: sikertelen addTask() HTTP-hibaágán a backend ValidationProblemDetails "Description required" indoka helyett a tartalmatlan generikus üzenet jelenik meg', () => {
    configure();
    const httpError = {
      error: {
        type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1',
        title: 'One or more validation errors occurred.',
        status: 400,
        errors: { Description: ['The Description field is required.'] },
      },
    };
    serviceMock.addTask.mockReturnValue(throwError(() => httpError));

    store.addTask(1, { title: 'browserhunt-sql-feladat-1', description: '', maxPoints: 10, taskTypeIds: [5] });

    expect(store.loading()).toBe(false);
    expect(store.error()).toContain('Description');
  });

  // UI-TT-109: nginx `client_max_body_size`-t meghaladó feltöltés HTML-testű 413-at ad
  // vissza, NEM JSON-t - a régi extractErrorMessage() csak a `{errorMessage}`/`{errors}`
  // JSON-alakokat ismerte fel, ezért ez csendben a tartalmatlan "A művelet sikertelen."
  // generikus üzenetre esett vissza, a tanár sosem tudta meg, hogy a fájl mérete volt a
  // gond (és hogy a nginx-limit jóval alacsonyabb, mint a dokumentált app-szintű limitek).
  it('BUG UI-TT-109: 413-as (nginx "Request Entity Too Large", nem-JSON HTML törzsű) uploadFile()-hiba esetén a dedikált "fájl túl nagy" üzenet jelenik meg, nem a tartalmatlan generikus szöveg', () => {
    configure();
    const httpError = new HttpErrorResponse({
      status: 413,
      statusText: 'Request Entity Too Large',
      error: '<html>\n<head><title>413 Request Entity Too Large</title></head>\n<body>\n<center>413 Request Entity Too Large</center>\n<hr><center>nginx</center>\n</body>\n</html>\n',
    });
    serviceMock.uploadFile.mockReturnValue(throwError(() => httpError));

    store.uploadFile(1, 'InputTxt', new File(['x'], 'nagy.txt'));

    expect(store.loading()).toBe(false);
    expect(serviceMock.getDetail).not.toHaveBeenCalled();
    expect(store.error()).toBe('A feltöltött fájl mérete meghaladja a megengedett korlátot.');
    expect(store.error()).not.toContain('sikertelen.');
  });
});
