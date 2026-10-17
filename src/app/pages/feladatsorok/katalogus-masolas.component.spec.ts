import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { CATALOG_PAGE_SIZE, copyErrorMessage, KatalogusMasolasComponent } from './katalogus-masolas.component';
import { TeacherTaskSetService } from '../../services/teacher-taskset/teacher-taskset.service';
import { CatalogPageDto, CatalogTaskSetDto } from '../../models/teacher-content.model';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';

function row(overrides: Partial<CatalogTaskSetDto> = {}): CatalogTaskSetDto {
  return {
    id: 15,
    title: '2024. május-június',
    categoryId: 2,
    categoryName: 'Digitális kultúra emelt szintű érettségi',
    levelId: 2,
    levelName: 'advanced',
    year: 2024,
    taskCount: 4,
    isPremium: false,
    isFree: true,
    canCopy: true,
    alreadyCopied: false,
    ...overrides,
  };
}

function page(items: CatalogTaskSetDto[] = [row()], overrides: Partial<CatalogPageDto> = {}): CatalogPageDto {
  return {
    page: 1,
    pageSize: CATALOG_PAGE_SIZE,
    totalCount: items.length,
    items,
    categories: [{ id: 2, name: 'Digitális kultúra emelt szintű érettségi' }],
    ...overrides,
  };
}

describe('KatalogusMasolasComponent', () => {
  let serviceMock: { getCatalog: ReturnType<typeof vi.fn>; copyFromCatalog: ReturnType<typeof vi.fn> };
  let confirmMock: { ask: ReturnType<typeof vi.fn> };
  let toastMock: { success: ReturnType<typeof vi.fn>; warning: ReturnType<typeof vi.fn> };
  let routerMock: { navigate: ReturnType<typeof vi.fn> };

  function create(catalog: unknown = of(page())) {
    serviceMock = {
      getCatalog: vi.fn(() => catalog),
      copyFromCatalog: vi.fn(() => of({ taskSetId: 812, title: '2024. május-június (másolat)', taskCount: 4, fileCount: 21, warnings: [] })),
    };
    confirmMock = { ask: vi.fn(() => Promise.resolve(true)) };
    toastMock = { success: vi.fn(), warning: vi.fn() };
    routerMock = { navigate: vi.fn() };
    TestBed.configureTestingModule({
      imports: [KatalogusMasolasComponent],
      providers: [
        { provide: TeacherTaskSetService, useValue: serviceMock },
        { provide: ConfirmService, useValue: confirmMock },
        { provide: ToastService, useValue: toastMock },
        { provide: Router, useValue: routerMock },
      ],
    });
    const fixture = TestBed.createComponent(KatalogusMasolasComponent);
    fixture.detectChanges();
    return fixture;
  }

  const q = (fixture: { nativeElement: HTMLElement }, id: string) => fixture.nativeElement.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const lastQuery = () => serviceMock.getCatalog.mock.calls.at(-1)![0];

  afterEach(() => vi.useRealTimers());

  it('megnyitáskor az első oldalt kéri szűrők nélkül, és a sorokat mutatja', () => {
    const fixture = create(of(page([row(), row({ id: 16, title: 'Prémium sor', isPremium: true, isFree: false, canCopy: false, alreadyCopied: true, year: null })])));
    expect(serviceMock.getCatalog).toHaveBeenCalledWith({ q: null, categoryId: null, levelId: null, year: null, page: 1, pageSize: CATALOG_PAGE_SIZE });

    const first = q(fixture, 'catalog-item-15')!;
    expect(first.textContent).toContain('2024. május-június');
    expect(first.textContent).toContain('Digitális kultúra emelt szintű érettségi');
    expect(first.textContent).toContain('Középhaladó');
    expect(first.textContent).toContain('4 feladat');
    expect(q(fixture, 'catalog-premium-15')).toBeNull();

    expect(q(fixture, 'catalog-premium-16')).not.toBeNull();
    expect(q(fixture, 'catalog-copied-16')!.textContent).toContain('Már lemásoltad');
    const blocked = q(fixture, 'catalog-copy-16') as HTMLButtonElement;
    expect(blocked.disabled).toBe(true);
    expect(blocked.parentElement!.getAttribute('title')).toContain('Prémium előfizetés kell');
    expect(fixture.nativeElement.querySelector('#' + blocked.getAttribute('aria-describedby'))!.textContent).toContain('Prémium előfizetés kell');
    expect(q(fixture, 'catalog-count')!.textContent).toContain('2 feladatsor');
  });

  it('fizetős (nem prémium) sornál az előfizetést nevezi meg', () => {
    const fixture = create(of(page([row({ isFree: false, canCopy: false })])));
    expect(q(fixture, 'catalog-item-15')!.textContent).toContain('Fizetős tartalom - a másolásához előfizetés kell.');
  });

  it('a szűrők az 1. oldalra ugranak, és a kiválasztott értékkel kérnek', () => {
    const fixture = create(of(page([row()], { totalCount: 45 })));
    fixture.componentInstance.goToPage(3);
    expect(lastQuery().page).toBe(3);

    fixture.componentInstance.setCategory(2);
    expect(lastQuery()).toEqual({ q: null, categoryId: 2, levelId: null, year: null, page: 1, pageSize: CATALOG_PAGE_SIZE });
    fixture.componentInstance.setLevel(3);
    fixture.componentInstance.setYear(2024);
    expect(lastQuery()).toEqual({ q: null, categoryId: 2, levelId: 3, year: 2024, page: 1, pageSize: CATALOG_PAGE_SIZE });
    fixture.componentInstance.setLevel(null);
    expect(lastQuery().levelId).toBeNull();
  });

  it('a keresés késleltetve, legalább 2 karakterrel, az 1. oldalról kér', () => {
    vi.useFakeTimers();
    const fixture = create(of(page([row()], { totalCount: 45 })));
    fixture.componentInstance.goToPage(2);
    const calls = serviceMock.getCatalog.mock.calls.length;

    fixture.componentInstance.onSearch('e');
    fixture.detectChanges();
    expect(q(fixture, 'catalog-search-hint')).not.toBeNull();
    vi.advanceTimersByTime(300);
    // Az 1 karakter (null) nem változtat a szűrésen - nincs új kérés.
    expect(serviceMock.getCatalog.mock.calls.length).toBe(calls);

    fixture.componentInstance.onSearch('em');
    fixture.componentInstance.onSearch('emelt ');
    vi.advanceTimersByTime(299);
    expect(serviceMock.getCatalog.mock.calls.length).toBe(calls);
    vi.advanceTimersByTime(1);
    expect(serviceMock.getCatalog.mock.calls.length).toBe(calls + 1);
    expect(lastQuery()).toMatchObject({ q: 'emelt', page: 1 });
  });

  it('lapozás: előző/következő a határokon tiltva', () => {
    const fixture = create(of(page([row()], { totalCount: 45 })));
    expect(q(fixture, 'catalog-page')!.textContent).toContain('1. / 3 oldal');
    expect((q(fixture, 'catalog-prev') as HTMLButtonElement).disabled).toBe(true);
    q(fixture, 'catalog-next')!.click();
    expect(lastQuery().page).toBe(2);

    serviceMock.getCatalog.mockReturnValue(of(page([row()], { totalCount: 45, page: 3 })));
    fixture.componentInstance.goToPage(3);
    fixture.detectChanges();
    expect((q(fixture, 'catalog-next') as HTMLButtonElement).disabled).toBe(true);
    const before = serviceMock.getCatalog.mock.calls.length;
    fixture.componentInstance.goToPage(4);
    expect(serviceMock.getCatalog.mock.calls.length).toBe(before);
  });

  it('egy oldalnál nincs lapozó; üres találatnál üzenet', () => {
    const fixture = create(of(page([])));
    expect(q(fixture, 'catalog-paging')).toBeNull();
    expect(q(fixture, 'catalog-empty')!.textContent).toContain('Nincs a szűrésnek megfelelő feladatsor.');
  });

  it('az elavult (lassabb) válasz nem írja felül a frissebb szűrés eredményét', () => {
    const first = new Subject<CatalogPageDto>();
    const second = new Subject<CatalogPageDto>();
    const fixture = create(first);
    serviceMock.getCatalog.mockReturnValue(second);
    fixture.componentInstance.setLevel(3);
    expect(first.observed).toBe(false);

    second.next(page([row({ id: 30, title: 'Új szűrés' })]));
    first.next(page([row({ id: 31, title: 'Régi válasz' })]));
    fixture.detectChanges();
    expect(q(fixture, 'catalog-item-30')).not.toBeNull();
    expect(q(fixture, 'catalog-item-31')).toBeNull();
  });

  it('a kiválasztott kategória egy szűkebb válasz után is a listában marad', () => {
    const fixture = create(of(page([row()], { categories: [{ id: 2, name: 'Emelt' }, { id: 3, name: 'Közép' }] })));
    serviceMock.getCatalog.mockReturnValue(of(page([], { categories: [] })));
    fixture.componentInstance.setCategory(3);
    expect(fixture.componentInstance.categories().map((c) => c.id)).toEqual([2, 3]);
  });

  it('betöltési hibánál üzenet és Újra gomb', () => {
    const fixture = create(throwError(() => ({ status: 500 })));
    expect(q(fixture, 'catalog-load-error')!.textContent).toContain('A katalógus betöltése nem sikerült.');
    serviceMock.getCatalog.mockReturnValue(of(page()));
    (q(fixture, 'catalog-load-error')!.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(q(fixture, 'catalog-item-15')).not.toBeNull();
  });

  it('másolás: megerősítés → POST → toast → a másolat szerkesztője', async () => {
    const fixture = create();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);

    await fixture.componentInstance.copy(row());

    expect(confirmMock.ask).toHaveBeenCalledWith(expect.objectContaining({ confirmLabel: 'Másolás' }));
    expect(serviceMock.copyFromCatalog).toHaveBeenCalledWith(15, false);
    expect(toastMock.success).toHaveBeenCalledWith('„2024. május-június (másolat)” létrejött (4 feladat, 21 fájl) - most szerkesztheted.');
    expect(routerMock.navigate).toHaveBeenCalledWith(['/feladatsorok', 812, 'szerkesztes']);
    expect(closed).toHaveBeenCalled();
  });

  it('kihagyott fájloknál figyelmeztető toast', async () => {
    const fixture = create();
    serviceMock.copyFromCatalog.mockReturnValue(
      of({ taskSetId: 812, title: 'X', taskCount: 1, fileCount: 0, warnings: ['A(z) „x.txt” fájl kimaradt.', 'A 2. feladat leírása 5000 karakternél hosszabb - módosítás előtt rövidítsd.'] }),
    );
    await fixture.componentInstance.copy(row());
    expect(toastMock.warning).toHaveBeenCalledWith(expect.stringContaining('A(z) „x.txt” fájl kimaradt.'), 10000);
    expect(toastMock.warning.mock.calls[0][0]).toContain('módosítás előtt rövidítsd');
    expect(routerMock.navigate).toHaveBeenCalled();
  });

  it('a mégsem nem másol', async () => {
    const fixture = create();
    confirmMock.ask.mockResolvedValue(false);
    await fixture.componentInstance.copy(row());
    expect(serviceMock.copyFromCatalog).not.toHaveBeenCalled();
    expect(fixture.componentInstance.copyingId()).toBeNull();
  });

  it('már lemásolt sornál az „új másolat?” kérdés után copyAgain-nel kér', async () => {
    const fixture = create();
    await fixture.componentInstance.copy(row({ alreadyCopied: true }));
    expect(confirmMock.ask).toHaveBeenCalledTimes(1);
    expect(confirmMock.ask.mock.calls[0][0].message).toBe('Ezt a feladatsort már lemásoltad. Készítsek egy új másolatot?');
    expect(serviceMock.copyFromCatalog).toHaveBeenCalledWith(15, true);
    expect(routerMock.navigate).toHaveBeenCalledWith(['/feladatsorok', 812, 'szerkesztes']);
  });

  it('AlreadyCopied hibára megerősítés, majd copyAgain-nel újra küldi', async () => {
    const fixture = create();
    serviceMock.copyFromCatalog
      .mockReturnValueOnce(throwError(() => ({ status: 400, error: { errorType: 'AlreadyCopied', errorMessage: 'Ezt a feladatsort már lemásoltad.' } })))
      .mockReturnValueOnce(of({ taskSetId: 813, title: 'X (másolat)', taskCount: 4, fileCount: 2, warnings: [] }));
    await fixture.componentInstance.copy(row());
    await vi.waitFor(() => expect(serviceMock.copyFromCatalog).toHaveBeenCalledTimes(2));

    expect(confirmMock.ask).toHaveBeenCalledTimes(2);
    expect(confirmMock.ask.mock.calls[1][0].message).toBe('Ezt a feladatsort már lemásoltad. Készítsek egy új másolatot?');
    expect(serviceMock.copyFromCatalog.mock.calls[1]).toEqual([15, true]);
    expect(routerMock.navigate).toHaveBeenCalledWith(['/feladatsorok', 813, 'szerkesztes']);
  });

  it('AlreadyCopied hibánál a mégsem nem másol újra, és nem mutat hibát', async () => {
    const fixture = create();
    confirmMock.ask.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    serviceMock.copyFromCatalog.mockReturnValue(throwError(() => ({ status: 400, error: { errorType: 'AlreadyCopied', errorMessage: 'x' } })));
    await fixture.componentInstance.copy(row());
    await vi.waitFor(() => expect(fixture.componentInstance.copyingId()).toBeNull());
    expect(serviceMock.copyFromCatalog).toHaveBeenCalledTimes(1);
    expect(fixture.componentInstance.copyError()).toBeNull();
  });

  it('a sorok mutatják, milyen hozzáférést örököl a másolat', () => {
    const fixture = create(of(page([row(), row({ id: 16, isFree: false }), row({ id: 17, isPremium: true, isFree: false })])));
    expect(q(fixture, 'catalog-access-15')!.textContent).toContain('Ingyenes – minden diákod eléri.');
    expect(q(fixture, 'catalog-access-16')!.textContent).toContain('Fizetős – a diákjaidnak előfizetés vagy iskolai licenc kell hozzá; dolgozatban mindenki elérheti');
    expect(q(fixture, 'catalog-access-17')!.textContent).toContain('Fizetős');
  });

  it('dupla kattintásra egyetlen másolás indul; nem másolható sornál semmi', async () => {
    const fixture = create();
    const pending = new Subject<never>();
    serviceMock.copyFromCatalog.mockReturnValue(pending);
    const a = fixture.componentInstance.copy(row());
    const b = fixture.componentInstance.copy(row());
    await Promise.all([a, b]);
    expect(confirmMock.ask).toHaveBeenCalledTimes(1);
    expect(serviceMock.copyFromCatalog).toHaveBeenCalledTimes(1);
    fixture.detectChanges();
    expect(q(fixture, 'catalog-copy-15')!.textContent).toContain('Másolás…');
    expect((q(fixture, 'catalog-copy-15') as HTMLButtonElement).disabled).toBe(true);

    await fixture.componentInstance.copy(row({ id: 16, canCopy: false }));
    expect(confirmMock.ask).toHaveBeenCalledTimes(1);
  });

  it('a BE hibaüzenete olvashatóan megjelenik, és újra lehet próbálni', async () => {
    const fixture = create();
    serviceMock.copyFromCatalog.mockReturnValue(
      throwError(() => ({ status: 400, error: { errorMessage: 'Ezt a feladatsort az imént már átmásoltad - a másolatot a saját feladatsoraid között találod.' } })),
    );
    await fixture.componentInstance.copy(row());
    fixture.detectChanges();
    expect(q(fixture, 'catalog-copy-error')!.textContent).toContain('az imént már átmásoltad');
    expect(q(fixture, 'catalog-copy-error')!.getAttribute('role')).toBe('alert');
    expect(fixture.componentInstance.copyingId()).toBeNull();
    expect(routerMock.navigate).not.toHaveBeenCalled();
  });

  it('hibaüzenetek: prémium/kvóta a BE szövegével, 429 és hálózati hiba saját szöveggel', () => {
    expect(copyErrorMessage({ status: 400, error: { errorMessage: 'Elérted a feladatsor-kvótádat, új feladatsor nem hozható létre.' } })).toContain('kvótádat');
    expect(copyErrorMessage({ status: 400, error: { errorMessage: 'Ez a hivatalos feladatsor Prémium tartalom.' } })).toContain('Prémium');
    expect(copyErrorMessage({ status: 429, error: { error: 'Too many requests', message: 'Kérjük várjon' } })).toContain('túl sok másolást');
    expect(copyErrorMessage({ status: 0 })).toContain('internetkapcsolatot');
    expect(copyErrorMessage({ status: 500 })).toBe('A másolás nem sikerült.');
  });

  it('dialógus szerepű, Escape-re és a bezáró gombbal záródik', () => {
    const fixture = create();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    const dialog = q(fixture, 'catalog-dialog')!;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed).toHaveBeenCalledTimes(1);
    q(fixture, 'catalog-close')!.click();
    expect(closed).toHaveBeenCalledTimes(2);
  });

  it('a háttér fixed, kattintásra bezár', () => {
    const fixture = create();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    const backdrop = q(fixture, 'catalog-backdrop')!;
    expect(backdrop.classList).toContain('fixed');
    expect(backdrop.classList).not.toContain('absolute');
    backdrop.click();
    expect(closed).toHaveBeenCalled();
  });
});
