import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, untracked } from '@angular/core';
import { ReportStore } from '../../services/report/report.store';
import { SubmittedFileDto, TeacherAttemptReviewDto } from '../../models/report.model';
import { ReportService } from '../../services/report/report.service';
import { ToastService } from '../toast/toast.service';
import { LocalSpinnerComponent } from '../local-spinner/local-spinner.component';
import { saveBlob } from '../save-blob.util';
import { AttemptRubricComponent } from './attempt-rubric.component';
import { AttemptScoreFormComponent } from './attempt-score-form.component';

/**
 * Egy beadás tanári értékelő panelje: AI-értékelés, munkafolyamat-adatok, a diák kódja, pont-
 * felülírás és szöveges értékelés. A feladatsor-eredmények és a dolgozat-áttekintő közösen használja.
 * A mentés/visszaállítás a ReportStore-on át megy (az a feladatsor mátrixát is frissíti); a `changed`
 * esemény a más nézetet (pl. dolgozat-áttekintő) mutató szülőnek szól.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-attempt-review-panel',
  standalone: true,
  imports: [LocalSpinnerComponent, AttemptRubricComponent, AttemptScoreFormComponent],
  template: `
    @if (review(); as r) {
      <!-- UI-TT-174/UI-TT-176: a panel (pl. a diák-kód pre eleme) intrinsic
           tartalom-szélessége a TÁBLÁZAT auto-layout oszlopszélesség-
           számítását is kiszélesíti (mobilon 628px-re a 341px-es
           kliens-szélesség helyett), mert egy td colspan auto table-layout
           alatt a benne lévő legszélesebb elem preferred width-jét
           örökli - ez a Mentés / Visszaállítás az AI pontjára gombokat
           egy néma, a táblázat saját overflow-x-auto konténerében rejtve
           görgethető csapdába zárta (a két gomb sosem látszott egyszerre).
           A korábbi "w-0 min-w-full" minta (UI-TT-174 fixe) ÉLŐBEN HATÁSTALAN
           maradt (UI-TT-176): auto table-layout alatt egy leszármazott
           "min-width: 100%"-a a SAJÁT szülő (a cella) szélességére hivatkozna,
           de az a szélesség maga is ennek a tartalomnak a függvénye - ezt a
           körkörös függőséget a böngészők a gyakorlatban a százalékos
           min-width figyelmen kívül hagyásával oldják fel, vissza az intrinsic
           tartalom-szélességre esve. A "max-w-[90vw]" NEM százalékos, hanem a
           viewporthoz (nem a cellához) képest számol, ezért nincs körkörös
           függősége - ez valóban felső korlátot szab a wrapper preferred-width
           hozzájárulásának a table-layout-hoz, a hozzáadott overflow-x-auto
           pedig biztonsági hálóként lokálisan görgethetővé teszi a wrappert,
           ha a tartalma (pl. hosszú kódsor) mégis szélesebb lenne ennél. -->
      <div class="pl-4 border-l-2 border-primary max-w-[90vw] overflow-x-auto">
        <div class="flex items-start justify-between gap-4 flex-wrap mt-3">
          <div>
            <h2 class="font-semibold">{{ r.taskTitle }}</h2>
            <p class="text-sm text-text-muted">{{ r.studentDisplayName }}</p>
          </div>
          <button type="button" (click)="close()"
            class="text-sm text-primary hover:underline">Bezárás ▲</button>
        </div>

        <!-- ── Pontszám ── -->
        <div class="mt-4 flex gap-6 flex-wrap text-sm">
          <div>
            <span class="text-xs text-text-muted block">Érvényes pontszám</span>
            <!-- Sosem esünk 0-ra: a "nincs értékelve" és a "0 pontot ért
                 el" két különböző állapot (EXAM-11/EXAM-16). -->
            @if (r.earnedPoints != null) {
              <span class="font-semibold">{{ r.earnedPoints }} / {{ r.maxPoints }}</span>
            } @else {
              <span class="text-text-muted">— Nem értékelt</span>
            }
          </div>
          <div>
            <span class="text-xs text-text-muted block">AI pontszáma</span>
            @if (r.aiEarnedPoints != null) {
              <span>{{ r.aiEarnedPoints }} / {{ r.maxPoints }}</span>
            } @else {
              <span class="text-text-muted">— Nem értékelt</span>
            }
          </div>
          @if (r.isOverridden) {
            <div>
              <span class="text-xs text-text-muted block">Felülbírálta</span>
              <span>{{ r.reviewedByTeacherName ?? '—' }}</span>
            </div>
          }
        </div>

        <!-- ── AI értékelés ── -->
        @if (r.aiFeedback || r.aiStrengths || r.aiWeaknesses) {
          <div class="mt-4">
            <h3 class="text-xs uppercase tracking-wide text-text-muted mb-1">AI értékelés</h3>
            @if (r.aiFeedback) {
              <p class="text-sm whitespace-pre-line">{{ r.aiFeedback }}</p>
            }
            @if (r.aiStrengths) {
              <p class="text-sm mt-2"><span class="text-success">Erősségek:</span> {{ r.aiStrengths }}</p>
            }
            @if (r.aiWeaknesses) {
              <p class="text-sm mt-1"><span class="text-warning">Fejlesztendő:</span> {{ r.aiWeaknesses }}</p>
            }
          </div>
        } @else {
          <p class="mt-4 text-sm text-text-muted">Ehhez a beadáshoz nincs AI-értékelés.</p>
        }

        <!-- ── Munkafolyamat ──
             NYERS VISELKEDÉSI ADAT, NEM BIZONYÍTÉK. Tilos "gyanúsnak"
             címkézni vagy pontozni: a gyors beadás lehet felkészültség,
             a hosszú szünet gondolkodás vagy egy megzavaró tanterem.
             Az adatot mutatjuk, a következtetés a tanáré. -->
        <div class="mt-4">
          <!-- SEC-411: a munkafolyamat-adatok diák által jelentett értékek,
               nem szerver-oldali tények — ezt a felirat jelzi a tanárnak -->
          <h3 class="text-xs uppercase tracking-wide text-text-muted mb-1">
            Munkafolyamat <span class="normal-case font-normal">(diák által jelentett)</span>
          </h3>
          <div class="flex gap-5 flex-wrap text-sm">
            <span>Eltöltött idő: <strong>{{ formatDuration(r.timeSpentSeconds) }}</strong></span>
            <span>Megnyitások: <strong>{{ r.visitCount }}</strong></span>
            <span>Futtatások: <strong>{{ r.runCount }}</strong>
              ({{ r.successfulRunCount }} sikeres / {{ r.failedRunCount }} sikertelen)</span>
            <span>Segédlet megnyitva: <strong>{{ r.cheatsheetOpenCount }}×</strong></span>
            <span>Mintamegoldást megnézte:
              <strong>{{ r.solutionViewedAt != null ? 'igen' : 'nem' }}</strong></span>
          </div>
        </div>

        <!-- ── Irodai/weblap beadás: fájlok + az MI szempontjai (teljes vizsga, H5) ── -->
        @if (r.submissionFiles?.length) {
          <div class="mt-4" data-testid="attempt-files">
            <h3 class="text-xs uppercase tracking-wide text-text-muted mb-1">Beadott fájlok</h3>
            <div class="flex flex-wrap gap-2">
              @for (f of r.submissionFiles!; track f.id) {
                <button type="button" class="btn btn-ghost !px-2 !py-1 !text-xs" (click)="downloadFile(r, f)">
                  Letöltés: {{ f.name }} ({{ kb(f.sizeBytes) }} KB)
                </button>
              }
            </div>
          </div>
        }
        @if (r.rubricGrade; as g) {
          <app-attempt-rubric [grade]="g" />
        }

        <!-- ── A diák megoldása (irodai beadásnál a fenti fájlok helyettesítik) ── -->
        @if (r.studentCode && !r.submissionFiles?.length) {
          <div class="mt-4">
            <h3 class="text-xs uppercase tracking-wide text-text-muted mb-1">A diák megoldása</h3>
            <pre class="text-xs bg-bg-element rounded p-3 overflow-x-auto max-h-64">{{ r.studentCode }}</pre>
          </div>
        }

        <!-- ── Tanári értékelés ── -->
        <app-attempt-score-form [review]="r" [taskSetId]="taskSetId()" (changed)="changed.emit()" />
      </div>
    } @else if (report.reviewLoading()) {
      <app-local-spinner />
    }
  `,
})
export class AttemptReviewPanelComponent {
  readonly report = inject(ReportStore);
  private readonly toastService = inject(ToastService);
  private readonly reportService = inject(ReportService);

  readonly attemptId = input.required<number>();
  readonly taskSetId = input.required<number>();
  readonly closed = output<void>();
  readonly changed = output<void>();

  /**
   * A panel megjelenítendő adata — de csak akkor, ha a MOST nyitott cellához
   * tartozik. Enélkül egy előző cella még beérkező válasza a már másik cellához
   * tartozó panelben jelenne meg.
   */
  readonly review = computed(() => {
    const review = this.report.attemptReview();
    if (!review || review.attemptId !== this.attemptId()) return null;
    return review;
  });

  constructor() {
    // A megnyitott beadás betöltése (attemptId-váltáskor is). A store a betöltés indulásakor
    // törli az előző nézetet, így az értékelő űrlap az új beadás nézetéből, frissen indul.
    effect(() => {
      const attemptId = this.attemptId();
      untracked(() => this.report.loadAttemptReview(attemptId));
    });
  }

  kb(bytes: number): number {
    return Math.max(1, Math.round(bytes / 1024));
  }

  downloadFile(r: TeacherAttemptReviewDto, f: SubmittedFileDto): void {
    this.reportService.downloadAttemptFile(r.attemptId, f.id).subscribe({
      next: (blob) => saveBlob(blob, f.name),
      error: () => this.toastService.danger('A fájl nem tölthető le.'),
    });
  }

  formatDuration(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours} ó ${minutes} p`;
    if (minutes > 0) return `${minutes} p ${seconds} mp`;
    return `${seconds} mp`;
  }

  close(): void {
    this.report.clearAttemptReview();
    this.closed.emit();
  }
}
