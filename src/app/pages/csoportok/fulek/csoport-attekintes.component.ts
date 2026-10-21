import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Observable, take } from 'rxjs';
import { TeacherQuizService } from '../../../services/teacher-quiz/teacher-quiz.service';
import { TeacherTaskSetService } from '../../../services/teacher-taskset/teacher-taskset.service';
import { TeacherProjectService } from '../../../services/teacher-project/teacher-project.service';
import { ReportService } from '../../../services/report/report.service';
import { TeacherTeamService } from '../../../services/team/teacher-team.service';
import { TeacherGroupAssignmentDto } from '../../../models/teacher-quiz.model';
import { TeacherGroupTaskSetAssignmentDto } from '../../../models/teacher-content.model';
import { ProjectAssignmentDto } from '../../../models/teacher-project.model';
import { StudentActivitySummaryDto, TeacherWeakTopicDto } from '../../../models/report.model';
import { Team } from '../../../models/team.model';
import { parseUtc } from '../../../shared/utc-date.util';
import { floorPercent } from '../gyenge-temak-javaslatok.component';
import { CsoportTabTarget } from './csoport-fulek';

export interface UpcomingDeadline {
  key: string;
  kind: 'Kvíz' | 'Feladatsor' | 'Dolgozat' | 'Projekt';
  title: string;
  dueAt: number;
  link: (string | number)[];
}

export type StudentFlag = 'inaktív' | 'lemaradt' | null;

const DAY_MS = 24 * 3600 * 1000;

/** A következő `days` napban lejáró határidők, időrendben, legfeljebb `max` darab. */
export function upcomingDeadlines(items: UpcomingDeadline[], now: number, days = 14, max = 5): UpcomingDeadline[] {
  return items
    .filter((d) => d.dueAt > now && d.dueAt <= now + days * DAY_MS)
    .sort((a, b) => a.dueAt - b.dueAt)
    .slice(0, max);
}

/** Az időszakban legalább egy befejezett vizsgát vagy kvízt beadó diákok száma. */
export function activeCount(rows: StudentActivitySummaryDto[]): number {
  return rows.filter((r) => r.completedExamsCount + r.completedQuizSessionsCount > 0).length;
}

/** A diákonkénti vizsga-átlagok átlaga, lefelé kerekítve; ha senkinek nincs átlaga: null. */
export function averageOfAverages(rows: StudentActivitySummaryDto[]): number | null {
  const values = rows.flatMap((r) => r.averageExamScorePercent ?? []);
  return values.length ? floorPercent(values.reduce((sum, v) => sum + v, 0) / values.length) : null;
}

/** Jelzés a 30 napos aktivitásból: nincs vizsga és kvíz → inaktív; 50% alatti átlag → lemaradt. */
export function studentFlag(row: StudentActivitySummaryDto): StudentFlag {
  if (row.completedExamsCount + row.completedQuizSessionsCount === 0) return 'inaktív';
  return row.averageExamScorePercent != null && row.averageExamScorePercent < 50 ? 'lemaradt' : null;
}

/** Futó kiadás: nincs határideje, vagy a határidő még nem járt le. */
export function isRunning(dueAt: string | null | undefined, now: number): boolean {
  return !dueAt || parseUtc(dueAt) > now;
}

/** Lejárt, de még közzé nem tett eredményű dolgozatok, a legrégebbi határidővel kezdve. */
export function awaitingPublication(list: TeacherGroupTaskSetAssignmentDto[], now: number): TeacherGroupTaskSetAssignmentDto[] {
  return list
    .filter((a) => a.isTest && !!a.dueAt && parseUtc(a.dueAt) < now && !a.resultsPublishedAt)
    .sort((a, b) => parseUtc(a.dueAt!) - parseUtc(b.dueAt!));
}

/**
 * Csoportoldal „Áttekintés” fül (alapértelmezett): összesítő sáv, diák-táblázat jelzésekkel, közelgő határidők,
 * gyenge témák kivonata és Technikum-kártya - kizárólag meglévő végpontokból. A hívások függetlenek: egy hiba csak a
 * saját csempéjét/blokkját üríti („–”), az oldal többi része megmarad.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-csoport-attekintes',
  imports: [DatePipe, RouterLink],
  template: `
    @if (error()) {
      <p class="text-danger text-sm mb-3">Néhány adat betöltése sikertelen - a hiányzó értékek helyén „–” áll.</p>
    }

    <section aria-label="Összesítő" class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      <div class="card p-4" data-testid="tile-active">
        <p class="text-xs text-text-muted">Aktív ezen a héten</p>
        <p class="text-2xl font-bold tabular-nums">
          @if (activity7(); as rows) { {{ activeThisWeek() }} <span class="text-base font-normal text-text-muted">/ {{ rows.length }}</span> } @else { – }
        </p>
      </div>
      <div class="card p-4" data-testid="tile-average">
        <p class="text-xs text-text-muted">Átlag (utolsó 30 nap)</p>
        <p class="text-2xl font-bold tabular-nums">{{ average() === null ? '–' : average() + '%' }}</p>
      </div>
      <div class="card p-4" data-testid="tile-running">
        <p class="text-xs text-text-muted">Futó kiadások</p>
        <p class="text-2xl font-bold tabular-nums">{{ runningCount() ?? '–' }}</p>
      </div>
      <div class="card p-4" data-testid="tile-todo">
        <p class="text-xs text-text-muted">Teendő</p>
        @if (pendingTests(); as pending) {
          @if (pending.length) {
            <p class="font-semibold text-warning">{{ pending.length }} dolgozat közzétételre vár</p>
            <ul class="text-sm mt-1 space-y-0.5">
              @for (a of pending.slice(0, 3); track a.assignmentId) {
                <li class="truncate"><a [routerLink]="['/dolgozatok', a.assignmentId]" class="text-primary hover:underline">{{ a.taskSetTitle }}</a></li>
              }
            </ul>
          } @else {
            <p class="font-semibold">Nincs teendő</p>
          }
        } @else {
          <p class="text-2xl font-bold">–</p>
        }
      </div>
    </section>

    <div class="grid gap-6 lg:grid-cols-[1fr_20rem] items-start">
      <section aria-labelledby="diakok-attekintes" class="min-w-0">
        <h2 id="diakok-attekintes" class="text-lg font-bold mb-3">Diákok - ki hol tart</h2>
        <div class="card overflow-hidden">
          <div class="data-table-scroll">
            <table class="data-table">
              <thead>
                <tr>
                  <th class="sticky-col">Diák</th>
                  <th>Átlag (30 nap)</th>
                  <th>Vizsgák</th>
                  <th>Kvíz-pontosság</th>
                  <th>Jelzés</th>
                </tr>
              </thead>
              <tbody>
                @for (s of students(); track s.row.userId) {
                  <tr>
                    <td class="sticky-col whitespace-nowrap">
                      <a [routerLink]="['/diakok', s.row.userId]" class="text-primary hover:underline">{{ s.row.name }}</a>
                    </td>
                    <td class="num">{{ s.row.averageExamScorePercent == null ? '–' : s.row.averageExamScorePercent + '%' }}</td>
                    <td class="num">{{ s.row.completedExamsCount }}</td>
                    <td class="num">{{ s.row.quizAccuracyPercent == null ? '–' : s.row.quizAccuracyPercent + '%' }}</td>
                    <td>
                      @if (s.flag) {
                        <span class="badge" [class.badge-neutral]="s.flag === 'inaktív'" [class.badge-danger]="s.flag === 'lemaradt'">{{ s.flag }}</span>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="5" class="py-6 text-text-muted text-center">{{ activity30() ? 'Még nincs tag a csoportban.' : '–' }}</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <div class="space-y-6 min-w-0">
        <section aria-labelledby="kozelgo-hataridok">
          <h2 id="kozelgo-hataridok" class="text-lg font-bold mb-3">Közelgő határidők</h2>
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

        <section aria-labelledby="gyenge-temak-kivonat">
          <h2 id="gyenge-temak-kivonat" class="text-lg font-bold mb-3">Gyenge témák</h2>
          <div class="card p-3 text-sm">
            @if (weakTopics(); as topics) {
              @if (topics.length) {
                <ul class="space-y-1.5 mb-2">
                  @for (t of topics.slice(0, 3); track t.topicId) {
                    <li class="flex justify-between gap-3">
                      <span class="truncate">{{ t.topicName }}</span>
                      <span class="font-semibold tabular-nums text-danger shrink-0">{{ pct(t.successRate) }}%</span>
                    </li>
                  }
                </ul>
                <button type="button" class="text-primary hover:underline"
                  (click)="openTab.emit({ tab: 'eredmenyek', section: 'gyenge-temak' })">Gyakorló sor kiadása erre →</button>
              } @else {
                <p class="text-text-muted">Nincs gyenge téma (vagy még kevés az adat).</p>
              }
            } @else {
              <p class="text-text-muted">–</p>
            }
          </div>
        </section>

        @if (showTerkep() || teams()) {
          <section aria-labelledby="technikum-kivonat">
            <h2 id="technikum-kivonat" class="text-lg font-bold mb-3">Technikum</h2>
            <div class="card p-3 text-sm space-y-2">
              @if (teams()) {
                <p data-testid="technikum-teams">{{ activeTeamCount() }} csapat · {{ proposedTeamCount() }} javaslat vár jóváhagyásra</p>
                <button type="button" class="text-primary hover:underline block"
                  (click)="openTab.emit({ tab: 'technikum', section: 'csapatok' })">Csapatok →</button>
              }
              @if (showTerkep()) {
                <button type="button" class="text-primary hover:underline block"
                  (click)="openTab.emit({ tab: 'technikum', section: 'vizsgaresz-terkep' })">Vizsgarész-térkép →</button>
              }
            </div>
          </section>
        }
      </div>
    </div>
  `,
})
export class CsoportAttekintesComponent implements OnInit {
  readonly groupId = input.required<number>();
  /** A vizsgarész-térkép elérhető (a szülő `terkepVisible`-je). */
  readonly showTerkep = input(false);
  /** Fülváltás kérése a szülőtől (szakasz-horgonnyal). */
  readonly openTab = output<CsoportTabTarget>();
  /** A csapat-funkció ki van kapcsolva (404) - a szülő a Technikum fülről is elrejti a csapatokat. */
  readonly csapatokUnavailable = output<void>();

  private readonly teacherQuizService = inject(TeacherQuizService);
  private readonly teacherTaskSetService = inject(TeacherTaskSetService);
  private readonly teacherProjectService = inject(TeacherProjectService);
  private readonly reportService = inject(ReportService);
  private readonly teamService = inject(TeacherTeamService);

  /** null = töltődik vagy hibás (a csempe „–”). */
  readonly activity7 = signal<StudentActivitySummaryDto[] | null>(null);
  readonly activity30 = signal<StudentActivitySummaryDto[] | null>(null);
  private readonly quizzes = signal<TeacherGroupAssignmentDto[] | null>(null);
  private readonly taskSets = signal<TeacherGroupTaskSetAssignmentDto[] | null>(null);
  private readonly projects = signal<ProjectAssignmentDto[] | null>(null);
  readonly weakTopics = signal<TeacherWeakTopicDto[] | null>(null);
  readonly teams = signal<Team[] | null>(null);
  readonly error = signal(false);

  private readonly now = Date.now();
  readonly pct = floorPercent;

  readonly activeThisWeek = computed(() => activeCount(this.activity7() ?? []));
  readonly average = computed(() => averageOfAverages(this.activity30() ?? []));

  /** Jelzéssel rendelkezők elöl (lemaradt, inaktív), azon belül a BE névsorrendje marad. */
  readonly students = computed(() => {
    const order = { lemaradt: 0, inaktív: 1 } as const;
    return (this.activity30() ?? [])
      .map((row) => ({ row, flag: studentFlag(row) }))
      .sort((a, b) => (a.flag ? order[a.flag] : 2) - (b.flag ? order[b.flag] : 2));
  });

  readonly runningCount = computed(() => {
    const quizzes = this.quizzes(), taskSets = this.taskSets(), projects = this.projects();
    if (!quizzes || !taskSets || !projects) return null;
    return [...quizzes, ...taskSets, ...projects].filter((a) => isRunning(a.dueAt, this.now)).length;
  });

  readonly pendingTests = computed(() => {
    const taskSets = this.taskSets();
    return taskSets ? awaitingPublication(taskSets, this.now) : null;
  });

  readonly activeTeamCount = computed(() => (this.teams() ?? []).filter((t) => t.status === 'active').length);
  readonly proposedTeamCount = computed(() => (this.teams() ?? []).filter((t) => t.status === 'proposed').length);

  readonly deadlines = computed(() => upcomingDeadlines([
    ...(this.quizzes() ?? []).flatMap((a) => a.dueAt ? [{
      key: `q${a.assignmentId}`, kind: 'Kvíz' as const, title: a.quizTitle, dueAt: parseUtc(a.dueAt),
      link: ['/feladatsorok', 'kvizek', a.quizId, 'eredmenyek'],
    }] : []),
    ...(this.taskSets() ?? []).flatMap((a) => a.dueAt ? [{
      key: `t${a.assignmentId}`, kind: a.isTest ? 'Dolgozat' as const : 'Feladatsor' as const, title: a.taskSetTitle,
      dueAt: parseUtc(a.dueAt), link: a.isTest ? ['/dolgozatok', a.assignmentId] : ['/feladatsorok', a.taskSetId, 'eredmenyek'],
    }] : []),
    ...(this.projects() ?? []).flatMap((p) => p.dueAt ? [{
      key: `p${p.id}`, kind: 'Projekt' as const, title: p.projectTitle, dueAt: parseUtc(p.dueAt),
      link: ['/feladatsorok/projektek/kiadas', p.id],
    }] : []),
  ], this.now));

  ngOnInit(): void {
    const groupId = this.groupId();
    const daysAgo = (days: number) => new Date(this.now - days * DAY_MS);

    this.load(this.reportService.getGroupActivity(groupId, daysAgo(7)), this.activity7);
    this.load(this.reportService.getGroupActivity(groupId, daysAgo(30)), this.activity30);
    this.load(this.teacherQuizService.getGroupAssignments(groupId), this.quizzes);
    this.load(this.teacherTaskSetService.getGroupTaskSetAssignments(groupId), this.taskSets);
    this.load(this.teacherProjectService.forGroup(groupId), this.projects);
    this.load(this.reportService.getGroupWeakTopics(groupId), this.weakTopics);
    this.teamService.forGroup(groupId).pipe(take(1)).subscribe({
      next: (teams) => this.teams.set(teams),
      // A kikapcsolt csapat-funkció 404-e nem hiba, csak nincs csapat-blokk.
      error: (e: { status?: number }) => e.status === 404 ? this.csapatokUnavailable.emit() : this.error.set(true),
    });
  }

  /** Független hívás: hiba esetén a cél-signal null marad (a blokk „–”), és megjelenik a közös figyelmeztetés. */
  private load<T>(source: Observable<T>, target: { set(value: T): void }): void {
    source.pipe(take(1)).subscribe({ next: (value) => target.set(value), error: () => this.error.set(true) });
  }
}
