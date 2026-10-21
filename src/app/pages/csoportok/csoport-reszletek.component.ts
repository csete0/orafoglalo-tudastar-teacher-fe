import {
  afterNextRender, ChangeDetectionStrategy, Component, computed, DestroyRef, DOCUMENT, effect, inject, Injector, input,
  OnInit, signal, untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { of, switchMap, take } from 'rxjs';
import { GroupStore } from '../../services/group/group.store';
import { MockExamService } from '../../services/mock-exam/mock-exam.service';
import { TeacherTechnikumService } from '../../services/technikum/teacher-technikum.service';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { CopyButtonComponent } from '../../shared/copy-button/copy-button.component';
import { ReportDateRange, DEFAULT_RANGE_KEY, ReportRangeKey } from '../../shared/date-range/report-date-range';
import { CSOPORT_TABS, CsoportTab, resolveCsoportTab } from './fulek/csoport-fulek';
import { CsoportAttekintesComponent } from './fulek/csoport-attekintes.component';
import { CsoportDiakokComponent } from './fulek/csoport-diakok.component';
import { CsoportKiadasokComponent } from './fulek/csoport-kiadasok.component';
import { CsoportEredmenyekComponent } from './fulek/csoport-eredmenyek.component';
import { CsoportTechnikumComponent } from './fulek/csoport-technikum.component';
import { CsoportBeallitasokComponent } from './fulek/csoport-beallitasok.component';

/**
 * Csoportoldal: fejléc (morzsa, létszám, meghívó kód, Élő játék, + Kiadás) + 6 fül. A fül a `?tab=` query-paraméterben
 * él (könyvjelzőzhető, `replaceUrl`, így a Vissza gomb nem gyűlik fel); a 9 fülös oldal régi értékeit a
 * `LEGACY_TAB` map az új fülre (és szakaszra) írja át.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-csoport-reszletek',
  imports: [
    RouterLink, LocalSpinnerComponent, CopyButtonComponent, CsoportAttekintesComponent, CsoportDiakokComponent,
    CsoportKiadasokComponent, CsoportEredmenyekComponent, CsoportTechnikumComponent, CsoportBeallitasokComponent,
  ],
  template: `
    @if (store.selectedGroup(); as group) {
      <div class="page-wide">
        <header class="flex flex-wrap items-center gap-3 mb-4">
          <div class="flex-1 min-w-0">
            <nav aria-label="Morzsa" class="text-xs text-text-muted">
              <a routerLink="/csoportok" class="hover:underline">Csoportok</a> ›
              <span aria-current="page">{{ group.name }}</span>
            </nav>
            <div class="flex items-center gap-2 flex-wrap min-w-0">
              <h1 class="text-2xl font-bold min-w-0 truncate">{{ group.name }}</h1>
              <span class="text-sm text-text-muted" data-testid="group-header-meta">
                · {{ store.members().length }} diák@if (group.schoolName) { · {{ group.schoolName }}}
              </span>
              @if (mockExamRegistered()) {
                <a routerLink="/probaerettsegi" class="badge badge-warning shrink-0" data-testid="group-mock-exam-badge"
                   title="A csoport jelentkeztetve van a próbaérettségire">Próbaérettségi</a>
              }
              @if (group.isArchived) {
                <span class="badge badge-neutral shrink-0">Archivált</span>
              }
            </div>
          </div>
          @if (!group.isArchived) {
            <span class="flex items-center gap-1 rounded-lg border border-border-default bg-bg-panel pl-2.5 pr-1 py-0.5 text-sm"
                  data-testid="group-invite-chip">
              Meghívó kód: <code class="font-mono font-bold">{{ group.inviteCode }}</code>
              <app-copy-button [value]="group.inviteCode" label="Meghívó kód" />
            </span>
            <button type="button" class="btn btn-ghost" (click)="selectTab('kiadasok', 'kvizek')">Élő játék</button>
            <a routerLink="/feladatsorok" class="btn btn-primary">+ Kiadás</a>
          }
        </header>

        <!-- UI-TT-179: valódi tab-widget (role="tablist"/"tab" + aria-selected). -->
        <div class="flex gap-4 border-b border-border-default mb-6 overflow-x-auto" role="tablist" aria-label="Csoport nézetek">
          @for (option of tabs(); track option.value) {
            <button type="button" (click)="selectTab(option.value)" class="tab-btn"
              [class.tab-btn-active]="tab() === option.value" [id]="'csoport-tab-' + option.value"
              role="tab" [attr.aria-selected]="tab() === option.value" aria-controls="csoport-tabpanel">
              {{ option.label }}
            </button>
          }
        </div>

        @if (store.error()) {
          <p class="text-danger text-sm mb-4">{{ store.error() }}</p>
        }

        <div id="csoport-tabpanel" role="tabpanel" [attr.aria-labelledby]="'csoport-tab-' + tab()">
          @switch (tab()) {
            @case ('attekintes') {
              <app-csoport-attekintes [groupId]="group.id" [showTerkep]="terkepVisible()"
                (openTab)="selectTab($event.tab, $event.section)" (csapatokUnavailable)="csapatokVisible.set(false)" />
            }
            @case ('diakok') { <app-csoport-diakok [groupId]="group.id" (openInvite)="selectTab('beallitasok', 'meghivo')" /> }
            @case ('kiadasok') { <app-csoport-kiadasok [groupId]="group.id" /> }
            @case ('eredmenyek') { <app-csoport-eredmenyek [groupId]="group.id" [(rangeKey)]="rangeKey" [(range)]="range" /> }
            @case ('technikum') {
              <app-csoport-technikum [groupId]="group.id" [showTerkep]="terkepVisible()" [showCsapatok]="csapatokVisible()"
                (terkepUnavailable)="terkepVisible.set(false); leaveHiddenTechnikum()"
                (csapatokUnavailable)="csapatokVisible.set(false); leaveHiddenTechnikum()" />
            }
            @case ('beallitasok') { <app-csoport-beallitasok [group]="group" /> }
          }
        </div>
      </div>
    } @else if (store.loading()) {
      <app-local-spinner />
    } @else {
      <p class="text-text-muted text-center py-10">A csoport nem található.</p>
    }
  `,
})
export class CsoportReszletekComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly mockExamService = inject(MockExamService);
  private readonly technikumApi = inject(TeacherTechnikumService);
  readonly store = inject(GroupStore);

  /** A `?tab=` query-paraméter (withComponentInputBinding). */
  readonly tabParam = input<string | undefined>(undefined, { alias: 'tab' });

  /** Prémium tanár + bekapcsolt modul (api/technikum/me: visible ÉS hasPremium); a térkép késői 404-e is elrejti. */
  readonly terkepVisible = signal(false);
  /** Vizsgaremek-csapatok; a kikapcsolt Git-funkció 404-e (unavailable) elrejti. */
  readonly csapatokVisible = signal(true);
  readonly technikumVisible = computed(() => this.terkepVisible() || this.csapatokVisible());

  readonly tabs = computed(() => CSOPORT_TABS.filter((t) => t.value !== 'technikum' || this.technikumVisible()));
  readonly tab = computed<CsoportTab>(() => {
    const { tab } = resolveCsoportTab(this.tabParam());
    return tab === 'technikum' && !this.technikumVisible() ? 'attekintes' : tab;
  });

  /** Az Eredmények fül dátumszűrője - itt él, hogy fülváltás után is megmaradjon (UI-TT-178/180). */
  readonly rangeKey = signal<ReportRangeKey>(DEFAULT_RANGE_KEY);
  readonly range = signal<ReportDateRange>({});

  /** A csoport jelentkeztetve van az aktuális próbaérettségire (a fejléc jelvényéhez). */
  readonly mockExamRegistered = signal(false);

  private groupId = 0;

  constructor() {
    // Régi (9 fülös) vagy ismeretlen `?tab=` érték → átírás a kanonikus fülre (+ szakasz-horgony).
    effect(() => {
      const raw = this.tabParam();
      if (raw === undefined) return;
      const target = resolveCsoportTab(raw);
      if (raw !== target.tab) untracked(() => this.selectTab(target.tab, target.section));
    });
  }

  ngOnInit(): void {
    this.technikumApi.me().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (me) => this.terkepVisible.set(me.visible && me.hasPremium),
      error: () => this.terkepVisible.set(false),
    });
    this.groupId = Number(this.route.snapshot.paramMap.get('id'));
    this.loadMockExamBadge(this.groupId);
    if (this.store.groups().length === 0) {
      this.store.loadMine();
    }
    this.store.select(this.groupId);
    this.store.loadMembers(this.groupId);
    const fragment = this.route.snapshot.fragment;
    if (fragment) this.scrollToSection(fragment);
  }

  selectTab(tab: CsoportTab, section?: string): void {
    // UI-TT-67: a GroupStore hibája a közös blokkban látszik - fülváltáskor ne maradjon idegen kontextusban.
    this.store.clearError();
    void this.router
      .navigate([], { relativeTo: this.route, queryParams: { tab }, fragment: section, replaceUrl: true })
      .then(() => {
        if (section) this.scrollToSection(section);
      });
  }

  /** A Technikum fül eltűnt (egyik blokk sem elérhető) - ne maradjon a nem látható fülön. */
  leaveHiddenTechnikum(): void {
    if (!this.technikumVisible()) this.selectTab('attekintes');
  }

  private scrollToSection(id: string): void {
    afterNextRender(() => this.document.getElementById(id)?.scrollIntoView({ block: 'start' }), { injector: this.injector });
  }

  private loadMockExamBadge(groupId: number): void {
    this.mockExamService.getCurrent().pipe(
      switchMap((current) => (current ? this.mockExamService.get(current.slug) : of(null))),
      take(1),
    ).subscribe({
      next: (ev) => this.mockExamRegistered.set(!!ev?.groups.find((g) => g.groupId === groupId)?.registered),
      error: () => this.mockExamRegistered.set(false),
    });
  }
}
