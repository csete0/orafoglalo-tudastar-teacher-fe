import { ChangeDetectionStrategy, Component, inject, input, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { finalize, take } from 'rxjs';
import { LocalSpinnerComponent } from '../../../shared/local-spinner/local-spinner.component';
import { TeacherQuizService } from '../../../services/teacher-quiz/teacher-quiz.service';
import { TeacherTaskSetService } from '../../../services/teacher-taskset/teacher-taskset.service';
import { TeacherProjectService } from '../../../services/teacher-project/teacher-project.service';
import { KahootHostService } from '../../../services/kahoot-host/kahoot-host.service';
import { TeacherGroupAssignmentDto } from '../../../models/teacher-quiz.model';
import { TeacherGroupTaskSetAssignmentDto } from '../../../models/teacher-content.model';
import { ProjectAssignmentDto, RUNTIME_LABELS } from '../../../models/teacher-project.model';
import { parseUtc } from '../../../shared/utc-date.util';

/** 48 órán belül lejáró határidő - vizuális sürgősség. */
export function isDueSoon(dueAt: string, now = Date.now()): boolean {
  const remaining = new Date(dueAt).getTime() - now;
  return remaining > 0 && remaining < 48 * 3600 * 1000;
}

/**
 * Csoportoldal „Kiadások” fül (UI-UX-T3: a tanár fejben a csoportból indul - „a 9.A-nak mi van kiadva?”):
 * kvíz-, feladatsor- (B4) és projekt-kiadások, kvíznél élő játék indításával.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-csoport-kiadasok',
  imports: [DatePipe, RouterLink, LocalSpinnerComponent],
  template: `
    <div class="max-w-4xl">
      <h2 id="kvizek" class="text-sm font-semibold text-text-muted uppercase tracking-wide mb-2 scroll-mt-20">Kvízek</h2>
      @if (assignmentsError(); as err) {
        <p class="text-danger text-sm mb-4">{{ err }}</p>
      }
      @if (assignmentsLoading()) {
        <app-local-spinner />
      } @else {
        <ul class="space-y-2 mb-6">
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
                  <button type="button" (click)="startLive(assignment)"
                          [disabled]="liveStartPending()"
                          class="btn btn-primary !px-2 !py-1 !text-xs">
                    Élő indítás
                  </button>
                }
              </div>
            </li>
          } @empty {
            <li class="text-sm text-text-muted py-2">Nincs kiadott kvíz.</li>
          }
        </ul>
        @if (liveStartError(); as err) {
          <p class="text-sm text-danger mb-4">{{ err }}</p>
        }
      }

      <h2 class="text-sm font-semibold text-text-muted uppercase tracking-wide mb-2">Feladatsorok</h2>
      @if (taskSetAssignmentsError(); as err) {
        <p class="text-danger text-sm mb-4">{{ err }}</p>
      }
      @if (taskSetAssignmentsLoading()) {
        <app-local-spinner />
      } @else {
        <ul class="space-y-2">
          @for (a of groupTaskSetAssignments(); track a.assignmentId) {
            <li class="card !rounded-xl p-3 text-sm flex items-center gap-3 flex-wrap">
              <div class="min-w-0 flex-1">
                <p class="font-medium truncate">
                  {{ a.taskSetTitle }}
                  @if (a.isTest) {
                    <span class="badge badge-warning ml-1">Dolgozat · {{ (a.timeLimitSeconds ?? 0) / 60 }} perc</span>
                  }
                </p>
                <p class="text-xs text-text-muted">
                  {{ a.taskCount }} feladat
                  · megírta: {{ a.completedMemberCount }} / {{ a.memberCount }}
                  @if (a.isTest && a.opensAt && a.dueAt) {
                    · megírható: {{ a.opensAt | date: 'MM.dd. HH:mm' }}–{{ a.dueAt | date: 'HH:mm' }}
                    @if (a.resultsPublishedAt) {
                      · <span class="text-success font-semibold">eredmény közzétéve</span>
                    }
                  } @else if (a.dueAt) {
                    · <span [class.text-danger]="isDueSoon(a.dueAt)">
                      határidő: {{ a.dueAt | date: 'yyyy.MM.dd. HH:mm' }}</span>
                  }
                </p>
              </div>
              @if (a.isTest) {
                <a [routerLink]="['/dolgozatok', a.assignmentId]" class="btn btn-primary !px-2 !py-1 !text-xs shrink-0">Áttekintés</a>
              }
            </li>
          } @empty {
            <li class="text-sm text-text-muted py-2">Nincs kiadott feladatsor. Kiadni a feladatsor-szerkesztőből lehet.</li>
          }
        </ul>
      }

      <!-- Projektműhely-kiadások (PATRICKS-PROJEKTMUHELY-2-TERV.md, F+G) -->
      <h2 class="text-sm font-semibold text-text-muted uppercase tracking-wide mb-2 mt-6">Projektek</h2>
      @if (projectAssignmentsError(); as err) {
        <p class="text-danger text-sm mb-4">{{ err }}</p>
      }
      <ul class="space-y-2" data-testid="group-project-assignments">
        @for (p of projectAssignments(); track p.id) {
          <li class="card !rounded-xl p-3 text-sm flex items-center gap-3 flex-wrap">
            <div class="min-w-0 flex-1">
              <p class="font-semibold">{{ p.projectTitle }}
                @if (p.isTest) { <span class="badge badge-warning ml-1">Dolgozat</span> }
              </p>
              <p class="text-xs text-text-muted">
                {{ p.startedCount }}/{{ p.memberCount }} elkezdte · {{ p.completedCount }} kész
                @if (p.runtime) { · csak {{ projectRuntimeLabels[p.runtime] }} }
                @if (p.dueAt) { · <span [class.text-danger]="isDueSoon(p.dueAt)">határidő: {{ utc(p.dueAt) | date: 'yyyy.MM.dd. HH:mm' }}</span> }
              </p>
            </div>
            <a [routerLink]="['/feladatsorok/projektek/kiadas', p.id]" class="btn btn-primary !px-2 !py-1 !text-xs shrink-0">Osztály-nézet</a>
          </li>
        } @empty {
          <li class="text-sm text-text-muted py-2">Nincs kiadott projekt. Kiadni a Feladatsorok → Projektek fülön lehet.</li>
        }
      </ul>
    </div>
  `,
})
export class CsoportKiadasokComponent implements OnInit {
  readonly groupId = input.required<number>();

  private readonly router = inject(Router);
  private readonly teacherQuizService = inject(TeacherQuizService);
  private readonly teacherTaskSetService = inject(TeacherTaskSetService);
  private readonly teacherProjectService = inject(TeacherProjectService);
  private readonly kahootHostService = inject(KahootHostService);

  readonly groupAssignments = signal<TeacherGroupAssignmentDto[]>([]);
  readonly assignmentsLoading = signal(false);
  readonly assignmentsError = signal<string | null>(null);
  readonly groupTaskSetAssignments = signal<TeacherGroupTaskSetAssignmentDto[]>([]);
  readonly taskSetAssignmentsLoading = signal(false);
  readonly taskSetAssignmentsError = signal<string | null>(null);
  readonly projectAssignments = signal<ProjectAssignmentDto[]>([]);
  readonly projectAssignmentsError = signal<string | null>(null);
  readonly liveStartPending = signal(false);
  readonly liveStartError = signal<string | null>(null);

  readonly projectRuntimeLabels = RUNTIME_LABELS;
  readonly utc = parseUtc;
  readonly isDueSoon = isDueSoon;

  ngOnInit(): void {
    const groupId = this.groupId();

    this.assignmentsLoading.set(true);
    this.teacherQuizService.getGroupAssignments(groupId)
      .pipe(take(1), finalize(() => this.assignmentsLoading.set(false)))
      .subscribe({
        next: (assignments) => this.groupAssignments.set(assignments),
        error: () => this.assignmentsError.set('A kiadások betöltése sikertelen.'),
      });

    this.taskSetAssignmentsLoading.set(true);
    this.teacherTaskSetService.getGroupTaskSetAssignments(groupId)
      .pipe(take(1), finalize(() => this.taskSetAssignmentsLoading.set(false)))
      .subscribe({
        next: (assignments) => this.groupTaskSetAssignments.set(assignments),
        error: () => this.taskSetAssignmentsError.set('A feladatsor-kiadások betöltése sikertelen.'),
      });

    this.teacherProjectService.forGroup(groupId).pipe(take(1)).subscribe({
      next: (assignments) => this.projectAssignments.set(assignments),
      error: () => this.projectAssignmentsError.set('A projekt-kiadások betöltése sikertelen.'),
    });
  }

  startLive(assignment: TeacherGroupAssignmentDto): void {
    if (this.liveStartPending()) return;
    this.liveStartPending.set(true);
    this.liveStartError.set(null);
    this.kahootHostService
      .createRoom(assignment.quizId, this.groupId())
      .pipe(take(1), finalize(() => this.liveStartPending.set(false)))
      .subscribe({
        next: (room) =>
          void this.router.navigate(['/feladatsorok', 'kvizek', assignment.quizId, 'elo', room.kahootSessionId]),
        error: () => this.liveStartError.set('Az élő játék indítása sikertelen.'),
      });
  }
}
