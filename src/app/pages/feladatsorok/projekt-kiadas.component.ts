import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, take } from 'rxjs';
import { TeacherProjectService } from '../../services/teacher-project/teacher-project.service';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';
import { parseUtc } from '../../shared/utc-date.util';
import { ProjectAssignmentStudentDto, ProjectAssignmentStudentsDto, RUNTIME_LABELS } from '../../models/teacher-project.model';
import { ProjectMatrixComponent } from './projekt-kiadas/project-matrix.component';
import { StudentCodePanelComponent } from './projekt-kiadas/student-code-panel.component';
import { StudentCodeState } from './projekt-kiadas/student-code.state';
import { CodeSuggestionsState } from './projekt-kiadas/code-suggestions.state';

/**
 * Egy projekt-kiadás osztály-nézete (PATRICKS-PROJEKTMUHELY-2-TERV.md, F+G fázis): diák × lépés mátrix az önállósággal
 * (önállóan / kis segítséggel / segítséggel / folyamatban / még nincs), lépésenkénti összesítő a legnagyobb
 * lemorzsolódással, és diákra kattintva a kódja csak olvasva. A kódban sorszámra kattintva megjegyzés írható (H fázis): a diák
 * válaszolhat és megoldottnak jelölheti; ha a sor azóta megváltozott, a megjegyzés „elavult”.
 * AI-javaslatok (Tanári segítségek 3): az MI sorokhoz kötött javaslatokat ad (Prémium, havi keret); ezek csak itt, a böngészőben
 * élnek, amíg a tanár el nem fogadja (= a meglévő megjegyzés-végponttal megjegyzés lesz belőlük) vagy el nem veti őket.
 *
 * Részek: `ProjectMatrixComponent` (mátrix), `StudentCodePanelComponent` (kód, szálak, javaslatok); az állapot a két,
 * itt adott szolgáltatásban (`StudentCodeState`, `CodeSuggestionsState`) él, hogy diákváltáskor és elhagyáskor ez a komponens
 * kérdezhessen rá az el nem fogadott javaslatokra.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-projekt-kiadas',
  standalone: true,
  imports: [DatePipe, RouterLink, LocalSpinnerComponent, ProjectMatrixComponent, StudentCodePanelComponent],
  providers: [StudentCodeState, CodeSuggestionsState],
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
  template: `
    <div class="page-wide">
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

        <app-project-matrix [view]="v" (studentSelected)="openCode($event)" />
        <app-student-code-panel />
      }
    </div>
  `,
})
export class ProjektKiadasComponent implements OnInit {
  private readonly api = inject(TeacherProjectService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly codeView = inject(StudentCodeState);
  private readonly suggest = inject(CodeSuggestionsState);

  /** Route-paraméter (withComponentInputBinding). */
  readonly id = input.required<string>();
  /** Query-paraméter: ennek a diáknak a kódja nyílik meg betöltéskor (a technikumi vizsgarész-térképről). */
  readonly diak = input<string>();

  readonly runtimeLabels = RUNTIME_LABELS;
  readonly utc = parseUtc;

  readonly view = signal<ProjectAssignmentStudentsDto | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.api.students(+this.id()).pipe(take(1), finalize(() => this.loading.set(false)), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (v) => {
        this.view.set(v);
        const s = v.students.find((x) => String(x.userId) === this.diak());
        if (s?.runtime) this.openCode(s);
      },
      error: (e) => this.error.set(extractErrorMessage(e, 'Az osztály-nézet betöltése sikertelen.')),
    });
  }

  openCode(s: ProjectAssignmentStudentDto): void {
    if (this.codeView.codeFor()?.userId === s.userId) return;
    if (!this.suggest.hasPendingSuggestions()) return this.loadStudent(s);
    void this.suggest.confirmDiscardSuggestions().then((ok) => ok && this.loadStudent(s));
  }

  private loadStudent(s: ProjectAssignmentStudentDto): void {
    this.suggest.resetSuggestions();
    this.suggest.loadSuggestQuota();
    this.codeView.open(+this.id(), s);
  }

  /** Route canDeactivate. */
  canLeave(): boolean | Promise<boolean> {
    return this.suggest.hasPendingSuggestions() ? this.suggest.confirmDiscardSuggestions() : true;
  }

  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.suggest.hasPendingSuggestions()) return;
    event.preventDefault();
    event.returnValue = '';
  }
}
