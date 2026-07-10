import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { GroupStore } from '../../services/group/group.store';
import { SchoolStore } from '../../services/school/school.store';
import { ReportStore } from '../../services/report/report.store';
import { LeaderboardStore } from '../../services/leaderboard/leaderboard.store';
import { LeaderboardCategory, LeaderboardPeriod } from '../../models/leaderboard.model';
import { environment } from '../../../environments/environment';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';

type Tab = 'tagok' | 'eredmenyek' | 'ranglista' | 'meghivo';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-csoport-reszletek',
  standalone: true,
  imports: [FormsModule, RouterLink, IconComponent, LocalSpinnerComponent],
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
          }
        </div>
        @if (schoolStore.schools().length > 0) {
          <div class="flex items-center gap-2 mt-4 text-sm">
            <label class="text-text-muted">Intézmény:</label>
            <select [ngModel]="group.schoolId" (ngModelChange)="changeSchool(group.id, group.name, $event)"
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
        <div class="hairline"></div>

        <nav class="flex gap-4 border-b border-border-default mb-6">
          @for (option of tabs; track option.value) {
            <button (click)="setTab(option.value)" class="tab-btn"
              [class.tab-btn-active]="tab() === option.value">
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
                <li class="flex justify-between items-center card !rounded-xl p-3 text-sm">
                  <div class="flex items-center gap-3 min-w-0">
                    <div class="w-9 h-9 rounded-full bg-primary-subtle text-primary text-xs font-bold flex items-center justify-center shrink-0">
                      {{ initials(member.name) }}</div>
                    <div class="min-w-0">
                      <p class="truncate">{{ member.name }}</p>
                      <p class="text-xs text-text-muted truncate">{{ member.email }}</p>
                    </div>
                  </div>
                  <button (click)="removeMember(group.id, member.userId)" class="text-danger hover:underline shrink-0">Eltávolítás</button>
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
            <div class="card overflow-hidden">
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

          @case ('meghivo') {
            <div class="card p-5 space-y-3">
              <div class="flex items-center gap-3">
                <div class="icon-tile icon-tile-primary">
                  <app-icon name="link" class="w-6 h-6 block" />
                </div>
                <p class="text-sm">Meghívó kód: <code class="font-bold">{{ group.inviteCode }}</code></p>
              </div>
              <p class="text-sm break-all">Csatlakozási link: <code>{{ joinLink(group.inviteCode) }}</code></p>
              <button (click)="regenerateInvite(group.id)" class="btn btn-primary">
                Új kód generálása
              </button>
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

  async removeMember(groupId: number, userId: number): Promise<void> {
    const ok = await this.confirmService.ask({
      message: 'Biztosan eltávolítod ezt a diákot a csoportból?',
      danger: true,
      confirmLabel: 'Eltávolítás',
    });
    if (!ok) return;
    this.store.removeMember(groupId, userId, () => this.toastService.success('Diák eltávolítva a csoportból.'));
  }

  async archive(groupId: number): Promise<void> {
    const ok = await this.confirmService.ask({
      message: 'Biztosan archiválod a csoportot? A tagok elveszítik a tartalom-hozzáférést.',
      danger: true,
      confirmLabel: 'Archiválás',
    });
    if (!ok) return;
    this.store.archive(groupId, () => {
      this.toastService.success('Csoport archiválva.');
      this.router.navigateByUrl('/csoportok');
    });
  }

  async changeSchool(groupId: number, groupName: string, schoolId: number | null): Promise<void> {
    if (schoolId !== null) {
      const schoolName = this.schoolStore.schools().find((s) => s.id === schoolId)?.name ?? '';
      const ok = await this.confirmService.ask({
        message: `Biztosan a(z) „${schoolName}” intézményhez kötöd ezt a csoportot? A tagok minden korábbi eredménye láthatóvá válik az intézmény igazgatója számára, és a diákok erről értesítést kapnak.`,
      });
      if (!ok) return;
    }
    this.store.update(groupId, { name: groupName, schoolId: schoolId ?? undefined }, () =>
      this.toastService.success('Csoport frissítve.'),
    );
  }

  regenerateInvite(groupId: number): void {
    this.store.regenerateInvite(groupId, () => this.toastService.success('Új meghívó kód generálva.'));
  }
}
