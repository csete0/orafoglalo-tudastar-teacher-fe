import { ChangeDetectionStrategy, Component, effect, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SchoolStore } from '../../services/school/school.store';
import { ReportStore } from '../../services/report/report.store';
import { LeaderboardStore } from '../../services/leaderboard/leaderboard.store';
import { LeaderboardCategory, LeaderboardPeriod } from '../../models/leaderboard.model';
import { SchoolTeacherRole } from '../../models/school.model';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';

type Tab = 'tanarok' | 'ranglista' | 'attekintes' | 'csoportok';

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
  imports: [FormsModule, RouterLink, IconComponent, LocalSpinnerComponent],
  template: `
    @if (school.selectedSchool(); as s) {
      <div class="max-w-3xl mx-auto px-4 py-10">
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

        <nav class="flex gap-4 border-b border-border-default mb-6">
          <button (click)="setTab('tanarok')" class="tab-btn" [class.tab-btn-active]="tab() === 'tanarok'">
            Tanárok
          </button>
          <button (click)="setTab('ranglista')" class="tab-btn" [class.tab-btn-active]="tab() === 'ranglista'">
            Ranglista
          </button>
          @if (school.isSelectedAdmin()) {
            <button (click)="setTab('attekintes')" class="tab-btn" [class.tab-btn-active]="tab() === 'attekintes'">
              Áttekintés
            </button>
            <button (click)="setTab('csoportok')" class="tab-btn" [class.tab-btn-active]="tab() === 'csoportok'">
              Csoportok
            </button>
          }
        </nav>

        @if (school.error()) {
          <p class="text-danger text-sm mb-4">{{ school.error() }}</p>
        }

        @switch (tab()) {
          @case ('tanarok') {
            @if (school.isSelectedAdmin() && s.teacherInviteCode) {
              <div class="card !rounded-xl bg-bg-element p-3 mb-4 flex justify-between items-center text-sm">
                <span class="flex items-center gap-2">
                  <app-icon name="link" class="w-4 h-4 block text-primary" />
                  Tanári meghívó kód: <code class="font-bold">{{ s.teacherInviteCode }}</code>
                </span>
                <button (click)="regenerateInvite(s.id)" class="text-primary hover:underline">Új kód generálása</button>
              </div>
            }

            <ul class="space-y-2 mb-6">
              @for (member of school.members(); track member.teacherProfileId) {
                <li class="flex justify-between items-center card !rounded-xl p-3">
                  <div class="flex items-center gap-3 min-w-0">
                    <div class="w-9 h-9 rounded-full bg-primary-subtle text-primary text-xs font-bold flex items-center justify-center shrink-0">
                      {{ initials(member.displayName) }}</div>
                    <div class="min-w-0">
                      <p class="truncate">{{ member.displayName }}</p>
                      <p class="text-xs text-text-muted">{{ member.groupCount }} csoport</p>
                    </div>
                  </div>
                  <div class="flex items-center gap-2 text-sm shrink-0">
                    <span class="badge" [class]="member.role === 'Admin' ? 'badge-primary' : 'badge-neutral'">
                      {{ member.role === 'Admin' ? 'Igazgató' : 'Tanár' }}</span>
                    @if (school.isSelectedAdmin()) {
                      <button (click)="toggleRole(s.id, member.teacherProfileId, member.role, member.displayName)" class="text-primary hover:underline">
                        {{ member.role === 'Admin' ? 'Lefokozás' : 'Igazgatóvá tétel' }}
                      </button>
                      <button (click)="removeMember(s.id, member.teacherProfileId)" class="text-danger hover:underline">Eltávolítás</button>
                    }
                  </div>
                </li>
              }
            </ul>

            @if (school.isSelectedAdmin()) {
              <div class="card p-5">
                <h2 class="font-bold mb-3">Intézmény szerkesztése</h2>
                <div class="flex gap-2 mb-3">
                  <input [(ngModel)]="editName" placeholder="Név" class="input flex-1" />
                  <button (click)="saveEdit(s.id)" class="btn btn-primary">Mentés</button>
                </div>
                <button (click)="deleteSchool(s.id, s.groupCount)" class="text-sm text-danger hover:underline">
                  Intézmény törlése
                </button>
              </div>
            }
          }

          @case ('ranglista') {
            <div class="flex gap-2 mb-4">
              <select [(ngModel)]="category" (ngModelChange)="loadLeaderboard(s.id)" class="input !w-auto">
                <option value="quiz">Kvíz</option>
                <option value="exam">Vizsga</option>
              </select>
              <select [(ngModel)]="period" (ngModelChange)="loadLeaderboard(s.id)" class="input !w-auto">
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
                  <li class="flex items-center gap-3 card !rounded-xl p-3 text-sm"
                    [class.!border-primary]="entry.isCurrentUser">
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

          @case ('attekintes') {
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
                        <th class="py-3 px-4">Sorozat</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (student of report.schoolActivity(); track student.userId) {
                        <tr class="border-b border-border-default last:border-b-0 hover:bg-bg-element transition-colors">
                          <td class="py-2.5 px-4">
                            <a [routerLink]="['/diakok', student.userId]" class="text-primary hover:underline">{{ student.name }}</a>
                          </td>
                          <td class="py-2.5 px-4">{{ student.completedExamsCount }}</td>
                          <td class="py-2.5 px-4">{{ student.averageExamScorePercent ?? '–' }}</td>
                          <td class="py-2.5 px-4">{{ student.currentStreak }}</td>
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

          @case ('csoportok') {
            <ul class="space-y-2">
              @for (group of school.schoolGroups(); track group.groupId) {
                <li class="flex justify-between items-center card !rounded-xl p-3 text-sm gap-3">
                  <span class="flex items-center gap-2 min-w-0">
                    <app-icon name="users" class="w-4 h-4 block text-text-muted shrink-0" />
                    <span class="truncate">{{ group.name }}</span>
                  </span>
                  <span class="text-text-muted shrink-0">{{ group.teacherDisplayName }} — {{ group.memberCount }} tag</span>
                </li>
              } @empty {
                <li class="flex flex-col items-center py-10 gap-3">
                  <div class="icon-tile icon-tile-neutral">
                    <app-icon name="users" class="w-6 h-6 block" />
                  </div>
                  <p class="font-semibold">Az intézményhez még nincs csoport kötve.</p>
                </li>
              }
            </ul>
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
  private readonly toastService = inject(ToastService);
  readonly school = inject(SchoolStore);
  readonly report = inject(ReportStore);
  readonly leaderboard = inject(LeaderboardStore);

  readonly tab = signal<Tab>('tanarok');
  category: LeaderboardCategory = 'quiz';
  period: LeaderboardPeriod = 'weekly';
  editName = '';
  // UI-TT-62: friss (nem cache-elt) oldalbetöltésnél a selectedSchool() még null a
  // ngOnInit szinkron lefutásakor (a store csak ezután tölti be aszinkron) — az
  // editName-et emiatt egy effect()-ben szinkronizáljuk, amint a tényleges adat
  // megérkezik, nem csak egyetlen, esetlegesen korai ngOnInit-beli olvasással.
  private nameSynced = false;

  private schoolId = 0;

  constructor() {
    effect(() => {
      const school = this.school.selectedSchool();
      if (school && !this.nameSynced) {
        this.editName = school.name;
        this.nameSynced = true;
      }
    });
  }

  ngOnInit(): void {
    this.schoolId = Number(this.route.snapshot.paramMap.get('id'));
    this.nameSynced = false;
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
    if (tab === 'attekintes') this.report.loadSchoolActivity(this.schoolId);
    if (tab === 'csoportok') this.school.loadSchoolGroups(this.schoolId);
  }

  loadLeaderboard(schoolId: number): void {
    this.leaderboard.loadSchoolLeaderboard(schoolId, this.category, this.period);
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

  async toggleRole(
    schoolId: number,
    teacherProfileId: number,
    currentRole: SchoolTeacherRole,
    displayName: string,
  ): Promise<void> {
    const newRole: SchoolTeacherRole = currentRole === 'Admin' ? 'Teacher' : 'Admin';
    const ok = await this.confirmService.ask({
      message:
        newRole === 'Admin'
          ? `Biztosan igazgatóvá teszed ${displayName} tanárt? Ezzel teljes intézmény-admin jogkört kap.`
          : `Biztosan lefokozod ${displayName} tanárt? Elveszíti az intézmény-admin jogkörét.`,
      danger: true,
      confirmLabel: newRole === 'Admin' ? 'Igazgatóvá tétel' : 'Lefokozás',
    });
    if (!ok) return;
    this.school.changeMemberRole(schoolId, teacherProfileId, { role: newRole }, () =>
      this.toastService.success('Szerepkör módosítva.'),
    );
  }

  async removeMember(schoolId: number, teacherProfileId: number): Promise<void> {
    const ok = await this.confirmService.ask({
      message: 'Biztosan eltávolítod ezt a tanárt az intézményből? A csoportjai lekerülnek az intézményről.',
      danger: true,
      confirmLabel: 'Eltávolítás',
    });
    if (!ok) return;
    this.school.removeMember(schoolId, teacherProfileId, () =>
      this.toastService.success('Tanár eltávolítva az intézményből.'),
    );
  }

  saveEdit(schoolId: number): void {
    if (!this.editName.trim()) return;
    this.school.update(schoolId, { name: this.editName.trim() }, () =>
      this.toastService.success('Intézmény átnevezve.'),
    );
  }

  async deleteSchool(schoolId: number, groupCount: number): Promise<void> {
    if (groupCount > 0) {
      this.toastService.warning('Az intézmény csak akkor törölhető, ha nincs hozzá kötött csoport.', 5000);
      return;
    }
    const ok = await this.confirmService.ask({
      message: 'Biztosan törlöd az intézményt?',
      danger: true,
      confirmLabel: 'Törlés',
    });
    if (!ok) return;
    this.school.delete(schoolId, () => {
      this.toastService.success('Intézmény törölve.');
      this.router.navigateByUrl('/intezmenyek');
    });
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

  regenerateInvite(schoolId: number): void {
    this.school.regenerateInvite(schoolId, () => this.toastService.success('Új tanári meghívó kód generálva.'));
  }
}
