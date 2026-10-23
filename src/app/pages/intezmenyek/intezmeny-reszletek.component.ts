import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SchoolStore } from '../../services/school/school.store';
import { ReportStore } from '../../services/report/report.store';
import { LeaderboardStore } from '../../services/leaderboard/leaderboard.store';
import { LeaderboardCategory, LeaderboardPeriod } from '../../models/leaderboard.model';
import { SchoolDto } from '../../models/school.model';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { DateRangeFilterComponent } from '../../shared/date-range-filter/date-range-filter.component';
import { LeaderboardPanelComponent } from '../../shared/leaderboard-panel/leaderboard-panel.component';
import { IntezmenyOsztalyokComponent } from './intezmeny-osztalyok.component';
import { IntezmenyTanarokComponent } from './intezmeny-tanarok.component';
import { IntezmenyLicencComponent } from './intezmeny-licenc.component';
import { ariaSort, SortHeaderComponent, SortState, sortRows } from '../../shared/sort-header/sort-header.component';
import { DEFAULT_RANGE_KEY, ReportDateRange, ReportRangeKey, toDateInputValue, toDateInputValueExclusiveEnd } from '../../shared/date-range/report-date-range';

type Tab = 'tanarok' | 'ranglista' | 'attekintes' | 'csoportok' | 'licenc';

/**
 * A `isSelectedAdmin` (SchoolStore, a betöltött SchoolDto.myRole mezőjéből
 * számított computed) dönti el, mely fülek/gombok látszanak — SOSEM route-
 * guard, mert egy tanár egyszerre lehet igazgató az egyik és sima tag a
 * másik intézményében.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-intezmeny-reszletek',
  standalone: true,
  imports: [RouterLink, IconComponent, LocalSpinnerComponent, DateRangeFilterComponent, SortHeaderComponent, LeaderboardPanelComponent,
    IntezmenyOsztalyokComponent, IntezmenyTanarokComponent, IntezmenyLicencComponent],
  template: `
    @if (school.selectedSchool(); as s) {
      <div class="mx-auto px-4 py-10" [class.max-w-3xl]="tab() !== 'csoportok'" [class.max-w-6xl]="tab() === 'csoportok'">
        <div class="flex justify-between items-start mb-1 gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="icon-tile icon-tile-primary">
              <app-icon name="building" class="w-6 h-6 block" />
            </div>
            <h1 class="page-title truncate">{{ s.name }}</h1>
            <span class="badge shrink-0" data-testid="my-role-badge"
              [class]="s.myRole === 'Admin' ? 'badge-primary' : 'badge-neutral'">
              {{ s.myRole === 'Admin' ? 'Igazgató' : 'Tanár' }}</span>
          </div>
          <button (click)="leave(s.id)" class="btn btn-danger shrink-0">Kilépés</button>
        </div>
        <div class="hairline"></div>

        <!-- UI-TT-179: valódi, tartalom-váltó tab-widget - a wrapper role="tablist",
             a gombok role="tab" + aria-selected nélkül egy képernyőolvasó-felhasználó
             számára 4 néma, állapot nélküli "gomb"-ként hangzott el. -->
        <nav class="flex gap-4 border-b border-border-default mb-6 overflow-x-auto" role="tablist" aria-label="Intézmény nézetek">
          <button (click)="setTab('tanarok')" class="tab-btn" [class.tab-btn-active]="tab() === 'tanarok'"
            role="tab" [attr.aria-selected]="tab() === 'tanarok'">
            Tanárok
          </button>
          <button (click)="setTab('ranglista')" class="tab-btn" [class.tab-btn-active]="tab() === 'ranglista'"
            role="tab" [attr.aria-selected]="tab() === 'ranglista'">
            Ranglista
          </button>
          @if (school.isSelectedAdmin()) {
            <button (click)="setTab('attekintes')" class="tab-btn" [class.tab-btn-active]="tab() === 'attekintes'"
              role="tab" [attr.aria-selected]="tab() === 'attekintes'">
              Áttekintés
            </button>
            <button (click)="setTab('csoportok')" class="tab-btn" [class.tab-btn-active]="tab() === 'csoportok'"
              role="tab" [attr.aria-selected]="tab() === 'csoportok'">
              Csoportok
            </button>
            <button (click)="setTab('licenc')" class="tab-btn" [class.tab-btn-active]="tab() === 'licenc'"
              role="tab" [attr.aria-selected]="tab() === 'licenc'" data-testid="licenc-tab-btn">
              Licenc
            </button>
          }
        </nav>

        @if (school.error()) {
          <p class="text-danger text-sm mb-4">{{ school.error() }}</p>
        }

        @switch (tab()) {
          @case ('tanarok') {
            <app-intezmeny-tanarok [school]="s" [(editName)]="editName" />
          }

          @case ('ranglista') {
            <app-leaderboard-panel [(category)]="category" [(period)]="period" (selectionChange)="loadLeaderboard(s.id)"
              [entries]="leaderboard.leaderboard()?.topEntries" [error]="leaderboard.error()" />
          }

          @case ('attekintes') {
            <!-- BE-INTEZMENYRESZLETEK-ADMINTAB-BODY-NOT-REGATED: a nav-gombok fent
                 isSelectedAdmin() mögé vannak zárva, de ez a fül-TEST korábban
                 kizárólag a tab() értékétől függött - ha az admin-jog a fül
                 megtekintése közben szűnik meg (más admin által, _schools frissítés
                 nélkül), a tartalom befagyva tovább jelent volna meg, és a visszalépés
                 gombja is eltűnt (mert az is isSelectedAdmin()-en múlik). Nem
                 adatszivárgás (a backend minden lekérdezést újra jogosultság-ellenőriz),
                 csak zavaró, beragadt UI. -->
            @if (school.isSelectedAdmin()) {
              <!-- UI-TT-178: az @switch/@case ág minden fülváltáskor destroy+recreate-eli ezt a
                   komponenst - az initialRangeKey/initialCustomFrom/initialCustomTo inputok
                   nélkül a legördülő mindig "Teljes időszak"-ra ugrana vissza, holott a
                   lekérdezés maga (lent) a perzisztált range()-t használja tovább. -->
              <app-date-range-filter class="block mb-4" [initialRangeKey]="rangeKey()"
                [initialCustomFrom]="customFromValue()" [initialCustomTo]="customToValue()"
                (rangeChange)="applyRange($event)" />
              @if (report.error()) {
                <p class="text-danger text-sm mb-4">{{ report.error() }}</p>
              } @else {
                <div class="card overflow-hidden">
                  <div class="data-table-scroll">
                    <table class="data-table">
                      <thead>
                        <tr>
                          <th class="sticky-col" [attr.aria-sort]="ariaSort('name')">
                            <app-sort-header key="name" [state]="overviewSort()" (sortChange)="overviewSort.set($event)">Diák</app-sort-header>
                          </th>
                          <th class="text-right" [attr.aria-sort]="ariaSort('exams')">
                            <app-sort-header key="exams" [state]="overviewSort()" (sortChange)="overviewSort.set($event)">Vizsgák</app-sort-header>
                          </th>
                          <th class="text-right" [attr.aria-sort]="ariaSort('avg')">
                            <app-sort-header key="avg" [state]="overviewSort()" (sortChange)="overviewSort.set($event)">Átlag %</app-sort-header>
                          </th>
                          <th class="text-right" [attr.aria-sort]="ariaSort('streak')">
                            <app-sort-header key="streak" [state]="overviewSort()" (sortChange)="overviewSort.set($event)">Sorozat</app-sort-header>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (student of sortedSchoolActivity(); track student.userId) {
                          <tr>
                            <td class="sticky-col whitespace-nowrap">
                              <a [routerLink]="['/diakok', student.userId]" class="text-primary hover:underline">{{ student.name }}</a>
                            </td>
                            <td class="num text-right">{{ student.completedExamsCount }}</td>
                            <td class="num text-right">{{ student.averageExamScorePercent ?? '–' }}</td>
                            <td class="num text-right">{{ student.currentStreak }}</td>
                          </tr>
                        } @empty {
                          <tr><td colspan="4" class="!py-6 text-text-muted text-center">Nincs adat.</td></tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </div>
              }
            } @else {
              <p class="text-text-muted text-center py-10" data-testid="admin-tab-lost-access">
                Már nincs igazgatói jogosultságod ehhez az intézményhez.
              </p>
            }
          }

          @case ('csoportok') {
            @if (school.isSelectedAdmin()) {
              <app-intezmeny-osztalyok [schoolId]="s.id" [schoolName]="s.name" [allGroups]="school.schoolGroups()" />
            } @else {
              <p class="text-text-muted text-center py-10" data-testid="admin-tab-lost-access">
                Már nincs igazgatói jogosultságod ehhez az intézményhez.
              </p>
            }
          }

          @case ('licenc') {
            @if (school.isSelectedAdmin()) {
              <app-intezmeny-licenc [licenses]="school.licenseOverview()" />
            } @else {
              <p class="text-text-muted text-center py-10" data-testid="admin-tab-lost-access">
                Már nincs igazgatói jogosultságod ehhez az intézményhez.
              </p>
            }
          }
        }
      </div>
    } @else if (school.loading()) {
      <app-local-spinner />
    } @else {
      <p class="text-text-muted text-center py-10">Az intézmény nem található.</p>
    }
  `,
})
export class IntezmenyReszletekComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly confirmService = inject(ConfirmService);
  readonly school = inject(SchoolStore);
  readonly report = inject(ReportStore);
  readonly leaderboard = inject(LeaderboardStore);

  readonly tab = signal<Tab>('tanarok');

  // ── UI-UX-K3: Áttekintés-tábla rendezése ──
  readonly overviewSort = signal<SortState | null>(null);
  readonly sortedSchoolActivity = computed(() =>
    sortRows(this.report.schoolActivity(), this.overviewSort(), {
      name: (r) => r.name,
      exams: (r) => r.completedExamsCount,
      avg: (r) => r.averageExamScorePercent,
      streak: (r) => r.currentStreak,
    }));

  ariaSort(key: string): string | null {
    return ariaSort(this.overviewSort(), key);
  }

  readonly category = signal<LeaderboardCategory>('quiz');
  readonly period = signal<LeaderboardPeriod>('weekly');
  // UI-TT-62: friss (nem cache-elt) oldalbetöltésnél a selectedSchool() még null a
  // ngOnInit szinkron lefutásakor (a store csak ezután tölti be aszinkron) — az
  // átnevezés piszkozata ezért akkor veszi át a nevet, amikor a tényleges adat
  // megérkezik. Utána a tanár szerkesztése marad (egy későbbi loadMine() — pl.
  // szerepváltás után — nem írja felül), és a fülváltást is túléli.
  readonly editName = linkedSignal<SchoolDto | null, string>({
    source: this.school.selectedSchool,
    computation: (school, previous) => (previous?.source ? previous.value : school?.name ?? ''),
  });

  private schoolId = 0;

  ngOnInit(): void {
    this.schoolId = Number(this.route.snapshot.paramMap.get('id'));
    if (this.school.schools().length === 0) {
      this.school.loadMine();
    }
    this.school.select(this.schoolId);
    this.school.loadMembers(this.schoolId);
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
    // UI-TT-67: a school.error() egy KÖZÖS, minden fülön látszó blokkban jelenik
    // meg - fülváltás nélküli clearError() hívás nélkül egy korábbi fülről
    // maradt hibaüzenet félrevezető kontextusban ottmaradt volna.
    this.school.clearError();
    if (tab === 'ranglista') this.loadLeaderboard(this.schoolId);
    if (tab === 'attekintes') this.report.loadSchoolActivity(this.schoolId, this.range().from, this.range().to);
    if (tab === 'csoportok') this.school.loadSchoolGroups(this.schoolId);
    if (tab === 'licenc') this.school.loadLicenseOverview(this.schoolId);
  }

  loadLeaderboard(schoolId: number): void {
    this.leaderboard.loadSchoolLeaderboard(schoolId, this.category(), this.period());
  }

  /** A kiválasztott szűrő megmarad fülváltáskor is, ezért signalban tartjuk. */
  readonly range = signal<ReportDateRange>({});
  // UI-TT-178: a szűrő KULCSÁT (nem csak a belőle feloldott range-et) is meg kell
  // őrizni, hogy a fülváltás miatt újra-mountoló DateRangeFilterComponent a helyes
  // legördülő-opciót tudja visszatölteni, ne mindig DEFAULT_RANGE_KEY-t ("Teljes időszak").
  readonly rangeKey = signal<ReportRangeKey>(DEFAULT_RANGE_KEY);
  readonly customFromValue = computed(() => toDateInputValue(this.range().from));
  readonly customToValue = computed(() => toDateInputValueExclusiveEnd(this.range().to));

  applyRange(event: { key: ReportRangeKey; range: ReportDateRange }): void {
    this.rangeKey.set(event.key);
    this.range.set(event.range);
    this.report.loadSchoolActivity(this.schoolId, event.range.from, event.range.to);
  }

  async leave(schoolId: number): Promise<void> {
    const ok = await this.confirmService.ask({
      message:
        'Biztosan kilépsz az intézményből? A hozzá kötött csoportjaid lekerülnek az intézményről, és megszűnik a tartalom-megosztás.',
      danger: true,
      confirmLabel: 'Kilépés',
    });
    if (!ok) return;
    this.school.leave(schoolId, () => this.router.navigateByUrl('/intezmenyek'));
  }
}
