import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../services/auth/store/auth.store';
import { IconComponent, IconName } from '../../shared/icon/icon.component';
import { KahootActiveRoomDto } from '../../models/kahoot-host.model';
import { KahootHostService } from '../../services/kahoot-host/kahoot-host.service';
import { ReportService } from '../../services/report/report.service';
import { TeacherDashboardDto } from '../../models/report.model';
import { DatePipe } from '@angular/common';

interface DashboardCard {
  path: string;
  title: string;
  description: string;
  icon: IconName;
  accent: string;
  tile: string;
}

const CARDS: DashboardCard[] = [
  {
    path: '/intezmenyek',
    title: 'Intézményeim',
    description: 'Iskolák és szervezetek, tanári tagságok és igazgatói riportok.',
    icon: 'building',
    accent: 'accent-0',
    tile: 'icon-tile-primary',
  },
  {
    path: '/csoportok',
    title: 'Csoportjaim',
    description: 'Diák-csoportok meghívó kóddal, eredmények és ranglisták.',
    icon: 'users',
    accent: 'accent-1',
    tile: 'icon-tile-secondary',
  },
  {
    path: '/feladatsorok',
    title: 'Feladatsoraim',
    description: 'Saját feladatsorok szerkesztése, fájlok és publikálás.',
    icon: 'clipboard-list',
    accent: 'accent-2',
    tile: 'icon-tile-success',
  },
  // UI-UX-T2: a Kvízek felület a 6-linkes nav-korlát miatt csak a Feladatsorok
  // fülén él - a vezérlőpultról viszont közvetlenül elérhetőnek kell lennie.
  {
    path: '/feladatsorok/kvizek',
    title: 'Kvízeim',
    description: 'Kvízek összeállítása, kiadás csoportoknak és élő játék indítása.',
    icon: 'academic-cap',
    accent: 'accent-3',
    tile: 'icon-tile-warning',
  },
];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, IconComponent, DatePipe],
  template: `
    <div class="max-w-3xl mx-auto px-4 py-10">
      <h1 class="page-title">Üdv, {{ authStore.currentUser()?.firstName }}!</h1>
      <p class="text-sm text-text-muted mt-1">Tanári vezérlőpult</p>
      <div class="hairline"></div>

      <!--
        UX-audit nyomán: korábban egy éppen élő (vagy beragadt) Kahoot-szoba KIZÁRÓLAG
        abból a kvíz-szerkesztőből volt felfedezhető/zárható, amelyikhez tartozott -
        itt, a vezérlőpulton, minden saját kvíz élő szobája egy helyen látszik, és a
        "Megnyitás" a meglévő host-nézetbe visz, ahol a játék lezárható.
      -->
      @if (activeRooms().length) {
        <div class="rounded-2xl border p-4 mb-6" style="border-color: var(--color-warning);">
          <h2 class="font-bold mb-3 flex items-center gap-2">
            <span class="inline-block w-2 h-2 rounded-full animate-pulse" style="background-color: var(--color-warning);"></span>
            Élő játék fut ({{ activeRooms().length }})
          </h2>
          <ul class="flex flex-col gap-2">
            @for (room of activeRooms(); track room.kahootSessionId) {
              <li class="flex items-center justify-between gap-3 text-sm">
                <span class="min-w-0 truncate">
                  <strong>{{ room.quizTitle }}</strong> · {{ room.groupName }} · {{ room.participantCount }} csatlakozott
                </span>
                <a
                  [routerLink]="['/feladatsorok/kvizek', room.quizId, 'elo', room.kahootSessionId]"
                  class="shrink-0 text-primary text-xs font-semibold whitespace-nowrap"
                >
                  Megnyitás
                </a>
              </li>
            }
          </ul>
        </div>
      }

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        @for (card of cards; track card.path) {
          <a [routerLink]="card.path" class="card-link block group" [class]="card.accent">
            <div class="accent-bar"></div>
            <div class="p-5">
              <div class="icon-tile mb-3" [class]="card.tile">
                <app-icon [name]="card.icon" class="w-6 h-6 block" />
              </div>
              <h2 class="font-bold mb-1">{{ card.title }}</h2>
              <p class="text-xs text-text-muted mb-4">{{ card.description }}</p>
              <div class="flex items-center gap-1 pt-3 border-t border-border-default text-sm text-primary">
                Megnyitás
                <app-icon name="arrow-right" class="w-4 h-4 block transition-transform group-hover:translate-x-1" />
              </div>
            </div>
          </a>
        }
      </div>

      <!-- ── UI-UX-T2: Közelgő határidők ── -->
      @if (dashboard(); as d) {
        @if (d.upcomingDeadlines.length) {
          <section class="card p-5 mt-6">
            <h2 class="font-bold mb-3">Közelgő határidők</h2>
            <ul class="space-y-2">
              @for (deadline of d.upcomingDeadlines; track deadline.assignmentId) {
                <li class="flex items-center justify-between gap-3 text-sm">
                  <span class="min-w-0 truncate">
                    <a [routerLink]="['/feladatsorok/kvizek', deadline.quizId, 'eredmenyek']"
                       class="font-semibold text-primary hover:underline">{{ deadline.quizTitle }}</a>
                    · {{ deadline.groupName }}
                    · megírta: {{ deadline.completedMemberCount }} / {{ deadline.memberCount }}
                  </span>
                  <span class="shrink-0 text-xs"
                        [class.text-danger]="isDueSoon(deadline.dueAt)"
                        [class.font-bold]="isDueSoon(deadline.dueAt)"
                        [class.text-text-muted]="!isDueSoon(deadline.dueAt)">
                    {{ deadline.dueAt | date: 'MM.dd. HH:mm' }}
                  </span>
                </li>
              }
            </ul>
          </section>
        }

        <!-- ── UI-UX-T2: Friss kvíz-eredmények ── -->
        @if (d.recentQuizResults.length) {
          <section class="card p-5 mt-6">
            <h2 class="font-bold mb-3">Friss kvíz-eredmények</h2>
            <ul class="space-y-2">
              @for (result of d.recentQuizResults; track result.sessionId) {
                <li class="flex items-center justify-between gap-3 text-sm">
                  <span class="min-w-0 truncate">
                    <strong>{{ result.studentName }}</strong>
                    ·
                    <a [routerLink]="['/feladatsorok/kvizek', result.quizId, 'eredmenyek']"
                       class="text-primary hover:underline">{{ result.quizTitle }}</a>
                    @if (result.mode === 'live') {
                      <span class="badge badge-primary !text-[10px] !px-1.5 !py-0.5 ml-1">Élő</span>
                    }
                  </span>
                  <span class="shrink-0 text-xs text-text-muted">
                    <strong class="text-text-primary">{{ result.correctAnswers }}/{{ result.totalQuestions }}
                      ({{ result.successRate }}%)</strong>
                    · {{ result.completedAt | date: 'MM.dd. HH:mm' }}
                  </span>
                </li>
              }
            </ul>
          </section>
        }
      }
    </div>
  `,
})
export class DashboardComponent implements OnInit {
  readonly authStore = inject(AuthStore);
  private readonly kahootHostService = inject(KahootHostService);
  readonly cards = CARDS;
  readonly activeRooms = signal<KahootActiveRoomDto[]>([]);
  private readonly reportService = inject(ReportService);
  readonly dashboard = signal<TeacherDashboardDto | null>(null);

  /** 48 órán belül lejáró határidő - vizuális sürgősség. */
  isDueSoon(dueAt: string): boolean {
    const remaining = new Date(dueAt).getTime() - Date.now();
    return remaining > 0 && remaining < 48 * 3600 * 1000;
  }

  ngOnInit(): void {
    // Nem kritikus dísz-elem - a hibája (pl. átmeneti hálózati gond) nem
    // akaszthatja meg a vezérlőpult többi részét, ezért csendben nyeljük.
    this.kahootHostService.getActiveRooms().subscribe({
      next: (rooms) => this.activeRooms.set(rooms),
      error: () => this.activeRooms.set([]),
    });
    // UI-UX-T2: az élő blokkok ugyanígy nem kritikusak - hibánál egyszerűen
    // nem jelennek meg, a navigációs kártyák működnek tovább.
    this.reportService.getDashboard().subscribe({
      next: (dashboard) => this.dashboard.set(dashboard),
      error: () => this.dashboard.set(null),
    });
  }
}
