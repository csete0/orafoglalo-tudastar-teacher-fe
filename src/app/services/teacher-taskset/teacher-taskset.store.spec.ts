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
    upsertSolutionSnippets: ReturnType<typeof vi.fn>;
    upsertCompleteSolutionSnippets: ReturnType<typeof vi.fn>;
  };
  let store: TeacherTaskSetStore;

  function configure() {
    serviceMock = {
      addTask: vi.fn(),
      getDetail: vi.fn(),
      publish: vi.fn(),
      uploadFile: vi.fn(),
      upsertSolutionSnippets: vi.fn(),
      upsertCompleteSolutionSnippets: vi.fn(),
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

  // UI-TT-121: a "Kódrészletek mentése" gomb (feladatsor-szerkeszto.component.ts:154,
  // saveSnippets() -> store.upsertSolutionSnippets()) - a UI-TT-115-ben javított
  // addTask()/addSolution()-nal ellentétben - SEMMILYEN védelmet nem kapott dupla-
  // kattintás ellen: a gombnak nincs `[disabled]` bindingja, a `saveSnippets()`
  // komponens-metódus nem ellenőrzi induláskor a `store.loading()`-ot, és maga a
  // `TeacherTaskSetStore.upsertSolutionSnippets()` (a közös `mutateAndReload()`-on
  // át) sem tartalmaz semmilyen "már folyamatban van egy kérés" guardot. Egy gyors
  // dupla-kattintás KÉT külön valódi PUT/POST kérést indít ugyanarra a solution-re
  // (a testvér `upsertCompleteSolutionSnippets()`/`uploadFile()` metódusok - amik
  // szintén a mutateAndReload()-on mennek át - ugyanettől a hiánytól szenvednek,
  // ugyanaz a gyökérok).
  it('BUG UI-TT-121: upsertSolutionSnippets()-nél egy átfedő második hívás (dupla-kattintás) MÁSODIK valódi HTTP-kérést indít, mert nincs "loading" guard', () => {
    configure();
    const snippetsSubject = new Subject<unknown>();
    serviceMock.upsertSolutionSnippets.mockReturnValue(snippetsSubject.asObservable());
    serviceMock.getDetail.mockReturnValue(of(makeDetail()));

    // Első kattintás a "Kódrészletek mentése" gombon.
    store.upsertSolutionSnippets(1, 10, [{ programmingLanguageId: 2, code: 'print(1)' }]);
    expect(serviceMock.upsertSolutionSnippets).toHaveBeenCalledTimes(1);

    // Dupla-kattintás, amíg az első kérés még folyamatban van (nincs válasz) -
    // ugyanabban a JS-tickben, await nélkül.
    store.upsertSolutionSnippets(1, 10, [{ programmingLanguageId: 2, code: 'print(1)' }]);

    // A helyes viselkedés az lenne, hogy a második, átfedő hívás NEM indít
    // újabb kérést, amíg az első válasza meg nem érkezik - ez itt MEGBUKIK,
    // mert nincs ilyen guard.
    expect(serviceMock.upsertSolutionSnippets).toHaveBeenCalledTimes(1);

    snippetsSubject.next({});
    snippetsSubject.complete();
  });

  // UI-TT-121 testvér-eset: a "Kódrészletek mentése" fixje idáig KIZÁRÓLAG
  // upsertSolutionSnippets()-et védte (egy saját, duplikált guarddal) - a
  // közös mutateAndReload()-on átmenő upsertCompleteSolutionSnippets()
  // ("Összevont megoldás mentése" gomb) ugyanettől a hiánytól szenvedett,
  // sosem lett önállóan bizonyítva/javítva. A fix a guardot magába
  // mutateAndReload()-ba központosítja, hogy ez a testvér-metódus (és
  // bármely jövőbeli új hívó) automatikusan védve legyen.
  it('BUG UI-TT-121 testvér-eset: upsertCompleteSolutionSnippets()-nél egy átfedő második hívás (dupla-kattintás) MÁSODIK valódi HTTP-kérést indít, mert nincs "loading" guard', () => {
    configure();
    const snippetsSubject = new Subject<unknown>();
    serviceMock.upsertCompleteSolutionSnippets.mockReturnValue(snippetsSubject.asObservable());
    serviceMock.getDetail.mockReturnValue(of(makeDetail()));

    // Első kattintás az "Összevont megoldás mentése" gombon.
    store.upsertCompleteSolutionSnippets(1, 10, [{ programmingLanguageId: 2, code: 'print(1)' }]);
    expect(serviceMock.upsertCompleteSolutionSnippets).toHaveBeenCalledTimes(1);

    // Dupla-kattintás, amíg az első kérés még folyamatban van (nincs válasz).
    store.upsertCompleteSolutionSnippets(1, 10, [{ programmingLanguageId: 2, code: 'print(1)' }]);

    // A helyes viselkedés: a második, átfedő hívás NEM indít újabb kérést,
    // amíg az első válasza meg nem érkezik.
    expect(serviceMock.upsertCompleteSolutionSnippets).toHaveBeenCalledTimes(1);

    snippetsSubject.next({});
    snippetsSubject.complete();
  });

  // UI-TT-105: minden mutáció a `mutateAndReload()`-on át SAJÁT `loadDetail()` GET-et
  // indít. Két gyors egymás utáni mutációnál a két reload verseng, és ha a RÉGEBBI
  // válasza ér célba utoljára, felülírja a store-t — egy ténylegesen törölt feladat
  // visszatér a szerkesztőbe. A `deleteTask` itt szándékosan a `loading()`-guard
  // NÉLKÜLI úton fut (a guard csak a snippet-mentőkön van), tehát a két reload
  // ténylegesen párhuzamosan él.
  it('BUG UI-TT-105 javítva: két versengő reload közül a késve érkező RÉGEBBI válasz nem írja felül az újabbat', async () => {
    configure();
    const elsoReload = new Subject<TeacherTaskSetDetailDto>();
    const masodikReload = new Subject<TeacherTaskSetDetailDto>();
    serviceMock.getDetail.mockReturnValueOnce(elsoReload).mockReturnValueOnce(masodikReload);

    // Két, egymást gyorsan követő, MÁR lefutott mutáció reloadja.
    store.loadDetail(1);
    store.loadDetail(1);
    expect(serviceMock.getDetail).toHaveBeenCalledTimes(2);

    // A frissebb (második) reload ér célba előbb — ez a helyes, aktuális állapot.
    const ujAllapot = makeDetail({ taskCount: 1, title: 'Törlés utáni állapot' });
    masodikReload.next(ujAllapot);
    masodikReload.complete();
    await Promise.resolve();
    expect(store.selectedDetail()).toEqual(ujAllapot);

    // A régebbi reload elavult válasza NEM állíthatja vissza a törölt feladatot.
    elsoReload.next(makeDetail({ taskCount: 2, title: 'Elavult állapot' }));
    elsoReload.complete();
    await Promise.resolve();
    expect(store.selectedDetail()).toEqual(ujAllapot);
  });

  // Az elavult reload az `onSuccess`-t sem sütheti el: az a hívó oldalán toastot
  // vagy navigációt válthatna ki egy már túlhaladott művelet nevében.
  it('BUG UI-TT-105 javítva: az elavult reload nem hívja meg az onSuccess callbacket', async () => {
    configure();
    const elsoReload = new Subject<TeacherTaskSetDetailDto>();
    const masodikReload = new Subject<TeacherTaskSetDetailDto>();
    serviceMock.getDetail.mockReturnValueOnce(elsoReload).mockReturnValueOnce(masodikReload);

    const elsoOnSuccess = vi.fn();
    const masodikOnSuccess = vi.fn();

    store.loadDetail(1, elsoOnSuccess);
    store.loadDetail(1, masodikOnSuccess);

    masodikReload.next(makeDetail());
    masodikReload.complete();
    await Promise.resolve();

    elsoReload.next(makeDetail());
    elsoReload.complete();
    await Promise.resolve();

    expect(masodikOnSuccess).toHaveBeenCalledTimes(1);
    expect(elsoOnSuccess).not.toHaveBeenCalled();
  });
});
