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
import { DEFAULT_RANGE_KEY, ReportDateRange, ReportRangeKey, toDateInputValue, toDateInputValueExclusiveEnd } from '../../shared/date-range/report-date-range';

type Tab = 'tagok' | 'helyek' | 'eredmenyek' | 'ranglista' | 'meghivo';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-csoport-reszletek',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, IconComponent, LocalSpinnerComponent, DateRangeFilterComponent],
  template: `
    @if (store.selectedGroup(); as group) {
      <div class="max-w-3xl mx-auto px-4 py-10">
        <div class="flex justify-between items-start mb-1 gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="icon-tile icon-tile-primary">
              <app-icon name="users" class="w-6 h-6 block" />
            </div>
            <h1 class="page-title truncate">{{ group.name }}</h1>
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
              class="input !w-auto">
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
                  <p class="text-sm text-text-muted">Oszd meg a meghívó kódot a diákjaiddal a Meghívó fülön.</p>
                </li>
              }
            </ul>
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
                      <tr class="text-left text-text-muted text-xs uppercase tracking-wide border-b border-border-default">
                        <th class="py-3 px-4">Diák</th>
                        <th class="py-3 px-4">Vizsgák</th>
                        <th class="py-3 px-4">Átlag %</th>
                        <th class="py-3 px-4">Kvíz pontosság</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (student of report.groupActivity(); track student.userId) {
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
                    <span class="flex-1 truncate">{{ entry.nickname }}</span>
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
                @if (group.isJoinEnabled) {
                  <span class="badge badge-success shrink-0">Aktív</span>
                } @else {
                  <span class="badge badge-neutral shrink-0">Jelentkezés letiltva</span>
                }
              </div>
              <p class="text-sm break-all">Csatlakozási link: <code>{{ joinLink(group.inviteCode) }}</code></p>
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
    { value: 'helyek', label: 'Helyek' },
    { value: 'eredmenyek', label: 'Eredmények' },
    { value: 'ranglista', label: 'Ranglista' },
    { value: 'meghivo', label: 'Meghívó' },
  ];

  readonly tab = signal<Tab>('tagok');
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
