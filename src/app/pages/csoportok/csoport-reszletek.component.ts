import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GroupStore } from '../../services/group/group.store';
import { SchoolStore } from '../../services/school/school.store';
import { ReportStore } from '../../services/report/report.store';
import { LeaderboardStore } from '../../services/leaderboard/leaderboard.store';
import { LeaderboardCategory, LeaderboardPeriod } from '../../models/leaderboard.model';
import { environment } from '../../../environments/environment';

type Tab = 'tagok' | 'eredmenyek' | 'ranglista' | 'meghivo';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-csoport-reszletek',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    @if (store.selectedGroup(); as group) {
      <div class="max-w-3xl mx-auto px-4 py-10">
        <div class="flex justify-between items-start mb-1">
          <h1 class="text-xl font-semibold">{{ group.name }}</h1>
          @if (!group.isArchived) {
            <button (click)="archive(group.id)" class="text-sm text-danger hover:underline">Archiválás</button>
          }
        </div>
        @if (schoolStore.schools().length > 0) {
          <div class="flex items-center gap-2 mb-6 text-sm">
            <label class="text-text-muted">Intézmény:</label>
            <select [ngModel]="group.schoolId" (ngModelChange)="changeSchool(group.id, group.name, $event)"
              class="rounded border border-border-default bg-bg-element px-2 py-1">
              <option [ngValue]="null">Nincs intézményhez kötve (magántanár)</option>
              @for (school of schoolStore.schools(); track school.id) {
                <option [ngValue]="school.id">{{ school.name }}</option>
              }
            </select>
          </div>
        } @else if (group.schoolName) {
          <p class="text-text-muted mb-6">Intézmény: {{ group.schoolName }}</p>
        }

        <nav class="flex gap-4 border-b border-border-default mb-6 text-sm">
          @for (option of tabs; track option.value) {
            <button (click)="setTab(option.value)" [class.border-primary]="tab() === option.value"
              [class.text-text-muted]="tab() !== option.value" class="pb-2 border-b-2 border-transparent">
              {{ option.label }}
            </button>
          }
        </nav>

        @if (store.error()) {
          <p class="text-danger text-sm mb-4">{{ store.error() }}</p>
        }

        @switch (tab()) {
          @case ('tagok') {
            <ul class="space-y-2">
              @for (member of store.members(); track member.userId) {
                <li class="flex justify-between items-center bg-bg-panel border border-border-default rounded-lg p-3 text-sm">
                  <div>
                    <p>{{ member.name }}</p>
                    <p class="text-xs text-text-muted">{{ member.email }}</p>
                  </div>
                  <button (click)="removeMember(group.id, member.userId)" class="text-danger hover:underline">Eltávolítás</button>
                </li>
              } @empty {
                <li class="text-text-muted">Még nincs tag a csoportban.</li>
              }
            </ul>
          }

          @case ('eredmenyek') {
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-text-muted border-b border-border-default">
                  <th class="py-2">Diák</th>
                  <th class="py-2">Vizsgák</th>
                  <th class="py-2">Átlag %</th>
                  <th class="py-2">Kvíz pontosság</th>
                </tr>
              </thead>
              <tbody>
                @for (student of report.groupActivity(); track student.userId) {
                  <tr class="border-b border-border-default">
                    <td class="py-2">
                      <a [routerLink]="['/diakok', student.userId]" class="text-primary hover:underline">{{ student.name }}</a>
                    </td>
                    <td class="py-2">{{ student.completedExamsCount }}</td>
                    <td class="py-2">{{ student.averageExamScorePercent ?? '–' }}</td>
                    <td class="py-2">{{ student.quizAccuracyPercent ?? '–' }}</td>
                  </tr>
                } @empty {
                  <tr><td colspan="4" class="py-4 text-text-muted">Nincs adat.</td></tr>
                }
              </tbody>
            </table>
          }

          @case ('ranglista') {
            <div class="flex gap-2 mb-4 text-sm">
              <select [(ngModel)]="category" (ngModelChange)="loadLeaderboard(group.id)"
                class="rounded border border-border-default bg-bg-element px-2 py-1">
                <option value="quiz">Kvíz</option>
                <option value="exam">Vizsga</option>
              </select>
              <select [(ngModel)]="period" (ngModelChange)="loadLeaderboard(group.id)"
                class="rounded border border-border-default bg-bg-element px-2 py-1">
                <option value="weekly">Heti</option>
                <option value="monthly">Havi</option>
                <option value="alltime">Összes idő</option>
              </select>
            </div>

            <ol class="space-y-1">
              @for (entry of leaderboard.leaderboard()?.topEntries; track entry.rank) {
                <li class="flex justify-between bg-bg-panel border border-border-default rounded-lg p-2 text-sm">
                  <span>{{ entry.rank }}. {{ entry.nickname }}</span>
                  <span>{{ entry.score }}</span>
                </li>
              } @empty {
                <li class="text-text-muted text-sm">Még nincs ranglista-adat.</li>
              }
            </ol>
          }

          @case ('meghivo') {
            <div class="bg-bg-panel border border-border-default rounded-lg p-4 space-y-3">
              <p class="text-sm">Meghívó kód: <code>{{ group.inviteCode }}</code></p>
              <p class="text-sm break-all">Csatlakozási link: <code>{{ joinLink(group.inviteCode) }}</code></p>
              <button (click)="store.regenerateInvite(group.id)"
                class="rounded bg-primary hover:bg-primary-hover text-white px-3 py-1.5 text-sm">
                Új kód generálása
              </button>
            </div>
          }
        }
      </div>
    } @else if (store.loading()) {
      <p class="text-text-muted text-center py-10">Betöltés…</p>
    } @else {
      <p class="text-text-muted text-center py-10">A csoport nem található.</p>
    }
  `,
})
export class CsoportReszletekComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly store = inject(GroupStore);
  readonly schoolStore = inject(SchoolStore);
  readonly report = inject(ReportStore);
  readonly leaderboard = inject(LeaderboardStore);

  readonly tabs: { value: Tab; label: string }[] = [
    { value: 'tagok', label: 'Tagok' },
    { value: 'eredmenyek', label: 'Eredmények' },
    { value: 'ranglista', label: 'Ranglista' },
    { value: 'meghivo', label: 'Meghívó' },
  ];

  readonly tab = signal<Tab>('tagok');
  category: LeaderboardCategory = 'quiz';
  period: LeaderboardPeriod = 'weekly';

  private groupId = 0;

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

  setTab(tab: Tab): void {
    this.tab.set(tab);
    if (tab === 'tagok') this.store.loadMembers(this.groupId);
    if (tab === 'eredmenyek') this.report.loadGroupActivity(this.groupId);
    if (tab === 'ranglista') this.loadLeaderboard(this.groupId);
  }

  loadLeaderboard(groupId: number): void {
    this.leaderboard.loadGroupLeaderboard(groupId, this.category, this.period);
  }

  joinLink(code: string): string {
    return `${environment.studentAppUrl}/csoport/csatlakozas?code=${code}`;
  }

  removeMember(groupId: number, userId: number): void {
    if (!confirm('Biztosan eltávolítod ezt a diákot a csoportból?')) return;
    this.store.removeMember(groupId, userId);
  }

  archive(groupId: number): void {
    if (!confirm('Biztosan archiválod a csoportot? A tagok elveszítik a tartalom-hozzáférést.')) return;
    this.store.archive(groupId, () => this.router.navigateByUrl('/csoportok'));
  }

  changeSchool(groupId: number, groupName: string, schoolId: number | null): void {
    if (schoolId !== null) {
      const schoolName = this.schoolStore.schools().find((s) => s.id === schoolId)?.name ?? '';
      if (!confirm(`Biztosan a(z) „${schoolName}” intézményhez kötöd ezt a csoportot? A tagok minden korábbi eredménye láthatóvá válik az intézmény igazgatója számára, és a diákok erről értesítést kapnak.`)) {
        return;
      }
    }
    this.store.update(groupId, { name: groupName, schoolId: schoolId ?? undefined });
  }
}
