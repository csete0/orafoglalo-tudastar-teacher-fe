import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Observable, finalize, take } from 'rxjs';
import { TeacherProjectService } from '../../services/teacher-project/teacher-project.service';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';
import { parseUtc } from '../../shared/utc-date.util';
import {
  CodeCommentThreadDto,
  INDEPENDENCE_LABELS,
  ProjectAssignmentStepDto,
  ProjectAssignmentStudentDto,
  ProjectAssignmentStudentsDto,
  RUNTIME_LABELS,
  StudentProjectCodeDto,
} from '../../models/teacher-project.model';

/** Egy cella állapota a mátrixban. */
type CellState = 'onallo' | 'kis-segitseggel' | 'segitseggel' | 'folyamatban' | 'nincs';

/**
 * Egy projekt-kiadás osztály-nézete (PATRICKS-PROJEKTMUHELY-2-TERV.md, F+G fázis): diák × lépés mátrix az önállósággal
 * (önállóan / kis segítséggel / segítséggel / folyamatban / még nincs), lépésenkénti összesítő a legnagyobb
 * lemorzsolódással, és diákra kattintva a kódja csak olvasva. A kódban sorszámra kattintva megjegyzés írható (H fázis): a diák
 * válaszolhat és megoldottnak jelölheti; ha a sor azóta megváltozott, a megjegyzés „elavult”.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-projekt-kiadas',
  standalone: true,
  imports: [DatePipe, RouterLink, LocalSpinnerComponent],
  template: `
    <div class="max-w-6xl mx-auto px-4 py-10">
      <a routerLink="/feladatsorok/projektek" class="text-sm text-text-muted">← Projektek</a>
      @if (error(); as err) { <p class="text-danger text-sm mt-4">{{ err }}</p> }
      @if (loading()) {
        <app-local-spinner />
      } @else if (view(); as v) {
        <h1 class="page-title mt-2">{{ v.assignment.projectTitle }} – {{ v.assignment.groupName }}</h1>
        <p class="text-sm text-text-muted mt-1">
          {{ v.assignment.startedCount }}/{{ v.assignment.memberCount }} elkezdte · {{ v.assignment.completedCount }} kész
          @if (v.assignment.runtime) { · csak {{ runtimeLabels[v.assignment.runtime] }} }
          @if (v.assignment.dueAt) { · határidő: {{ utc(v.assignment.dueAt) | date: 'yyyy.MM.dd. HH:mm' }} }
        </p>

        <div class="flex flex-wrap gap-3 text-xs mt-4" aria-label="Jelmagyarázat">
          @for (l of legend; track l.state) {
            <span class="inline-flex items-center gap-1.5"><span class="cell-dot" [class]="'cell-dot cell--' + l.state"></span>{{ l.label }}</span>
          }
        </div>

        <div class="card overflow-x-auto mt-4">
          <table class="w-full text-sm" data-testid="project-matrix">
            <thead>
              <tr class="text-left border-b border-border-default">
                <th class="py-2 px-3">Diák</th>
                @for (m of v.milestones; track m.orderNo) {
                  <th class="py-2 px-2 text-center" [class.drop-col]="m.orderNo === worstDrop()" [attr.title]="m.title">{{ m.orderNo }}.</th>
                }
                <th class="py-2 px-3 text-right">Ellenőrzés</th>
                <th class="py-2 px-3 text-right">AI-token (30 nap)</th>
                <th class="py-2 px-3">Utoljára</th>
              </tr>
            </thead>
            <tbody>
              @for (s of v.students; track s.userId) {
                <tr class="border-b border-border-default last:border-b-0" [attr.data-testid]="'student-' + s.userId">
                  <td class="py-2 px-3">
                    @if (s.runtime) {
                      <button type="button" class="font-semibold text-left underline-offset-2 hover:underline" (click)="openCode(s)">{{ s.name }}</button>
                    } @else {
                      <span class="font-semibold">{{ s.name }}</span>
                    }
                    <span class="block text-xs text-text-muted">
                      {{ s.runtime ? runtimeLabels[s.runtime] : 'még nem kezdte' }}{{ s.completedAt ? ' · kész' : '' }}
                      @if (!s.hasFullAccess) { · <span class="text-warning">ingyenes lépésekig</span> }
                    </span>
                  </td>
                  @for (step of s.steps; track step.orderNo) {
                    <td class="py-2 px-2 text-center" [class.drop-col]="step.orderNo === worstDrop()">
                      <span class="cell-dot" [class]="'cell-dot cell--' + cell(s, step)" [attr.title]="cellTitle(s, step)"
                            [attr.aria-label]="step.orderNo + '. lépés: ' + cellLabel(s, step)"></span>
                    </td>
                  }
                  <td class="py-2 px-3 text-right tabular-nums">{{ checks(s) }}</td>
                  <td class="py-2 px-3 text-right tabular-nums">{{ s.aiTokens30 }}</td>
                  <td class="py-2 px-3 text-xs text-text-muted">{{ s.lastActivityAt ? (utc(s.lastActivityAt) | date: 'MM.dd. HH:mm') : '–' }}</td>
                </tr>
              } @empty {
                <tr><td class="py-3 px-3 text-text-muted" [attr.colspan]="v.milestones.length + 4">A csoportnak még nincs tagja.</td></tr>
              }
            </tbody>
            <tfoot>
              <tr class="border-t border-border-default text-xs text-text-muted">
                <td class="py-2 px-3 font-semibold">Teljesítette</td>
                @for (c of passedCounts(); track c.orderNo) {
                  <td class="py-2 px-2 text-center tabular-nums" [class.drop-col]="c.orderNo === worstDrop()">{{ c.passed }}/{{ v.students.length }}</td>
                }
                <td colspan="3"></td>
              </tr>
            </tfoot>
          </table>
        </div>
        @if (worstDrop(); as order) {
          <p class="text-sm mt-3" data-testid="worst-drop">A legtöbben a(z) <strong>{{ order }}. lépésnél</strong> akadnak el ({{ milestoneTitle(order) }}).</p>
        }

        @if (codeFor(); as s) {
          <section class="card p-4 mt-6" aria-labelledby="code-title" data-testid="student-code">
            <div class="flex items-center justify-between gap-3">
              <h2 id="code-title" class="font-bold">{{ s.name }} kódja
                <span class="text-xs font-normal text-text-muted">(csak olvasás – sorszámra kattintva megjegyzést írhatsz)</span></h2>
              <button type="button" class="btn btn-ghost !px-2 !py-1 !text-xs" (click)="codeFor.set(null)">Bezárás</button>
            </div>
            @if (codeLoading()) {
              <app-local-spinner />
            } @else if (code(); as c) {
              <div class="grid gap-3 mt-3 md:grid-cols-[14rem_minmax(0,1fr)]">
                <ul class="space-y-0.5 text-xs font-mono">
                  @for (path of codePaths(); track path) {
                    <li><button type="button" class="w-full text-left px-2 py-1 rounded" [class.bg-bg-element]="activePath() === path" (click)="selectFile(path)">
                      {{ path }}{{ c.readOnlyPaths.includes(path) ? ' (keret)' : '' }}
                      @if (openCountFor(path); as n) { <span class="comment-count" [attr.aria-label]="n + ' nyitott megjegyzés'">{{ n }}</span> }
                    </button></li>
                  }
                </ul>
                <div class="code-view" tabindex="0" data-testid="code-view">
                  @for (text of lines(); track $index; let i = $index) {
                    <div class="code-line" [class.code-line--commented]="threadsAt(i + 1).length">
                      <button type="button" class="code-ln" [attr.aria-label]="'Megjegyzés a(z) ' + (i + 1) + '. sorhoz'"
                              (click)="startComment(i + 1)">{{ i + 1 }}</button>
                      <span class="code-text">{{ text }}</span>
                    </div>
                    @for (t of threadsAt(i + 1); track t.id) {
                      <div class="thread" [class.thread--resolved]="t.resolvedAt" [attr.data-testid]="'thread-' + t.id">
                        <p class="text-xs text-text-muted">
                          <strong class="text-text-default">{{ t.authorName }}</strong> · {{ utc(t.createdAt) | date: 'MM.dd. HH:mm' }}
                          @if (t.resolvedAt) { · <span class="text-success">megoldva</span> }
                          @if (t.lineText !== text) { · <span class="text-warning" data-testid="thread-outdated">elavult – a sor azóta megváltozott</span> }
                        </p>
                        <p class="thread-body">{{ t.body }}</p>
                        @for (r of t.replies; track r.id) {
                          <p class="thread-reply"><strong>{{ r.authorName }}</strong>{{ r.authorIsTeacher ? '' : ' (diák)' }}: {{ r.body }}</p>
                        }
                        <form class="flex gap-2 mt-2" (submit)="$event.preventDefault(); reply(t, replyBox)">
                          <input #replyBox class="form-input !py-1 !text-xs flex-1" maxlength="2000" placeholder="Válasz…" aria-label="Válasz a megjegyzésre" />
                          <button type="submit" class="btn btn-ghost !px-2 !py-1 !text-xs" [disabled]="commentBusy()">Válasz</button>
                        </form>
                      </div>
                    }
                    @if (newCommentLine() === i + 1) {
                      <form class="thread" data-testid="new-comment" (submit)="$event.preventDefault(); createComment(newBox)">
                        <label class="text-xs font-semibold" for="new-comment-box">Megjegyzés a(z) {{ i + 1 }}. sorhoz</label>
                        <textarea #newBox id="new-comment-box" class="form-input !text-sm w-full mt-1" rows="3" maxlength="2000"
                                  placeholder="Pl.: Itt mi történik, ha üres a rendelés?"></textarea>
                        <div class="flex gap-2 mt-2">
                          <button type="submit" class="btn btn-primary !px-3 !py-1 !text-xs" [disabled]="commentBusy()">Megjegyzés küldése</button>
                          <button type="button" class="btn btn-ghost !px-3 !py-1 !text-xs" (click)="newCommentLine.set(null)">Mégse</button>
                        </div>
                      </form>
                    }
                  }
                </div>
              </div>
              @if (commentError(); as err) { <p class="text-danger text-sm mt-2" role="alert">{{ err }}</p> }
            } @else if (codeError(); as err) {
              <p class="text-danger text-sm mt-2">{{ err }}</p>
            }
          </section>
        }
      }
    </div>
  `,
  styles: [`
    .cell-dot { display: inline-block; width: 1rem; height: 1rem; border-radius: 999px; border: 2px solid transparent; vertical-align: middle; }
    .cell--onallo { background: var(--color-success, #1a7f37); }
    .cell--kis-segitseggel { background: var(--color-primary, #0969da); }
    .cell--segitseggel { background: var(--color-warning, #9a6700); }
    .cell--folyamatban { border-color: var(--color-text-muted, #6b7280); }
    .cell--nincs { background: var(--color-bg-element, #eaeef2); }
    .drop-col { background: var(--color-warning-subtle, rgba(154, 103, 0, 0.1)); }
    .code-view { max-height: 60vh; overflow: auto; padding: 0.5rem 0; border-radius: 0.5rem; background: var(--color-bg-element);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.75rem; line-height: 1.5; }
    .code-line { display: flex; }
    .code-line--commented { background: var(--color-warning-subtle, rgba(154, 103, 0, 0.1)); }
    .code-ln { flex: none; width: 3rem; padding-right: 0.75rem; text-align: right; color: var(--color-text-muted); user-select: none; }
    .code-ln:hover, .code-ln:focus-visible { color: var(--color-primary); text-decoration: underline; }
    .code-text { white-space: pre; padding-right: 0.75rem; }
    .thread { margin: 0.25rem 0.75rem 0.5rem 3rem; padding: 0.5rem 0.75rem; border-radius: 0.5rem; background: var(--color-bg-surface, #fff);
      border: 1px solid var(--color-border-default); font-family: var(--font-sans, system-ui, sans-serif); white-space: normal; }
    .thread--resolved { opacity: 0.7; }
    .thread-body { margin-top: 0.25rem; font-size: 0.8125rem; white-space: pre-wrap; }
    .thread-reply { margin-top: 0.25rem; padding-left: 0.75rem; border-left: 2px solid var(--color-border-default); font-size: 0.75rem; white-space: pre-wrap; }
    .comment-count { margin-left: 0.25rem; padding: 0 0.375rem; border-radius: 999px; background: var(--color-warning); color: #fff; font-size: 0.625rem; }
  `],
})
export class ProjektKiadasComponent implements OnInit {
  private readonly api = inject(TeacherProjectService);

  /** Route-paraméter (withComponentInputBinding). */
  readonly id = input.required<string>();

  readonly runtimeLabels = RUNTIME_LABELS;
  readonly utc = parseUtc;
  readonly legend: { state: CellState; label: string }[] = [
    { state: 'onallo', label: INDEPENDENCE_LABELS.onallo },
    { state: 'kis-segitseggel', label: INDEPENDENCE_LABELS['kis-segitseggel'] },
    { state: 'segitseggel', label: INDEPENDENCE_LABELS.segitseggel },
    { state: 'folyamatban', label: 'folyamatban' },
    { state: 'nincs', label: 'még nem jutott el' },
  ];

  readonly view = signal<ProjectAssignmentStudentsDto | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly codeFor = signal<ProjectAssignmentStudentDto | null>(null);
  readonly code = signal<StudentProjectCodeDto | null>(null);
  readonly codeLoading = signal(false);
  readonly codeError = signal<string | null>(null);
  readonly activePath = signal<string | null>(null);
  readonly comments = signal<CodeCommentThreadDto[]>([]);
  readonly newCommentLine = signal<number | null>(null);
  readonly commentBusy = signal(false);
  readonly commentError = signal<string | null>(null);

  readonly lines = computed(() => {
    const path = this.activePath();
    return path ? (this.code()?.files[path] ?? '').split('\n').map((l) => l.replace(/\r$/, '')) : [];
  });

  /** Az aktív fájl szálai soronként; a fájl végén túli (azóta törölt) sorok az utolsó soron jelennek meg. */
  private readonly threadsByLine = computed(() => {
    const map = new Map<number, CodeCommentThreadDto[]>();
    const last = this.lines().length;
    for (const t of this.comments().filter((c) => c.path === this.activePath())) {
      const line = Math.min(t.line, last);
      map.set(line, [...(map.get(line) ?? []), t]);
    }
    return map;
  });

  readonly passedCounts = computed(() => {
    const v = this.view();
    return (v?.milestones ?? []).map((m) => ({
      orderNo: m.orderNo,
      passed: v!.students.filter((s) => s.steps.find((x) => x.orderNo === m.orderNo)?.passed).length,
    }));
  });

  /** Ahol a legtöbben akadtak el: a legnagyobb esés az előző lépés teljesítőihez képest (az elsőnél az elkezdőkhöz). */
  readonly worstDrop = computed(() => {
    const v = this.view();
    if (!v || v.assignment.startedCount === 0) return null;
    let previous = v.students.filter((s) => s.runtime).length;
    let worst: { orderNo: number; drop: number } | null = null;
    for (const c of this.passedCounts()) {
      const drop = previous - c.passed;
      if (drop > 0 && (!worst || drop > worst.drop)) worst = { orderNo: c.orderNo, drop };
      previous = c.passed;
    }
    return worst?.orderNo ?? null;
  });

  readonly codePaths = computed(() => {
    const c = this.code();
    if (!c) return [];
    const ro = new Set(c.readOnlyPaths);
    return Object.keys(c.files).sort((a, b) => Number(ro.has(a)) - Number(ro.has(b)) || a.localeCompare(b));
  });

  ngOnInit(): void {
    this.api.students(+this.id()).pipe(take(1), finalize(() => this.loading.set(false))).subscribe({
      next: (v) => this.view.set(v),
      error: (e) => this.error.set(extractErrorMessage(e, 'Az osztály-nézet betöltése sikertelen.')),
    });
  }

  cell(s: ProjectAssignmentStudentDto, step: ProjectAssignmentStepDto): CellState {
    if (step.passed) return step.independence ?? 'onallo';
    return s.runtime && s.currentMilestoneOrder === step.orderNo && !s.completedAt ? 'folyamatban' : 'nincs';
  }

  cellLabel(s: ProjectAssignmentStudentDto, step: ProjectAssignmentStepDto): string {
    return this.legend.find((l) => l.state === this.cell(s, step))!.label;
  }

  cellTitle(s: ProjectAssignmentStudentDto, step: ProjectAssignmentStepDto): string {
    const parts = [this.cellLabel(s, step)];
    if (step.checks) parts.push(`${step.checks} Ellenőrzés`);
    if (step.hint1 + step.hint2 + step.hint3) parts.push(`tipp ${step.hint1} · hely ${step.hint2} · kód ${step.hint3}`);
    return parts.join(' – ');
  }

  checks(s: ProjectAssignmentStudentDto): number {
    return s.steps.reduce((sum, x) => sum + x.checks, 0);
  }

  milestoneTitle(orderNo: number): string {
    return this.view()?.milestones.find((m) => m.orderNo === orderNo)?.title ?? '';
  }

  threadsAt(line: number): CodeCommentThreadDto[] {
    return this.threadsByLine().get(line) ?? [];
  }

  openCountFor(path: string): number {
    return this.comments().filter((c) => c.path === path && !c.resolvedAt).length;
  }

  selectFile(path: string): void {
    this.activePath.set(path);
    this.newCommentLine.set(null);
  }

  startComment(line: number): void {
    this.commentError.set(null);
    this.newCommentLine.set(line);
  }

  createComment(box: HTMLTextAreaElement): void {
    const s = this.codeFor();
    const path = this.activePath();
    const line = this.newCommentLine();
    if (!s || !path || !line || !box.value.trim()) return;
    this.saveComment(this.api.createComment(+this.id(), s.userId, path, line, box.value.trim()), () => this.newCommentLine.set(null));
  }

  reply(t: CodeCommentThreadDto, box: HTMLInputElement): void {
    const s = this.codeFor();
    if (!s || !box.value.trim()) return;
    this.saveComment(this.api.replyComment(+this.id(), s.userId, t.id, box.value.trim()), () => (box.value = ''));
  }

  private saveComment(call: Observable<CodeCommentThreadDto>, done: () => void): void {
    this.commentBusy.set(true);
    this.commentError.set(null);
    call.pipe(take(1), finalize(() => this.commentBusy.set(false))).subscribe({
      next: (t) => {
        this.comments.update((list) => (list.some((c) => c.id === t.id) ? list.map((c) => (c.id === t.id ? t : c)) : [...list, t]));
        done();
      },
      error: (e) => this.commentError.set(extractErrorMessage(e, 'A megjegyzés mentése sikertelen.')),
    });
  }

  openCode(s: ProjectAssignmentStudentDto): void {
    this.codeFor.set(s);
    this.code.set(null);
    this.codeError.set(null);
    this.comments.set([]);
    this.newCommentLine.set(null);
    this.commentError.set(null);
    this.api.comments(+this.id(), s.userId).pipe(take(1)).subscribe({ next: (c) => this.comments.set(c), error: () => this.comments.set([]) });
    this.codeLoading.set(true);
    this.api.studentCode(+this.id(), s.userId).pipe(take(1), finalize(() => this.codeLoading.set(false))).subscribe({
      next: (c) => {
        this.code.set(c);
        this.activePath.set(this.codePaths()[0] ?? null);
      },
      error: (e) => this.codeError.set(extractErrorMessage(e, 'A kód betöltése sikertelen.')),
    });
  }
}
