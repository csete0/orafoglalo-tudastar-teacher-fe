import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, finalize, take } from 'rxjs';
import { TeacherProjectService } from '../../../services/teacher-project/teacher-project.service';
import { extractErrorMessage } from '../../../shared/http-error/extract-error-message.util';
import { codeFilePaths, codeLines } from '../../../shared/kod-olvaso/kod-olvaso.component';
import { CodeCommentThreadDto, ProjectAssignmentStudentDto, StudentProjectCodeDto } from '../../../models/teacher-project.model';

/**
 * A projekt-kiadás osztály-nézetében megnyitott diák kódja és a sorokhoz kötött megjegyzés-szálak (H fázis): betöltés,
 * új megjegyzés egy sorra, válasz. A `ProjektKiadasComponent` adja (`providers`), így az AI-javaslatok állapota
 * (`CodeSuggestionsState`) és a kód-panel ugyanazt a példányt látja.
 */
@Injectable()
export class StudentCodeState {
  private readonly api = inject(TeacherProjectService);
  private readonly destroyRef = inject(DestroyRef);
  private assignment = 0;

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
    return path ? codeLines(this.code()?.files[path]) : [];
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

  readonly markedLines = computed(() => new Set(this.threadsByLine().keys()));

  /** Fájlonként a nyitott megjegyzések száma. */
  readonly openCounts = computed(() => {
    const counts: Record<string, number> = {};
    for (const c of this.comments()) if (!c.resolvedAt) counts[c.path] = (counts[c.path] ?? 0) + 1;
    return counts;
  });

  /** A kiadás azonosítója (az utolsó `open` hívásból). */
  get assignmentId(): number {
    return this.assignment;
  }

  /** A diák kódjának és megjegyzéseinek betöltése; az előző diák állapota törlődik. */
  open(assignmentId: number, s: ProjectAssignmentStudentDto): void {
    this.assignment = assignmentId;
    this.codeFor.set(s);
    this.code.set(null);
    this.codeError.set(null);
    this.comments.set([]);
    this.newCommentLine.set(null);
    this.commentError.set(null);
    this.api.comments(assignmentId, s.userId).pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (c) => this.comments.set(c), error: () => this.comments.set([]) });
    this.codeLoading.set(true);
    this.api.studentCode(assignmentId, s.userId)
      .pipe(take(1), finalize(() => this.codeLoading.set(false)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (c) => {
          this.code.set(c);
          this.activePath.set(codeFilePaths(c.files, c.readOnlyPaths)[0] ?? null);
        },
        error: (e) => this.codeError.set(extractErrorMessage(e, 'A kód betöltése sikertelen.')),
      });
  }

  threadsAt(line: number): CodeCommentThreadDto[] {
    return this.threadsByLine().get(line) ?? [];
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
    this.saveComment(this.api.createComment(this.assignment, s.userId, path, line, box.value.trim()), () => this.newCommentLine.set(null));
  }

  reply(t: CodeCommentThreadDto, box: HTMLInputElement): void {
    const s = this.codeFor();
    if (!s || !box.value.trim()) return;
    this.saveComment(this.api.replyComment(this.assignment, s.userId, t.id, box.value.trim()), () => (box.value = ''));
  }

  /** Új vagy frissült szál a listában (az elfogadott AI-javaslat is így kerül be). */
  upsertComment(t: CodeCommentThreadDto): void {
    this.comments.update((list) => (list.some((c) => c.id === t.id) ? list.map((c) => (c.id === t.id ? t : c)) : [...list, t]));
  }

  private saveComment(call: Observable<CodeCommentThreadDto>, done: () => void): void {
    this.commentBusy.set(true);
    this.commentError.set(null);
    call.pipe(take(1), finalize(() => this.commentBusy.set(false))).subscribe({
      next: (t) => {
        this.upsertComment(t);
        done();
      },
      error: (e) => this.commentError.set(extractErrorMessage(e, 'A megjegyzés mentése sikertelen.')),
    });
  }
}
