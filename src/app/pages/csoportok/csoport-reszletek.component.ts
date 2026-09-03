import { ChangeDetectionStrategy, Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GroupStore } from '../../services/group/group.store';
import { GroupSeatStore } from '../../services/group/group-seat.store';
import { GroupSeatOverviewDto } from '../../models/group-seat.model';
import { SchoolStore } from '../../services/school/school.store';
import { ReportStore } from '../../services/report/report.store';
import { LeaderboardStore } from '../../services/leaderboard/leaderboard.store';
import { LeaderboardCategory, LeaderboardPeriod } from '../../models/leaderboard.model';
import { environment } from '../../../environments/environment';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { DateRangeFilterComponent } from '../../shared/date-range-filter/date-range-filter.component';
import { CopyButtonComponent } from '../../shared/copy-button/copy-button.component';
import { TeacherQuizService } from '../../services/teacher-quiz/teacher-quiz.service';
import { KahootHostService } from '../../services/kahoot-host/kahoot-host.service';
import { TeacherGroupAssignmentDto } from '../../models/teacher-quiz.model';
import { SortHeaderComponent, SortState, sortRows } from '../../shared/sort-header/sort-header.component';
import { finalize, take } from 'rxjs';
import { QrCodeComponent } from '../../shared/qr-code/qr-code.component';
import { DEFAULT_RANGE_KEY, ReportDateRange, ReportRangeKey, toDateInputValue, toDateInputValueExclusiveEnd } from '../../shared/date-range/report-date-range';

type Tab = 'tagok' | 'kiadva' | 'helyek' | 'eredmenyek' | 'ranglista' | 'meghivo';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-csoport-reszletek',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, IconComponent, LocalSpinnerComponent, DateRangeFilterComponent, CopyButtonComponent, QrCodeComponent, SortHeaderComponent],
  template: `
    @if (store.selectedGroup(); as group) {
      <div class="max-w-3xl mx-auto px-4 py-10">
        <div class="flex justify-between items-start mb-1 gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="icon-tile icon-tile-primary">
              <app-icon name="users" class="w-6 h-6 block" />
            </div>
            @if (!renaming()) {
              <h1 class="page-title truncate">{{ group.name }}</h1>
              <!-- UI-UX-T4: a csoport neve eddig NEM volt szerkeszthető sehol - egy
                   elgépelt vagy évfordulóval elavuló név ("11.A" → "12.A") csak új
                   csoporttal lett volna "javítható", elvágva a tagságot és az
                   eredményeket. -->
              @if (!group.isArchived) {
                <button type="button" (click)="startRename(group.name)"
                  class="btn btn-ghost !px-2 !py-1 !text-xs shrink-0" title="Átnevezés">
                  Átnevezés
                </button>
              }
            } @else {
              <input [(ngModel)]="renameValue" maxlength="255" class="input !w-auto flex-1"
                (keyup.enter)="saveRename(group.id)" (keyup.escape)="renaming.set(false)" />
              <button type="button" (click)="saveRename(group.id)"
                [disabled]="!renameValue.trim() || store.loading()" class="btn btn-primary shrink-0">Mentés</button>
              <button type="button" (click)="renaming.set(false)" class="btn btn-ghost shrink-0">Mégse</button>
            }
            @if (group.isArchived) {
              <span class="badge badge-neutral shrink-0">Archivált</span>
            }
          </div>
          @if (!group.isArchived) {
            <button (click)="archive(group.id)" class="btn btn-danger shrink-0">Archiválás</button>
          } @else {
            <button (click)="unarchive(group.id)" [disabled]="store.loading()" class="btn btn-primary shrink-0">Visszaállítás</button>
          }
        </div>
        @if (schoolStore.schools().length > 0) {
          <div class="flex items-center gap-2 mt-4 text-sm">
            <label class="text-text-muted">Intézmény:</label>
            <select [ngModel]="displaySchoolId()" (ngModelChange)="changeSchool(group.id, group.name, $event)"
              class="input !w-auto max-w-full min-w-0">
              <option [ngValue]="null">Nincs intézményhez kötve (magántanár)</option>
              @for (school of schoolStore.schools(); track school.id) {
                <option [ngValue]="school.id">{{ school.name }}</option>
              }
            </select>
          </div>
        } @else if (group.schoolName) {
          <p class="text-text-muted mt-2">Intézmény: {{ group.schoolName }}</p>
        }
        @if (schoolStore.error()) {
          <p class="text-danger text-sm mt-4">{{ schoolStore.error() }}</p>
        }
        <div class="hairline"></div>

        <!-- UI-TT-179: valódi, tartalom-váltó tab-widget - a wrapper role="tablist",
             a gombok role="tab" + aria-selected nélkül egy képernyőolvasó-felhasználó
             számára 4 néma, állapot nélküli "gomb"-ként hangzott el. -->
        <nav class="flex gap-4 border-b border-border-default mb-6" role="tablist">
          @for (option of tabs; track option.value) {
            <button (click)="setTab(option.value)" class="tab-btn"
              [class.tab-btn-active]="tab() === option.value"
              role="tab" [attr.aria-selected]="tab() === option.value">
              {{ option.label }}
            </button>
          }
        </nav>

        @if (store.error()) {
          <p class="text-danger text-sm mb-4">{{ store.error() }}</p>
        }

        @switch (tab()) {
          @case ('helyek') {
            @if (seatStore.error()) {
              <p class="text-danger text-sm mb-4">{{ seatStore.error() }}</p>
            }
            @if (seatStore.loading()) {
              <app-local-spinner />
            }

            @if (seatStore.overview(); as seats) {
              @if (!seats.licenseId) {
                <div class="card p-5 text-sm text-text-muted">
                  Ehhez a csoporthoz nem tartozik érvényes intézményi licenc.
                  A diákok a saját előfizetésüket használják.
                </div>
              } @else {
                <div class="card p-4 mb-4">
                  <div class="flex items-center justify-between gap-3 flex-wrap">
                    <div class="text-sm">
                      <span class="font-bold">{{ seats.tier === 'premium' ? 'Prémium' : 'Standard' }}</span>
                      licenc ·
                      <span [class.text-danger]="seats.usedSeatsOnLicense >= seats.capacity">
                        {{ seats.usedSeatsOnLicense }}/{{ seats.capacity }} hely használatban
                      </span>
                      <!-- UI-TT-202: usedSeatsOnLicense csak a licenc IdleWindowMinutes-én belül
                           friss helyeket számolja, míg a lenti "Helyet használó diákok" lista
                           MINDEN fel nem szabadított helyet felsorol, tétlent is - enélkül a
                           magyarázat nélkül a fejléc ("0/0") ellentmondani látszik a lista alatta.
                           Az admin-oldali admin-intezmenyek.component.ts:115-119 mintáját követi. -->
                      @if (idleTransferableSeatCount(seats) > 0) {
                        <span class="text-text-muted">
                          ({{ idleTransferableSeatCount(seats) }} tétlen, átadható)
                        </span>
                      }
                      <span class="text-text-muted">(az intézmény összes csoportjával együtt)</span>
                    </div>
                    @if (seats.holders.length > 0) {
                      <button (click)="confirmEndLesson()" [disabled]="seatStore.loading()"
                              class="btn btn-danger !px-3 !py-1.5 !text-sm">
                        Óra vége — helyek felszabadítása
                      </button>
                    }
                  </div>
                  <p class="text-xs text-text-muted mt-2">
                    Csak ennek a csoportnak a tagjaira hat. Aki épp vizsgázik vagy kvízt ír, attól nem veszi el a helyet.
                  </p>
                </div>

                @if (seatStore.lastReleaseResult(); as released) {
                  <div class="bg-success-subtle border border-success/40 rounded-xl p-4 mb-4 text-sm">
                    <p class="text-success font-bold">{{ released.releasedCount }} hely felszabadítva.</p>
                    @if (released.skippedInProgress.length > 0) {
                      <p class="text-text-muted mt-1">
                        Nem érintette (folyamatban lévő vizsga/kvíz):
                        {{ released.skippedInProgress.join(', ') }}
                      </p>
                    }
                  </div>
                }

                <h3 class="font-bold text-sm mb-2">Helyet használó diákok</h3>
                <ul class="space-y-2 mb-6">
                  @for (holder of seats.holders; track holder.userId) {
                    <li class="flex justify-between items-center card !rounded-xl p-3 text-sm gap-3">
                      <div class="min-w-0">
                        <p class="truncate">{{ holder.displayName }}</p>
                        <p class="text-xs text-text-muted">
                          <span [class]="holder.isFresh ? 'text-success' : ''">
                            {{ holder.isFresh ? 'aktív' : 'tétlen' }}
                          </span>
                          · utoljára: {{ holder.lastActivityAt | date: 'MM.dd HH:mm' }}
                          @if (holder.hasSessionInProgress) {
                            · <span class="text-warning">vizsga/kvíz folyamatban</span>
                          }
                          @if (holder.inMultipleGroups) {
                            · <span class="text-text-muted">több csoport tagja</span>
                          }
                        </p>
                      </div>
                      <button (click)="confirmReleaseSeat(holder)" [disabled]="seatStore.loading()"
                              class="btn btn-ghost !px-2 !py-1 !text-xs shrink-0">
                        Felszabadítás
                      </button>
                    </li>
                  } @empty {
                    <li class="text-sm text-text-muted">Jelenleg senki nem használ helyet ebben a csoportban.</li>
                  }
                </ul>

                @if (seats.withoutSeat.length > 0) {
                  <h3 class="font-bold text-sm mb-2">
                    Nem fért be ({{ seats.withoutSeat.length }})
                  </h3>
                  <p class="text-xs text-text-muted mb-2">
                    Ezek a diákok a saját (alacsonyabb) előfizetésüket használják. Aki már fizet
                    ugyanazért vagy jobbért, nem szerepel a listában.
                  </p>
                  <ul class="space-y-1">
                    @for (missing of seats.withoutSeat; track missing.userId) {
                      <li class="text-sm flex gap-2">
                        <span>{{ missing.displayName }}</span>
                        <span class="text-text-muted">({{ missing.personalTier }})</span>
                      </li>
                    }
                  </ul>
                }
              }
            }
          }
          @case ('tagok') {
            <ul class="space-y-2">
              @for (member of store.members(); track member.userId) {
                <li class="flex justify-between items-center card !rounded-xl p-3 text-sm">
                  <div class="flex items-center gap-3 min-w-0">
                    <div class="w-9 h-9 rounded-full bg-primary-subtle text-primary text-xs font-bold flex items-center justify-center shrink-0">
                      {{ initials(member.name) }}</div>
                    <div class="min-w-0">
                      <p class="truncate">{{ member.name }}</p>
                      <p class="text-xs text-text-muted truncate">{{ member.email }}</p>
                    </div>
                  </div>
                  <button (click)="removeMember(group.id, member.userId, member.name)" class="text-danger hover:underline shrink-0">Eltávolítás</button>
                </li>
              } @empty {
                <li class="flex flex-col items-center py-10 gap-3">
                  <div class="icon-tile icon-tile-neutral">
                    <app-icon name="users" class="w-6 h-6 block" />
                  </div>
                  <p class="font-semibold">Még nincs tag a csoportban.</p>
                  <p class="text-sm text-text-muted">Oszd meg a meghívó kódot a diákjaiddal.</p>
                  <!-- UI-UX-K2: az üres állapot ne csak elmondja a következő lépést -
                       vigyen is oda. -->
                  <button type="button" (click)="setTab('meghivo')" class="btn btn-primary">
                    Meghívó kód megnyitása
                  </button>
                </li>
              }
            </ul>
          }

          @case ('kiadva') {
            <!-- UI-UX-T3: a tanár fejben a csoportból indul ("a 9.A-nak mi van kiadva?").
                 Feladatsoroknak nincs kiadás-fogalma (csoporttagság-alapú a láthatóság),
                 ezért ez a fül a kvíz-kiadásokat mutatja. -->
            @if (assignmentsError(); as err) {
              <p class="text-danger text-sm mb-4">{{ err }}</p>
            }
            @if (assignmentsLoading()) {
              <app-local-spinner />
            } @else {
              <ul class="space-y-2">
                @for (assignment of groupAssignments(); track assignment.assignmentId) {
                  <li class="card !rounded-xl p-3 text-sm flex items-center gap-3 flex-wrap">
                    <div class="min-w-0 flex-1">
                      <p class="font-medium truncate">{{ assignment.quizTitle }}</p>
                      <p class="text-xs text-text-muted">
                        {{ assignment.questionCount }} kérdés
                        · megírta: {{ assignment.completedMemberCount }} / {{ assignment.memberCount }}
                        @if (assignment.dueAt) {
                          · <span [class.text-danger]="isDueSoon(assignment.dueAt)">
                            határidő: {{ assignment.dueAt | date: 'yyyy.MM.dd. HH:mm' }}</span>
                        }
                        @if (assignment.hasActiveLiveRoom) {
                          · <span class="text-warning font-semibold">élő játék fut</span>
                        }
                      </p>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                      <a [routerLink]="['/feladatsorok', 'kvizek', assignment.quizId, 'eredmenyek']"
                         class="btn btn-ghost !px-2 !py-1 !text-xs">Eredmények</a>
                      @if (assignment.hasActiveLiveRoom) {
                        <a [routerLink]="['/feladatsorok', 'kvizek', assignment.quizId, 'elo', assignment.activeKahootSessionId]"
                           class="btn btn-primary !px-2 !py-1 !text-xs">Vezérlés</a>
                      } @else {
                        <button type="button" (click)="startLiveFromGroup(assignment)"
                                [disabled]="liveStartPending()"
                                class="btn btn-primary !px-2 !py-1 !text-xs">
                          Élő indítás
                        </button>
                      }
                    </div>
                  </li>
                } @empty {
                  <li class="flex flex-col items-center py-10 gap-3">
                    <div class="icon-tile icon-tile-neutral">
                      <app-icon name="academic-cap" class="w-6 h-6 block" />
                    </div>
                    <p class="font-semibold">Ennek a csoportnak most nincs kiadott kvíze.</p>
                    <p class="text-sm text-text-muted">Kiadni a kvíz-szerkesztő "Kiadás csoportnak" paneljén tudsz.</p>
                    <a routerLink="/feladatsorok/kvizek" class="btn btn-primary">Kvízeim megnyitása</a>
                  </li>
                }
              </ul>
              @if (liveStartError(); as err) {
                <p class="text-sm text-danger mt-3">{{ err }}</p>
              }
            }
          }

          @case ('eredmenyek') {
            <!-- UI-TT-178: az @switch/@case ág minden fülváltáskor destroy+recreate-eli ezt a
                 komponenst - az initialRangeKey/initialCustomFrom/initialCustomTo inputok nélkül
                 a legördülő mindig "Teljes időszak"-ra ugrana vissza, holott a lekérdezés maga
                 (lent) a perzisztált range()-t használja tovább. -->
            <app-date-range-filter [initialRangeKey]="rangeKey()"
              [initialCustomFrom]="customFromValue()" [initialCustomTo]="customToValue()"
              (rangeChange)="applyRange(group.id, $event)" />
            @if (report.error()) {
              <p class="text-danger text-sm mb-4">{{ report.error() }}</p>
            } @else {
              <div class="card overflow-hidden">
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead>
                      <tr class="text-left border-b border-border-default">
                        <th class="py-3 px-4" [attr.aria-sort]="ariaSort('name')">
                          <app-sort-header key="name" [state]="resultsSort()" (sortChange)="resultsSort.set($event)">Diák</app-sort-header>
                        </th>
                        <th class="py-3 px-4" [attr.aria-sort]="ariaSort('exams')">
                          <app-sort-header key="exams" [state]="resultsSort()" (sortChange)="resultsSort.set($event)">Vizsgák</app-sort-header>
                        </th>
                        <th class="py-3 px-4" [attr.aria-sort]="ariaSort('avg')">
                          <app-sort-header key="avg" [state]="resultsSort()" (sortChange)="resultsSort.set($event)">Átlag %</app-sort-header>
                        </th>
                        <th class="py-3 px-4" [attr.aria-sort]="ariaSort('quiz')">
                          <app-sort-header key="quiz" [state]="resultsSort()" (sortChange)="resultsSort.set($event)">Kvíz pontosság</app-sort-header>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (student of sortedGroupActivity(); track student.userId) {
                        <tr class="border-b border-border-default last:border-b-0 hover:bg-bg-element transition-colors">
                          <td class="py-2.5 px-4">
                            <a [routerLink]="['/diakok', student.userId]" class="text-primary hover:underline">{{ student.name }}</a>
                          </td>
                          <td class="py-2.5 px-4">{{ student.completedExamsCount }}</td>
                          <td class="py-2.5 px-4">{{ student.averageExamScorePercent ?? '–' }}</td>
                          <td class="py-2.5 px-4">{{ student.quizAccuracyPercent ?? '–' }}</td>
                        </tr>
                      } @empty {
                        <tr><td colspan="4" class="py-6 px-4 text-text-muted text-center">Nincs adat.</td></tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            }
          }

          @case ('ranglista') {
            <div class="flex gap-2 mb-4">
              <select [(ngModel)]="category" (ngModelChange)="loadLeaderboard(group.id)" class="input !w-auto">
                <option value="quiz">Kvíz</option>
                <option value="exam">Vizsga</option>
              </select>
              <select [(ngModel)]="period" (ngModelChange)="loadLeaderboard(group.id)" class="input !w-auto">
                <option value="weekly">Heti</option>
                <option value="monthly">Havi</option>
                <option value="alltime">Összes idő</option>
              </select>
            </div>

            @if (leaderboard.error()) {
              <p class="text-danger text-sm mb-4">{{ leaderboard.error() }}</p>
            } @else {
              <ol class="space-y-2">
                @for (entry of leaderboard.leaderboard()?.topEntries; track entry.rank) {
                  <li class="flex items-center gap-3 card !rounded-xl p-3 text-sm">
                    <span class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      [class]="rankClass(entry.rank)">{{ entry.rank }}</span>
                    <!-- UI-UX-T7: a tanárnak a valódi név a beazonosítható - a becenév
                         mellette marad, ha eltér. Diák-hívónál a realName mindig null. -->
                    <span class="flex-1 truncate">
                      {{ entry.realName ?? entry.nickname }}
                      @if (entry.realName && entry.realName !== entry.nickname) {
                        <span class="text-text-muted text-xs">({{ entry.nickname }})</span>
                      }
                    </span>
                    <span class="font-bold">{{ entry.score }}</span>
                  </li>
                } @empty {
                  <li class="flex flex-col items-center py-10 gap-3">
                    <div class="icon-tile icon-tile-neutral">
                      <app-icon name="trophy" class="w-6 h-6 block" />
                    </div>
                    <p class="font-semibold">Még nincs ranglista-adat.</p>
                  </li>
                }
              </ol>
            }
          }

          @case ('meghivo') {
            <div class="card p-5 space-y-3">
              <div class="flex items-center gap-3">
                <div class="icon-tile icon-tile-primary">
                  <app-icon name="link" class="w-6 h-6 block" />
                </div>
                <p class="text-sm">Meghívó kód: <code class="font-bold">{{ group.inviteCode }}</code></p>
                <app-copy-button [value]="group.inviteCode" label="Meghívó kód" />
                @if (group.isJoinEnabled) {
                  <span class="badge badge-success shrink-0">Aktív</span>
                } @else {
                  <span class="badge badge-neutral shrink-0">Jelentkezés letiltva</span>
                }
              </div>
              <p class="text-sm break-all flex items-center gap-2 flex-wrap">
                <span>Csatlakozási link: <code>{{ joinLink(group.inviteCode) }}</code></span>
                <app-copy-button [value]="joinLink(group.inviteCode)" label="Csatlakozási link" />
                <button type="button" (click)="qrVisible.set(!qrVisible())" class="btn btn-ghost !px-2 !py-1 !text-xs shrink-0">
                  {{ qrVisible() ? 'QR elrejtése' : 'QR-kód kivetítéshez' }}
                </button>
              </p>
              <!-- UI-UX-T1: kivetítve a diákok telefonnal beolvassák - nem kell gépelni. -->
              @if (qrVisible()) {
                <div class="flex justify-center py-2">
                  <app-qr-code [value]="joinLink(group.inviteCode)" [size]="280" />
                </div>
              }
              <p class="text-xs text-text-muted">A kód nem jár le — a jelentkezést itt tudod ki- vagy bekapcsolni anélkül, hogy a kódot le kellene cserélned.</p>
              <div class="flex gap-2">
                <button (click)="regenerateInvite(group.id)" [disabled]="store.loading()" class="btn btn-primary">
                  Új kód generálása
                </button>
                @if (group.isJoinEnabled) {
                  <button (click)="setJoinEnabled(group.id, false)" [disabled]="store.loading()" class="btn btn-danger">
                    Jelentkezés letiltása
                  </button>
                } @else {
                  <button (click)="setJoinEnabled(group.id, true)" [disabled]="store.loading()" class="btn btn-primary">
                    Jelentkezés engedélyezése
                  </button>
                }
              </div>
            </div>
          }
        }
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
  private readonly confirmService = inject(ConfirmService);
  private readonly toastService = inject(ToastService);
  readonly store = inject(GroupStore);
  readonly seatStore = inject(GroupSeatStore);
  readonly schoolStore = inject(SchoolStore);
  readonly report = inject(ReportStore);
  readonly leaderboard = inject(LeaderboardStore);

  readonly tabs: { value: Tab; label: string }[] = [
    { value: 'tagok', label: 'Tagok' },
    { value: 'kiadva', label: 'Kiadva' },
    { value: 'helyek', label: 'Helyek' },
    { value: 'eredmenyek', label: 'Eredmények' },
    { value: 'ranglista', label: 'Ranglista' },
    { value: 'meghivo', label: 'Meghívó' },
  ];

  readonly tab = signal<Tab>('tagok');
  // ── UI-UX-T3: "Kiadva" fül állapota ──
  private readonly teacherQuizService = inject(TeacherQuizService);
  private readonly kahootHostService = inject(KahootHostService);
  readonly groupAssignments = signal<TeacherGroupAssignmentDto[]>([]);
  readonly assignmentsLoading = signal(false);
  readonly liveStartPending = signal(false);
  readonly liveStartError = signal<string | null>(null);
  readonly assignmentsError = signal<string | null>(null);

  // ── UI-UX-K3: Eredmények-tábla rendezése ──
  readonly resultsSort = signal<SortState | null>(null);
  readonly sortedGroupActivity = computed(() =>
    sortRows(this.report.groupActivity(), this.resultsSort(), {
      name: (r) => r.name,
      exams: (r) => r.completedExamsCount,
      avg: (r) => r.averageExamScorePercent,
      quiz: (r) => r.quizAccuracyPercent,
    }));

  ariaSort(key: string): string | null {
    const state = this.resultsSort();
    if (state?.key !== key) return null;
    return state.dir === 'asc' ? 'ascending' : 'descending';
  }

  private loadAssignments(groupId: number): void {
    this.assignmentsLoading.set(true);
    this.teacherQuizService
      .getGroupAssignments(groupId)
      .pipe(take(1), finalize(() => this.assignmentsLoading.set(false)))
      .subscribe({
        next: (assignments) => {
          this.assignmentsError.set(null);
          this.groupAssignments.set(assignments);
        },
        error: () => this.assignmentsError.set('A kiadások betöltése sikertelen.'),
      });
  }

  /** 48 órán belül lejáró határidő - vizuális sürgősség. */
  isDueSoon(dueAt: string): boolean {
    const remaining = new Date(dueAt).getTime() - Date.now();
    return remaining > 0 && remaining < 48 * 3600 * 1000;
  }

  startLiveFromGroup(assignment: TeacherGroupAssignmentDto): void {
    if (this.liveStartPending()) return;
    this.liveStartPending.set(true);
    this.liveStartError.set(null);
    this.kahootHostService
      .createRoom(assignment.quizId, this.groupId)
      .pipe(take(1), finalize(() => this.liveStartPending.set(false)))
      .subscribe({
        next: (room) =>
          void this.router.navigate([
            '/feladatsorok', 'kvizek', assignment.quizId, 'elo', room.kahootSessionId,
          ]),
        error: () => this.liveStartError.set('Az élő játék indítása sikertelen.'),
      });
  }

  /** UI-UX-T1: a kivetíthető QR alapból rejtve - csak szándékos megnyitásra. */
  readonly qrVisible = signal(false);
  /** UI-UX-T4: fejléc-átnevezés állapota. */
  readonly renaming = signal(false);
  renameValue = '';
  category: LeaderboardCategory = 'quiz';
  period: LeaderboardPeriod = 'weekly';

  private groupId = 0;

  // UI-TT-4: az intézmény-<select> korábban közvetlenül a store selectedGroup().schoolId-jára
  // volt kötve — mivel Mégse esetén ez az érték SOHA nem változott, Angular nem hívta újra a
  // writeValue()-t, és a <select> DOM-eleme a törölt/el nem mentett választáson maradt. Egy
  // külön, a nézetet vezérlő signal-lal a Mégse-ág explicit vissza tudja állítani a látott
  // értéket, akkor is, ha a mögöttes store-állapot közben nem változott.
  readonly displaySchoolId = signal<number | null>(null);

  private readonly syncDisplaySchoolId = effect(() => {
    const group = this.store.selectedGroup();
    this.displaySchoolId.set(group?.schoolId ?? null);
  });

  ngOnInit(): void {
    this.groupId = Number(this.route.snapshot.paramMap.get('id'));
    if (this.store.groups().length === 0) {
      this.store.loadMine();
    }
    this.store.select(this.groupId);
    this.store.loadMembers(this.groupId);
    if (this.schoolStore.schools().length === 0) {
      this.schoolStore.loadMine();
    }
  }

  // UI-TT-202: usedSeatsOnLicense (backend) kizárólag a licenc IdleWindowMinutes-én
  // belül friss helyeket számolja, a holders lista viszont MINDEN fel nem szabadított
  // helyet felsorol, tétlent is - a kettő szándékosan eltérhet. Az admin-oldali
  // admin-intezmenyek.component.ts:117 mintáját követve itt is megszámoljuk, hány
  // listázott hely tétlen (heldSeats - usedSeats ekvivalense a teacher DTO-ban).
  idleTransferableSeatCount(seats: GroupSeatOverviewDto): number {
    return seats.holders.filter((h) => !h.isFresh).length;
  }

  async confirmEndLesson(): Promise<void> {
    if (this.seatStore.loading()) return;

    const holders = this.seatStore.overview()?.holders ?? [];
    const multiGroup = holders.filter((h) => h.inMultipleGroups).length;

    const ok = await this.confirmService.ask({
      message:
        `Felszabadítod a csoport ${holders.length} használatban lévő helyét? ` +
        (multiGroup > 0
          ? `Figyelem: ${multiGroup} diák más csoportnak is tagja — egy diáknak egy helye van, ` +
            'így a felszabadítás a másik óráján is látszani fog. '
          : '') +
        'Aki épp vizsgázik vagy kvízt ír, attól a rendszer nem veszi el a helyet.',
      danger: true,
      confirmLabel: 'Óra vége',
    });
    if (!ok) return;

    this.seatStore.releaseAll(this.groupId);
  }

  async confirmReleaseSeat(holder: { userId: number; displayName: string; inMultipleGroups: boolean }): Promise<void> {
    if (this.seatStore.loading()) return;

    const ok = await this.confirmService.ask({
      message:
        `Felszabadítod ${holder.displayName} helyét? A diák visszaesik a saját előfizetésére. ` +
        (holder.inMultipleGroups
          ? 'Ez a diák más csoportnak is tagja — egy helye van, tehát a másik óráján is elveszíti.'
          : ''),
      danger: true,
      confirmLabel: 'Felszabadítás',
    });
    if (!ok) return;

    this.seatStore.releaseSeat(this.groupId, holder.userId);
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
    // UI-TT-67: a store.error() (a "Tagok" fül GroupStore-hibája) egy KÖZÖS,
    // minden fülön látszó blokkban jelenik meg - fülváltás nélküli clearError()
    // hívás nélkül egy korábbi fülről maradt hibaüzenet félrevezető kontextusban
    // (pl. az Eredmények fülön) ottmaradt volna.
    this.store.clearError();
    if (tab === 'tagok') this.store.loadMembers(this.groupId);
    if (tab === 'kiadva') this.loadAssignments(this.groupId);
    if (tab === 'helyek') this.seatStore.load(this.groupId);
    if (tab === 'eredmenyek') this.report.loadGroupActivity(this.groupId, this.range().from, this.range().to);
    if (tab === 'ranglista') this.loadLeaderboard(this.groupId);
  }

  /** A kiválasztott szűrő megmarad fülváltáskor is, ezért signalban tartjuk. */
  readonly range = signal<ReportDateRange>({});
  // UI-TT-178: a szűrő KULCSÁT (nem csak a belőle feloldott range-et) is meg kell
  // őrizni, hogy a fülváltás miatt újra-mountoló DateRangeFilterComponent a helyes
  // legördülő-opciót tudja visszatölteni, ne mindig DEFAULT_RANGE_KEY-t ("Teljes időszak").
  readonly rangeKey = signal<ReportRangeKey>(DEFAULT_RANGE_KEY);
  readonly customFromValue = computed(() => toDateInputValue(this.range().from));
  readonly customToValue = computed(() => toDateInputValueExclusiveEnd(this.range().to));

  applyRange(groupId: number, event: { key: ReportRangeKey; range: ReportDateRange }): void {
    this.rangeKey.set(event.key);
    this.range.set(event.range);
    this.report.loadGroupActivity(groupId, event.range.from, event.range.to);
  }

  loadLeaderboard(groupId: number): void {
    this.leaderboard.loadGroupLeaderboard(groupId, this.category, this.period);
  }

  joinLink(code: string): string {
    return `${environment.studentAppUrl}/csoport/csatlakozas?code=${code}`;
  }

  initials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  }

  rankClass(rank: number): string {
    if (rank === 1) return 'bg-warning-subtle text-warning';
    if (rank === 2) return 'bg-primary-subtle text-primary';
    if (rank === 3) return 'bg-secondary-subtle text-secondary';
    return 'bg-bg-element text-text-muted';
  }

  async removeMember(groupId: number, userId: number, memberName: string): Promise<void> {
    const ok = await this.confirmService.ask({
      message: `Biztosan eltávolítod ${memberName} diákot a csoportból?`,
      danger: true,
      confirmLabel: 'Eltávolítás',
    });
    if (!ok) return;
    this.store.removeMember(groupId, userId, () => this.toastService.success('Diák eltávolítva a csoportból.'));
  }

  async archive(groupId: number): Promise<void> {
    // UI-TT-34: az archiválásnak MOST MÁR van visszaállítási útja (unarchive) - a
    // korábbi "VÉGLEGES, nem vonható vissza" szöveg ezt tévesen tagadta.
    const ok = await this.confirmService.ask({
      message:
        'Biztosan archiválod a csoportot? A tagok elveszítik a tartalom-hozzáférést, amíg a csoport archivált - a csoport részletei oldalon bármikor visszaállítható.',
      danger: true,
      confirmLabel: 'Archiválás',
    });
    if (!ok) return;
    this.store.archive(groupId, () => {
      this.toastService.success('Csoport archiválva.');
      this.router.navigateByUrl('/csoportok');
    });
  }

  unarchive(groupId: number): void {
    this.store.unarchive(groupId, () => this.toastService.success('Csoport visszaállítva.'));
  }

  async changeSchool(groupId: number, groupName: string, schoolId: number | null): Promise<void> {
    const previousSchoolId = this.displaySchoolId();
    this.displaySchoolId.set(schoolId);
    if (schoolId !== null) {
      const schoolName = this.schoolStore.schools().find((s) => s.id === schoolId)?.name ?? '';
      const ok = await this.confirmService.ask({
        message: `Biztosan a(z) „${schoolName}” intézményhez kötöd ezt a csoportot? A tagok minden korábbi eredménye láthatóvá válik az intézmény igazgatója számára, és a diákok erről értesítést kapnak.`,
      });
      if (!ok) {
        this.displaySchoolId.set(previousSchoolId);
        return;
      }
    } else if (previousSchoolId !== null) {
      const ok = await this.confirmService.ask({
        message: 'Biztosan visszavonod a csoport intézményhez-kötését? A csoport lekerül az intézményről, és az igazgató a továbbiakban nem látja a diákok eredményeit.',
        danger: true,
        confirmLabel: 'Kötés visszavonása',
      });
      if (!ok) {
        this.displaySchoolId.set(previousSchoolId);
        return;
      }
    }
    this.store.update(
      groupId,
      { name: groupName, schoolId: schoolId ?? undefined },
      () => this.toastService.success('Csoport frissítve.'),
      // UI-TT-73: mentés sikertelensége esetén a select-et vissza kell állítani a
      // ténylegesen mentett (előző) értékre - az optimista beállítás (fenti
      // displaySchoolId.set(schoolId)) enélkül a hibaüzenet mellett örökre a
      // soha el nem mentett választáson maradt volna.
      () => this.displaySchoolId.set(previousSchoolId),
    );
  }

  startRename(currentName: string): void {
    this.renameValue = currentName;
    this.renaming.set(true);
  }

  saveRename(groupId: number): void {
    const name = this.renameValue.trim();
    if (!name || this.store.loading()) return;
    // UI-UX-T4: az update ugyanaz az útvonal, mint az intézmény-kötés váltásáé - a
    // schoolId-t a MOST LÁTOTT (displaySchoolId) értékkel küldjük, hogy a két
    // szerkesztési út ne írhassa felül egymást.
    this.store.update(
      groupId,
      { name, schoolId: this.displaySchoolId() ?? undefined },
      () => {
        this.renaming.set(false);
        this.toastService.success('Csoport átnevezve.');
      },
    );
  }

  regenerateInvite(groupId: number): void {
    if (this.store.loading()) return;
    this.store.regenerateInvite(groupId, () => this.toastService.success('Új meghívó kód generálva.'));
  }

  setJoinEnabled(groupId: number, enabled: boolean): void {
    if (this.store.loading()) return;
    this.store.setJoinEnabled(groupId, enabled, () =>
      this.toastService.success(enabled ? 'Jelentkezés engedélyezve.' : 'Jelentkezés letiltva.'),
    );
  }
}
