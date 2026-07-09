import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SchoolStore } from '../../services/school/school.store';
import { ReportStore } from '../../services/report/report.store';
import { LeaderboardStore } from '../../services/leaderboard/leaderboard.store';
import { LeaderboardCategory, LeaderboardPeriod } from '../../models/leaderboard.model';
import { SchoolTeacherRole } from '../../models/school.model';

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
  imports: [FormsModule, RouterLink],
  template: `
    @if (school.selectedSchool(); as s) {
      <div class="max-w-3xl mx-auto px-4 py-10">
        <div class="flex justify-between items-start mb-1">
          <h1 class="text-xl font-semibold">{{ s.name }}</h1>
          <button (click)="leave(s.id)" class="text-sm text-danger hover:underline">Kilépés</button>
        </div>
        <p class="text-text-muted mb-6">A szereped: {{ s.myRole === 'Admin' ? 'Igazgató' : 'Tanár' }}</p>

        <nav class="flex gap-4 border-b border-border-default mb-6 text-sm">
          <button (click)="setTab('tanarok')" [class.border-primary]="tab() === 'tanarok'"
            [class.text-text-muted]="tab() !== 'tanarok'" class="pb-2 border-b-2 border-transparent">
            Tanárok
          </button>
          <button (click)="setTab('ranglista')" [class.border-primary]="tab() === 'ranglista'"
            [class.text-text-muted]="tab() !== 'ranglista'" class="pb-2 border-b-2 border-transparent">
            Ranglista
          </button>
          @if (school.isSelectedAdmin()) {
            <button (click)="setTab('attekintes')" [class.border-primary]="tab() === 'attekintes'"
              [class.text-text-muted]="tab() !== 'attekintes'" class="pb-2 border-b-2 border-transparent">
              Áttekintés
            </button>
            <button (click)="setTab('csoportok')" [class.border-primary]="tab() === 'csoportok'"
              [class.text-text-muted]="tab() !== 'csoportok'" class="pb-2 border-b-2 border-transparent">
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
              <div class="bg-bg-element border border-border-default rounded-lg p-3 mb-4 flex justify-between items-center text-sm">
                <span>Tanári meghívó kód: <code>{{ s.teacherInviteCode }}</code></span>
                <button (click)="school.regenerateInvite(s.id)" class="text-primary hover:underline">Új kód generálása</button>
              </div>
            }

            <ul class="space-y-2 mb-6">
              @for (member of school.members(); track member.teacherProfileId) {
                <li class="flex justify-between items-center bg-bg-panel border border-border-default rounded-lg p-3">
                  <div>
                    <p>{{ member.displayName }}</p>
                    <p class="text-xs text-text-muted">{{ member.groupCount }} csoport</p>
                  </div>
                  <div class="flex items-center gap-2 text-sm">
                    <span class="text-text-muted">{{ member.role === 'Admin' ? 'Igazgató' : 'Tanár' }}</span>
                    @if (school.isSelectedAdmin()) {
                      <button (click)="toggleRole(s.id, member.teacherProfileId, member.role)" class="text-primary hover:underline">
                        {{ member.role === 'Admin' ? 'Lefokozás' : 'Igazgatóvá tétel' }}
                      </button>
                      <button (click)="removeMember(s.id, member.teacherProfileId)" class="text-danger hover:underline">Eltávolítás</button>
                    }
                  </div>
                </li>
              }
            </ul>

            @if (school.isSelectedAdmin()) {
              <div class="bg-bg-panel border border-border-default rounded-lg p-4">
                <h2 class="font-medium mb-2">Intézmény szerkesztése</h2>
                <div class="flex gap-2 mb-3">
                  <input [(ngModel)]="editName" placeholder="Név"
                    class="flex-1 rounded border border-border-default bg-bg-element px-2 py-1.5 text-sm" />
                  <button (click)="saveEdit(s.id)" class="rounded bg-primary hover:bg-primary-hover text-white px-3 py-1.5 text-sm">
                    Mentés
                  </button>
                </div>
                <button (click)="deleteSchool(s.id, s.groupCount)"
                  class="text-sm text-danger hover:underline">
                  Intézmény törlése
                </button>
              </div>
            }
          }

          @case ('ranglista') {
            <div class="flex gap-2 mb-4 text-sm">
              <select [(ngModel)]="category" (ngModelChange)="loadLeaderboard(s.id)"
                class="rounded border border-border-default bg-bg-element px-2 py-1">
                <option value="quiz">Kvíz</option>
                <option value="exam">Vizsga</option>
              </select>
              <select [(ngModel)]="period" (ngModelChange)="loadLeaderboard(s.id)"
                class="rounded border border-border-default bg-bg-element px-2 py-1">
                <option value="weekly">Heti</option>
                <option value="monthly">Havi</option>
                <option value="alltime">Összes idő</option>
              </select>
            </div>

            <ol class="space-y-1">
              @for (entry of leaderboard.leaderboard()?.topEntries; track entry.rank) {
                <li class="flex justify-between bg-bg-panel border border-border-default rounded-lg p-2 text-sm"
                  [class.border-primary]="entry.isCurrentUser">
                  <span>{{ entry.rank }}. {{ entry.nickname }}</span>
                  <span>{{ entry.score }}</span>
                </li>
              } @empty {
                <li class="text-text-muted text-sm">Még nincs ranglista-adat.</li>
              }
            </ol>
          }

          @case ('attekintes') {
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-text-muted border-b border-border-default">
                  <th class="py-2">Diák</th>
                  <th class="py-2">Vizsgák</th>
                  <th class="py-2">Átlag %</th>
                  <th class="py-2">Sorozat</th>
                </tr>
              </thead>
              <tbody>
                @for (student of report.schoolActivity(); track student.userId) {
                  <tr class="border-b border-border-default">
                    <td class="py-2">
                      <a [routerLink]="['/diakok', student.userId]" class="text-primary hover:underline">{{ student.name }}</a>
                    </td>
                    <td class="py-2">{{ student.completedExamsCount }}</td>
                    <td class="py-2">{{ student.averageExamScorePercent ?? '–' }}</td>
                    <td class="py-2">{{ student.currentStreak }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="4" class="py-4 text-text-muted">Nincs adat.</td></tr>
                }
              </tbody>
            </table>
          }

          @case ('csoportok') {
            <ul class="space-y-2">
              @for (group of school.schoolGroups(); track group.groupId) {
                <li class="flex justify-between bg-bg-panel border border-border-default rounded-lg p-3 text-sm">
                  <span>{{ group.name }}</span>
                  <span class="text-text-muted">{{ group.teacherDisplayName }} — {{ group.memberCount }} tag</span>
                </li>
              } @empty {
                <li class="text-text-muted text-sm">Az intézményhez még nincs csoport kötve.</li>
              }
            </ul>
          }
        }
      </div>
    } @else if (school.loading()) {
      <p class="text-text-muted text-center py-10">Betöltés…</p>
    } @else {
      <p class="text-text-muted text-center py-10">Az intézmény nem található.</p>
    }
  `,
})
export class IntezmenyReszletekComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly school = inject(SchoolStore);
  readonly report = inject(ReportStore);
  readonly leaderboard = inject(LeaderboardStore);

  readonly tab = signal<Tab>('tanarok');
  category: LeaderboardCategory = 'quiz';
  period: LeaderboardPeriod = 'weekly';
  editName = '';

  private schoolId = 0;

  ngOnInit(): void {
    this.schoolId = Number(this.route.snapshot.paramMap.get('id'));
    if (this.school.schools().length === 0) {
      this.school.loadMine();
    }
    this.school.select(this.schoolId);
    this.school.loadMembers(this.schoolId);
    this.editName = this.school.selectedSchool()?.name ?? '';
  }

  setTab(tab: Tab): void {
    this.tab.set(tab);
    if (tab === 'ranglista') this.loadLeaderboard(this.schoolId);
    if (tab === 'attekintes') this.report.loadSchoolActivity(this.schoolId);
    if (tab === 'csoportok') this.school.loadSchoolGroups(this.schoolId);
  }

  loadLeaderboard(schoolId: number): void {
    this.leaderboard.loadSchoolLeaderboard(schoolId, this.category, this.period);
  }

  toggleRole(schoolId: number, teacherProfileId: number, currentRole: SchoolTeacherRole): void {
    const newRole: SchoolTeacherRole = currentRole === 'Admin' ? 'Teacher' : 'Admin';
    this.school.changeMemberRole(schoolId, teacherProfileId, { role: newRole });
  }

  removeMember(schoolId: number, teacherProfileId: number): void {
    if (!confirm('Biztosan eltávolítod ezt a tanárt az intézményből? A csoportjai lekerülnek az intézményről.')) return;
    this.school.removeMember(schoolId, teacherProfileId);
  }

  saveEdit(schoolId: number): void {
    if (!this.editName.trim()) return;
    this.school.update(schoolId, { name: this.editName.trim() });
  }

  deleteSchool(schoolId: number, groupCount: number): void {
    if (groupCount > 0) {
      alert('Az intézmény csak akkor törölhető, ha nincs hozzá kötött csoport.');
      return;
    }
    if (!confirm('Biztosan törlöd az intézményt?')) return;
    this.school.delete(schoolId, () => this.router.navigateByUrl('/intezmenyek'));
  }

  leave(schoolId: number): void {
    if (!confirm('Biztosan kilépsz az intézményből? A hozzá kötött csoportjaid lekerülnek az intézményről, és megszűnik a tartalom-megosztás.')) return;
    this.school.leave(schoolId, () => this.router.navigateByUrl('/intezmenyek'));
  }
}
