import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { take } from 'rxjs';
import { TeacherQuizService } from '../../../services/teacher-quiz/teacher-quiz.service';
import { TeacherTaskSetService } from '../../../services/teacher-taskset/teacher-taskset.service';
import { TeacherProjectService } from '../../../services/teacher-project/teacher-project.service';
import { parseUtc } from '../../../shared/utc-date.util';

export interface UpcomingDeadline {
  key: string;
  kind: 'Kvíz' | 'Feladatsor' | 'Dolgozat' | 'Projekt';
  title: string;
  dueAt: number;
  link: (string | number)[];
}

const DAY_MS = 24 * 3600 * 1000;

/** A következő `days` napban lejáró határidők, időrendben, legfeljebb `max` darab. */
export function upcomingDeadlines(items: UpcomingDeadline[], now: number, days = 14, max = 5): UpcomingDeadline[] {
  return items
    .filter((d) => d.dueAt > now && d.dueAt <= now + days * DAY_MS)
    .sort((a, b) => a.dueAt - b.dueAt)
    .slice(0, max);
}

/**
 * Csoportoldal „Áttekintés” fül (alapértelmezett). Egyelőre a közelgő határidők listája a három kiadás-típusból;
 * az összesítő sávot és a diák-táblázatot a modernizálási terv 4. feladata adja hozzá.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-csoport-attekintes',
  imports: [DatePipe, RouterLink],
  template: `
    <section aria-labelledby="kozelgo-hataridok" class="max-w-4xl">
      <h2 id="kozelgo-hataridok" class="text-lg font-bold mb-3">Közelgő határidők</h2>
      @if (error()) {
        <p class="text-danger text-sm mb-3">Néhány kiadás betöltése sikertelen - a lista hiányos lehet.</p>
      }
      <ul class="card divide-y divide-border-default">
        @for (d of deadlines(); track d.key) {
          <li class="flex items-center gap-3 p-3 text-sm">
            <span class="badge badge-neutral shrink-0">{{ d.kind }}</span>
            <a [routerLink]="d.link" class="flex-1 min-w-0 truncate hover:underline">{{ d.title }}</a>
            <span class="text-text-muted shrink-0">{{ d.dueAt | date: 'MM.dd. HH:mm' }}</span>
          </li>
        } @empty {
          <li class="p-3 text-sm text-text-muted">A következő 14 napban nincs lejáró határidő.</li>
        }
      </ul>
    </section>
  `,
})
export class CsoportAttekintesComponent implements OnInit {
  readonly groupId = input.required<number>();

  private readonly teacherQuizService = inject(TeacherQuizService);
  private readonly teacherTaskSetService = inject(TeacherTaskSetService);
  private readonly teacherProjectService = inject(TeacherProjectService);

  private readonly quizDeadlines = signal<UpcomingDeadline[]>([]);
  private readonly taskSetDeadlines = signal<UpcomingDeadline[]>([]);
  private readonly projectDeadlines = signal<UpcomingDeadline[]>([]);
  readonly error = signal(false);

  readonly deadlines = computed(() =>
    upcomingDeadlines([...this.quizDeadlines(), ...this.taskSetDeadlines(), ...this.projectDeadlines()], Date.now()));

  ngOnInit(): void {
    const groupId = this.groupId();
    const onError = () => this.error.set(true);

    // Független hívások: egy hiba ne ürítse ki a teljes listát.
    this.teacherQuizService.getGroupAssignments(groupId).pipe(take(1)).subscribe({
      next: (list) => this.quizDeadlines.set(list.flatMap((a) => a.dueAt ? [{
        key: `q${a.assignmentId}`, kind: 'Kvíz' as const, title: a.quizTitle, dueAt: parseUtc(a.dueAt),
        link: ['/feladatsorok', 'kvizek', a.quizId, 'eredmenyek'],
      }] : [])),
      error: onError,
    });
    this.teacherTaskSetService.getGroupTaskSetAssignments(groupId).pipe(take(1)).subscribe({
      next: (list) => this.taskSetDeadlines.set(list.flatMap((a) => a.dueAt ? [{
        key: `t${a.assignmentId}`, kind: a.isTest ? 'Dolgozat' as const : 'Feladatsor' as const, title: a.taskSetTitle,
        dueAt: parseUtc(a.dueAt), link: a.isTest ? ['/dolgozatok', a.assignmentId] : ['/feladatsorok', a.taskSetId, 'eredmenyek'],
      }] : [])),
      error: onError,
    });
    this.teacherProjectService.forGroup(groupId).pipe(take(1)).subscribe({
      next: (list) => this.projectDeadlines.set(list.flatMap((p) => p.dueAt ? [{
        key: `p${p.id}`, kind: 'Projekt' as const, title: p.projectTitle, dueAt: parseUtc(p.dueAt),
        link: ['/feladatsorok/projektek/kiadas', p.id],
      }] : [])),
      error: onError,
    });
  }
}
