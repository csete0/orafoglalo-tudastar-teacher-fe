import { ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, OnInit, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { catchError, debounceTime, map, of, Subject, switchMap } from 'rxjs';
import { CatalogPageDto, CatalogQuery, CatalogTaskSetDto } from '../../models/teacher-content.model';
import { TeacherTaskSetService } from '../../services/teacher-taskset/teacher-taskset.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';
import { FREE_ACCESS_TEXT, isPaidAccess, PAID_ACCESS_TEXT } from './hozzaferes.util';

export const CATALOG_PAGE_SIZE = 20;
/** A BE ennél rövidebb keresőszöt nem vesz figyelembe. */
const MIN_SEARCH = 2;
const FIRST_YEAR = 2005;

const LEVELS = [
  { id: 1, label: 'Kezdő' },
  { id: 2, label: 'Középhaladó' },
  { id: 3, label: 'Haladó' },
];

/** Miért nem másolható egy sor (canCopy=false) - a BE szabálya szerint. */
export function copyBlockedReason(item: CatalogTaskSetDto): string {
  if (item.isPremium) return 'Prémium tartalom - a másolásához Prémium előfizetés kell.';
  if (!item.isFree) return 'Fizetős tartalom - a másolásához előfizetés kell.';
  return 'Ezt a feladatsort most nem másolhatod.';
}

/** A másolás hibája érthető magyar mondatként (a rate limiter 429-es válasza nem `errorMessage` alakú). */
export function copyErrorMessage(err: unknown): string {
  const status = (err as { status?: number })?.status;
  if (status === 429) return 'Rövid időn belül túl sok másolást indítottál - várj néhány percet, és próbáld újra.';
  if (status === 0) return 'Nem sikerült elérni a szervert - ellenőrizd az internetkapcsolatot, és próbáld újra.';
  return extractErrorMessage(err, 'A másolás nem sikerült.');
}

type LoadResult = { page: CatalogPageDto } | { error: string };

/**
 * „Másolás a katalógusból”: a platform hivatalos feladatsorai közül egy átmásolható a tanár saját, nem publikált
 * feladatsorai közé (feladatok, részfeladatok, megoldások, fájlok, jóváhagyott szempontlista), utána szabadon szerkeszthető.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-katalogus-masolas',
  standalone: true,
  imports: [FormsModule, IconComponent],
  template: `
    <div class="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" (keydown.escape)="close()">
      <!-- fixed, nem absolute: a görgethető ablak-tartalom alatt is az egész képernyőt takarja. -->
      <div class="fixed inset-0 bg-black/40" data-testid="catalog-backdrop" (click)="close()"></div>
      <div #dialog role="dialog" aria-modal="true" aria-labelledby="catalog-title" aria-describedby="catalog-help" tabindex="-1"
        data-testid="catalog-dialog" class="card relative w-full max-w-3xl min-w-0 p-4 sm:p-6 shadow-xl my-8 sm:my-auto outline-none">
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="icon-tile icon-tile-primary shrink-0"><app-icon name="clipboard-list" class="w-5 h-5 block" /></div>
            <h2 id="catalog-title" class="font-bold text-lg">Másolás a katalógusból</h2>
          </div>
          <button type="button" class="btn btn-ghost !p-1.5" aria-label="Bezárás" (click)="close()" data-testid="catalog-close">
            <app-icon name="x" class="w-5 h-5 block" />
          </button>
        </div>
        <p id="catalog-help" class="text-sm text-text-muted mb-4">
          A platform hivatalos feladatsorai közül választhatsz. A másolat a saját feladatsoraid közé kerül nem publikált
          piszkozatként (feladatokkal, megoldásokkal, fájlokkal és szempontlistával), és utána szabadon szerkesztheted.
        </p>

        <!-- A keresőmező saját sort kap, a három szűrő alatta egyenlő, zsugorodó oszlopokban: korábban a selectek a leghosszabb
             opciójuk szélességét foglalták (auto), és 1280 px-en a keresőnek szinte semmi nem maradt. -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3" data-testid="catalog-filters">
          <input type="search" class="input sm:col-span-3" placeholder="Keresés cím vagy kategória szerint…" aria-label="Keresés cím vagy kategória szerint"
            [ngModel]="searchText()" (ngModelChange)="onSearch($event)" [ngModelOptions]="{ standalone: true }" data-testid="catalog-search" />
          <select class="input min-w-0 truncate" aria-label="Kategória" [ngModel]="categoryId()" (ngModelChange)="setCategory($event)" [ngModelOptions]="{ standalone: true }"
            data-testid="catalog-category">
            <option [ngValue]="null">Minden kategória</option>
            @for (c of categories(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }
          </select>
          <select class="input min-w-0 truncate" aria-label="Szint" [ngModel]="levelId()" (ngModelChange)="setLevel($event)" [ngModelOptions]="{ standalone: true }"
            data-testid="catalog-level">
            <option [ngValue]="null">Minden szint</option>
            @for (l of levels; track l.id) { <option [ngValue]="l.id">{{ l.label }}</option> }
          </select>
          <select class="input min-w-0 truncate" aria-label="Év" [ngModel]="year()" (ngModelChange)="setYear($event)" [ngModelOptions]="{ standalone: true }"
            data-testid="catalog-year">
            <option [ngValue]="null">Minden év</option>
            @for (y of years; track y) { <option [ngValue]="y">{{ y }}</option> }
          </select>
        </div>
        @if (searchText().trim().length > 0 && searchText().trim().length < minSearch) {
          <p class="text-xs text-text-muted -mt-1 mb-3" data-testid="catalog-search-hint">Legalább {{ minSearch }} karakter kell a kereséshez.</p>
        }

        @if (copyError()) {
          <p class="bg-danger-subtle border border-danger/40 rounded-xl p-3 mb-3 text-sm text-danger" role="alert" data-testid="catalog-copy-error">{{ copyError() }}</p>
        }

        <div aria-live="polite" [attr.aria-busy]="loading()">
          @if (loadError()) {
            <div class="text-sm text-danger flex flex-wrap items-center gap-3 py-4" data-testid="catalog-load-error">
              <span>{{ loadError() }}</span>
              <button type="button" class="btn btn-ghost !px-3 !py-1" (click)="load()">Újra</button>
            </div>
          } @else if (loading() && !result()) {
            <div class="space-y-2" data-testid="catalog-loading">
              <div class="skeleton h-16"></div>
              <div class="skeleton h-16"></div>
              <div class="skeleton h-16"></div>
            </div>
          } @else if (result(); as r) {
            <p class="text-xs text-text-muted mb-2" data-testid="catalog-count">{{ r.totalCount }} feladatsor</p>
            <ul class="space-y-2" [class.opacity-60]="loading()" data-testid="catalog-list">
              @for (item of r.items; track item.id) {
                <li class="bg-bg-element rounded-xl p-3 flex flex-wrap items-center gap-3" [attr.data-testid]="'catalog-item-' + item.id">
                  <div class="min-w-0 flex-[1_1_14rem]">
                    <p class="font-semibold break-words">{{ item.title }}</p>
                    <p class="text-xs text-text-muted break-words">
                      {{ item.categoryName ?? 'Kategória nélkül' }} · {{ levelLabel(item) }}{{ item.year ? ' · ' + item.year : '' }} · {{ item.taskCount }} feladat
                    </p>
                    <p class="text-xs mt-1 break-words" [class.text-warning]="isPaid(item)" [class.text-success]="!isPaid(item)"
                      [attr.data-testid]="'catalog-access-' + item.id">{{ accessText(item) }}</p>
                    @if (item.isPremium || item.alreadyCopied) {
                      <div class="flex flex-wrap gap-1.5 mt-1">
                        @if (item.isPremium) { <span class="badge badge-primary" [attr.data-testid]="'catalog-premium-' + item.id">Prémium</span> }
                        @if (item.alreadyCopied) { <span class="badge badge-success" [attr.data-testid]="'catalog-copied-' + item.id">Már lemásoltad</span> }
                      </div>
                    }
                  </div>
                  <div class="shrink-0 flex flex-col items-end gap-1 max-w-full">
                    <span [attr.title]="item.canCopy ? null : blockedReason(item)">
                      <button type="button" class="btn btn-primary !px-3 !py-1.5" (click)="copy(item)"
                        [disabled]="!item.canCopy || copyingId() !== null" [attr.aria-describedby]="item.canCopy ? null : 'catalog-blocked-' + item.id"
                        [attr.aria-label]="'„' + item.title + '” másolása'" [attr.data-testid]="'catalog-copy-' + item.id">
                        {{ copyingId() === item.id ? 'Másolás…' : 'Másolás' }}
                      </button>
                    </span>
                    @if (!item.canCopy) {
                      <span class="text-xs text-text-muted text-right" [id]="'catalog-blocked-' + item.id">{{ blockedReason(item) }}</span>
                    }
                  </div>
                </li>
              } @empty {
                <li class="text-sm text-text-muted py-6 text-center" data-testid="catalog-empty">Nincs a szűrésnek megfelelő feladatsor.</li>
              }
            </ul>

            @if (totalPages() > 1) {
              <nav class="flex items-center justify-between gap-2 mt-4" aria-label="Lapozás" data-testid="catalog-paging">
                <button type="button" class="btn btn-ghost !px-3 !py-1" (click)="goToPage(page() - 1)" [disabled]="page() <= 1 || loading()"
                  data-testid="catalog-prev">Előző</button>
                <span class="text-sm text-text-muted" data-testid="catalog-page">{{ page() }}. / {{ totalPages() }} oldal</span>
                <button type="button" class="btn btn-ghost !px-3 !py-1" (click)="goToPage(page() + 1)" [disabled]="page() >= totalPages() || loading()"
                  data-testid="catalog-next">Következő</button>
              </nav>
            }
          }
        </div>
      </div>
    </div>
  `,
})
export class KatalogusMasolasComponent implements OnInit {
  private readonly service = inject(TeacherTaskSetService);
  private readonly confirmService = inject(ConfirmService);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly closed = output<void>();

  readonly levels = LEVELS;
  readonly minSearch = MIN_SEARCH;
  readonly years = Array.from({ length: new Date().getFullYear() - FIRST_YEAR + 1 }, (_, i) => new Date().getFullYear() - i);

  readonly searchText = signal('');
  /** A ténylegesen alkalmazott (késleltetett, legalább 2 karakteres) keresőszó. */
  private readonly appliedSearch = signal<string | null>(null);
  readonly categoryId = signal<number | null>(null);
  readonly levelId = signal<number | null>(null);
  readonly year = signal<number | null>(null);
  readonly page = signal(1);

  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);
  readonly result = signal<CatalogPageDto | null>(null);
  /** A szűrő kategóriái - összegyűjtve, hogy a kiválasztott ne tűnjön el egy szűkebb válasz után. */
  private readonly knownCategories = signal<Map<number, string>>(new Map());
  readonly categories = computed(() =>
    [...this.knownCategories()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'hu')),
  );
  readonly totalPages = computed(() => {
    const r = this.result();
    return r ? Math.max(1, Math.ceil(r.totalCount / (r.pageSize || CATALOG_PAGE_SIZE))) : 1;
  });

  readonly copyingId = signal<number | null>(null);
  readonly copyError = signal<string | null>(null);

  private readonly search$ = new Subject<string>();
  /** A kérések sora - switchMap: az új szűrés megszakítja a korábbit, elavult válasz nem írhat felül frissebbet. */
  private readonly requests$ = new Subject<CatalogQuery>();
  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  constructor() {
    this.search$
      .pipe(
        debounceTime(300),
        map((text) => (text.trim().length >= MIN_SEARCH ? text.trim() : null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((q) => {
        // Ugyanaz a tényleges szűrés (pl. 1 karakter, vagy csak szóköz változott): nincs új kérés, a lap marad.
        if (q === this.appliedSearch()) return;
        this.appliedSearch.set(q);
        this.page.set(1);
        this.load();
      });

    this.requests$
      .pipe(
        switchMap((query) =>
          this.service.getCatalog(query).pipe(
            map((page): LoadResult => ({ page })),
            catchError((err) => of<LoadResult>({ error: extractErrorMessage(err, 'A katalógus betöltése nem sikerült.') })),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res) => {
        this.loading.set(false);
        if ('error' in res) {
          this.loadError.set(res.error);
          return;
        }
        this.loadError.set(null);
        this.result.set(res.page);
        this.knownCategories.update((current) => {
          const next = new Map(current);
          for (const c of res.page.categories) next.set(c.id, c.name);
          return next;
        });
      });
  }

  ngOnInit(): void {
    this.load();
    setTimeout(() => this.dialog()?.nativeElement.focus());
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.requests$.next({
      q: this.appliedSearch(),
      categoryId: this.categoryId(),
      levelId: this.levelId(),
      year: this.year(),
      page: this.page(),
      pageSize: CATALOG_PAGE_SIZE,
    });
  }

  onSearch(text: string): void {
    this.searchText.set(text);
    this.search$.next(text);
  }

  setCategory(id: number | null): void {
    this.categoryId.set(id);
    this.resetAndLoad();
  }

  setLevel(id: number | null): void {
    this.levelId.set(id);
    this.resetAndLoad();
  }

  setYear(year: number | null): void {
    this.year.set(year);
    this.resetAndLoad();
  }

  private resetAndLoad(): void {
    this.page.set(1);
    this.load();
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.page()) return;
    this.page.set(page);
    this.load();
  }

  levelLabel(item: CatalogTaskSetDto): string {
    return LEVELS.find((l) => l.id === item.levelId)?.label ?? item.levelName ?? '';
  }

  isPaid(item: CatalogTaskSetDto): boolean {
    return isPaidAccess(item);
  }

  /** A másolat a forrás hozzáférését örökli - ezt látja a tanár már a választáskor. */
  accessText(item: CatalogTaskSetDto): string {
    return this.isPaid(item) ? PAID_ACCESS_TEXT : FREE_ACCESS_TEXT;
  }

  blockedReason(item: CatalogTaskSetDto): string {
    return copyBlockedReason(item);
  }

  async copy(item: CatalogTaskSetDto): Promise<void> {
    // Dupla kattintás / párhuzamos másolás ellen: amíg egy fut (a megerősítéssel együtt), újat nem indítunk.
    if (!item.canCopy || this.copyingId() !== null) return;
    this.copyingId.set(item.id);
    this.copyError.set(null);
    // A már lemásolt sornál rögtön az „új másolat?” kérdés jön (és copyAgain-nel megy a kérés).
    const confirmed = item.alreadyCopied
      ? await this.askCopyAgain()
      : await this.confirmService.ask({
          title: 'Másolás a katalógusból',
          message:
            `A(z) „${item.title}” (${item.taskCount} feladat) a saját feladatsoraid közé kerül nem publikált piszkozatként, ` +
            `feladatokkal, megoldásokkal, fájlokkal és szempontlistával. Utána szabadon szerkesztheted. ${this.accessText(item)}`,
          confirmLabel: 'Másolás',
          cancelLabel: 'Mégsem',
        });
    if (!confirmed) {
      this.copyingId.set(null);
      return;
    }
    this.send(item, item.alreadyCopied);
  }

  private askCopyAgain(): Promise<boolean> {
    return this.confirmService.ask({
      title: 'Már lemásoltad',
      message: 'Ezt a feladatsort már lemásoltad. Készítsek egy új másolatot?',
      confirmLabel: 'Új másolat',
      cancelLabel: 'Mégsem',
    });
  }

  private send(item: CatalogTaskSetDto, copyAgain: boolean): void {
    this.service
      .copyFromCatalog(item.id, copyAgain)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.copyingId.set(null);
          const summary = `„${res.title}” létrejött (${res.taskCount} feladat, ${res.fileCount} fájl) - most szerkesztheted.`;
          if (res.warnings.length > 0) this.toastService.warning(`${summary} Figyelem: ${res.warnings.join(' ')}`, 10000);
          else this.toastService.success(summary);
          this.closed.emit();
          this.router.navigate(['/feladatsorok', res.taskSetId, 'szerkesztes']);
        },
        error: async (err) => {
          // A lista elavult volt (közben lemásolta): megerősítés után új példány.
          if (!copyAgain && err?.error?.errorType === 'AlreadyCopied') {
            if (await this.askCopyAgain()) {
              this.send(item, true);
              return;
            }
            this.copyingId.set(null);
            return;
          }
          this.copyingId.set(null);
          this.copyError.set(copyErrorMessage(err));
        },
      });
  }

  close(): void {
    if (this.copyingId() !== null) return;
    this.closed.emit();
  }
}
