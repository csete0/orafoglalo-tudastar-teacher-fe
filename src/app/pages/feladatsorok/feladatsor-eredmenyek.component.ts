import { ChangeDetectionStrategy, Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ReportStore } from '../../services/report/report.store';
import { TaskResultCellDto, TeacherAttemptReviewDto } from '../../models/report.model';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';

/** A backend `TeacherAttemptReviewService.MaxTeacherFeedbackLength` párja. */
const MAX_FEEDBACK_LENGTH = 2000;

/** Tagonkénti eredmény-mátrix (tagok × feladatok) a tanár saját feladatsorán. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-feladatsor-eredmenyek',
  standalone: true,
  imports: [RouterLink, FormsModule, LocalSpinnerComponent],
  template: `
    @if (report.taskSetResults(); as results) {
      <div class="max-w-5xl mx-auto px-4 py-10">
        <h1 class="page-title truncate">{{ results.title }} — eredmények</h1>
        <p class="text-sm text-text-muted mt-1">Tagonkénti eredmény-mátrix (diákok × feladatok)</p>
        <div class="hairline"></div>

        <div class="card overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="text-left text-text-muted text-xs uppercase tracking-wide border-b border-border-default">
                <th class="py-3 px-4">Diák</th>
                <th class="py-3 px-4">Összesen</th>
                @for (task of results.tasks; track task.taskId) {
                  <th class="py-3 px-4 whitespace-nowrap">{{ task.taskOrder }}. {{ task.title }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of results.students; track row.userId) {
                <tr class="border-b border-border-default last:border-b-0 hover:bg-bg-element transition-colors"
                  [class.opacity-50]="!row.hasSession">
                  <td class="py-2.5 px-4">
                    <a [routerLink]="['/diakok', row.userId]" class="text-primary hover:underline">{{ row.name }}</a>
                  </td>
                  <td class="py-2.5 px-4">
                    @if (row.hasSession) {
                      <span class="inline-flex items-center gap-1.5">
                        {{ row.totalEarnedPoints ?? '–' }} / {{ row.totalMaxPoints ?? '–' }}
                        @if (!row.isCompleted) {
                          <!-- UI-TT-49: a totalEarnedPoints/totalMaxPoints csak a MÁR
                               megkísérelt feladatokból összegződik, ezért egy még folyamatban
                               lévő diák részleges eredménye vizuálisan megkülönböztethetetlen
                               lenne egy ténylegesen kész, tökéletes eredménytől e nélkül a badge nélkül. -->
                          <span class="badge badge-warning !text-[10px] !px-1.5 !py-0.5" title="A diák még nem fejezte be a feladatsort.">
                            folyamatban
                          </span>
                        }
                      </span>
                    } @else {
                      nem kezdte el
                    }
                  </td>
                  @for (cell of row.taskResults; track cell.taskId) {
                    <td class="py-2.5 px-4">
                      @if (cell.attemptId != null) {
                        <!-- Valódi <button>, nem (click) a <td>-n: billentyűzettel is
                             elérhetőnek kell lennie. -->
                        <button type="button" (click)="toggleReview(cell)"
                          [attr.aria-expanded]="openAttemptId() === cell.attemptId"
                          class="inline-flex items-center gap-1.5 hover:underline"
                          [class.text-success]="cell.isCompleted"
                          [class.text-text-muted]="!cell.isCompleted"
                          [title]="'Értékelés megnyitása'">
                          {{ cell.earnedPoints ?? '–' }}/{{ cell.maxPoints ?? '–' }}
                          @if (cell.isOverridden) {
                            <span class="badge badge-info !text-[10px] !px-1.5 !py-0.5"
                              title="A pontszámot tanár bírálta felül.">tanári</span>
                          }
                        </button>
                      } @else {
                        <span class="text-text-muted">–</span>
                      }
                    </td>
                  }
                </tr>

                @if (openAttemptId() !== null && rowContainsOpenAttempt(row)) {
                  <tr>
                    <td [attr.colspan]="results.tasks.length + 2" class="px-4 pb-4">
                      @if (review(); as r) {
                        <div class="pl-4 border-l-2 border-primary">
                          <div class="flex items-start justify-between gap-4 flex-wrap mt-3">
                            <div>
                              <h2 class="font-semibold">{{ r.taskTitle }}</h2>
                              <p class="text-sm text-text-muted">{{ r.studentDisplayName }}</p>
                            </div>
                            <button type="button" (click)="closeReview()"
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
                            <h3 class="text-xs uppercase tracking-wide text-text-muted mb-1">Munkafolyamat</h3>
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

                          <!-- ── A diák megoldása ── -->
                          @if (r.studentCode) {
                            <div class="mt-4">
                              <h3 class="text-xs uppercase tracking-wide text-text-muted mb-1">A diák megoldása</h3>
                              <pre class="text-xs bg-bg-element rounded p-3 overflow-x-auto max-h-64">{{ r.studentCode }}</pre>
                            </div>
                          }

                          <!-- ── Tanári értékelés ── -->
                          <div class="mt-4">
                            <h3 class="text-xs uppercase tracking-wide text-text-muted mb-2">Saját értékelés</h3>
                            @if (canEditScore(r)) {
                              <div class="flex gap-3 items-end flex-wrap">
                                <div>
                                  <label class="text-xs text-text-muted block mb-1" [attr.for]="'pontszam-' + r.attemptId">
                                    Pontszám (0–{{ r.maxPoints }})
                                  </label>
                                  <input type="number" min="0" step="1" [max]="r.maxPoints"
                                    [id]="'pontszam-' + r.attemptId"
                                    [(ngModel)]="draftPoints" [ngModelOptions]="{ standalone: true }"
                                    class="input !px-2 !py-1.5 !w-28" />
                                </div>
                                <button type="button" (click)="save(r)" [disabled]="report.loading()"
                                  class="btn btn-primary !px-3 !py-1.5">Mentés</button>
                                @if (r.isOverridden) {
                                  <button type="button" (click)="revert(r)" [disabled]="report.loading()"
                                    class="btn btn-danger !px-3 !py-1.5">Visszaállítás az AI pontjára</button>
                                }
                              </div>
                              @if (pointsError(r); as err) {
                                <p class="text-sm text-danger mt-1">{{ err }}</p>
                              }
                            } @else {
                              <p class="text-sm text-text-muted">
                                Ehhez a beadáshoz még nincs kiértékelt eredmény, ezért a pontszám nem módosítható.
                              </p>
                            }

                            <div class="mt-3">
                              <label class="text-xs text-text-muted block mb-1" [attr.for]="'ertekeles-' + r.attemptId">
                                Szöveges értékelés a diáknak
                              </label>
                              <textarea rows="3" [id]="'ertekeles-' + r.attemptId"
                                [(ngModel)]="draftFeedback" [ngModelOptions]="{ standalone: true }"
                                [attr.maxlength]="maxFeedbackLength"
                                class="input !py-1.5 w-full"
                                placeholder="Amit a diáknak érdemes tudnia — akkor is hasznos, ha a pontszámmal egyetértesz."></textarea>
                              <div class="flex justify-between gap-2 mt-1">
                                @if (feedbackError(); as err) {
                                  <p class="text-sm text-danger">{{ err }}</p>
                                } @else {
                                  <span></span>
                                }
                                <span class="text-xs text-text-muted">{{ draftFeedback.length }}/{{ maxFeedbackLength }}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      } @else if (report.reviewLoading()) {
                        <app-local-spinner />
                      }
                    </td>
                  </tr>
                }
              } @empty {
                <tr><td [attr.colspan]="results.tasks.length + 2" class="py-6 px-4 text-text-muted text-center">Nincs elérhető diák.</td></tr>
              }
            </tbody>
          </table>
        </div>
        </div>
      </div>
    } @else if (report.loading()) {
      <app-local-spinner />
    } @else {
      <p class="text-danger text-center py-10">{{ report.error() }}</p>
    }
  `,
})
export class FeladatsorEredmenyekComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly confirmService = inject(ConfirmService);
  private readonly toastService = inject(ToastService);
  readonly report = inject(ReportStore);

  /** A backend ugyanezt a korlátot kényszeríti ki (TeacherAttemptReviewService). */
  readonly maxFeedbackLength = MAX_FEEDBACK_LENGTH;

  private taskSetId = 0;

  /** Melyik cella panelja van nyitva; null = egyik sem. */
  readonly openAttemptId = signal<number | null>(null);

  // Piszkozat: sima mezők, nem signal — az admin-tanarok kvóta-szerkesztés mintája.
  draftPoints: number | null = null;
  draftFeedback = '';

  constructor() {
    // A piszkozatot a betöltött nézetből töltjük fel. Effect-ben, NEM a sablonból
    // hívott metódusban: a renderelés közbeni mellékhatás
    // ExpressionChangedAfterItHasBeenChecked-hez vezetne. A latch (`syncedAttemptId`)
    // azért kell, hogy a gépelés közbeni újrafutás ne írja vissza a mentett értéket a
    // tanár épp szerkesztett szövegére — ugyanaz a minta, mint az
    // `intezmeny-reszletek.component.ts` név-szinkronizálásánál (UI-TT-62).
    effect(() => {
      const review = this.review();
      if (!review || this.syncedAttemptId === review.attemptId) return;
      this.syncedAttemptId = review.attemptId;
      this.draftPoints = review.earnedPoints;
      this.draftFeedback = review.teacherFeedback ?? '';
    });
  }

  private syncedAttemptId: number | null = null;

  ngOnInit(): void {
    this.taskSetId = Number(this.route.snapshot.paramMap.get('id'));
    this.report.loadTaskSetResults(this.taskSetId);
  }

  /** A panel-sor a megnyitott cellát TARTALMAZÓ diák sora alá kerül. */
  rowContainsOpenAttempt(row: { taskResults: TaskResultCellDto[] }): boolean {
    const open = this.openAttemptId();
    return open != null && row.taskResults.some((c) => c.attemptId === open);
  }

  toggleReview(cell: TaskResultCellDto): void {
    // Nincs beadás → nincs mit megnyitni. A sablon eleve nem rajzol gombot ilyen
    // cellára, ez a védelem a billentyűzet/programozott hívás ellen szól.
    if (cell.attemptId == null) return;

    if (this.openAttemptId() === cell.attemptId) {
      this.closeReview();
      return;
    }

    this.openAttemptId.set(cell.attemptId);
    // A piszkozatot a fenti effect tölti fel a betöltött nézetből; itt csak
    // nullázzuk, hogy az előző cella értékei ne villanjanak fel. A latch feloldása
    // KÖTELEZŐ: enélkül ugyanannak a cellának az újranyitásakor a latch még az előző
    // körből azonos lenne, az effect kihagyná a feltöltést, és a tanár üres űrlapot
    // kapna egy már meglévő értékelés helyett.
    this.syncedAttemptId = null;
    this.draftPoints = null;
    this.draftFeedback = '';
    this.report.loadAttemptReview(cell.attemptId);
  }

  closeReview(): void {
    this.openAttemptId.set(null);
    this.syncedAttemptId = null;
    this.report.clearAttemptReview();
  }

  /**
   * A panel megjelenítendő adata — de csak akkor, ha a MOST nyitott cellához
   * tartozik. Enélkül egy előző cella még beérkező válasza a már másik cellához
   * tartozó panelben jelenne meg.
   */
  readonly review = computed(() => {
    const review = this.report.attemptReview();
    if (!review || review.attemptId !== this.openAttemptId()) return null;
    return review;
  });

  /**
   * A pontszám csak akkor szerkeszthető, ha egyáltalán van kiértékelt eredmény.
   * A backend `MaxPoints`-a 0, ha a beadáshoz nem tartozik `ExamTaskResult` —
   * ilyenkor a mentés szerver-oldalon is elutasításra kerülne.
   */
  canEditScore(review: TeacherAttemptReviewDto): boolean {
    return review.maxPoints > 0;
  }

  /** Inline validáció — a hibát gépelés közben mutatjuk, nem csak mentéskor. */
  pointsError(review: TeacherAttemptReviewDto): string | null {
    const points = this.draftPoints;
    if (points == null) return null;
    if (!Number.isInteger(points)) return 'A pontszám csak egész szám lehet.';
    if (points < 0) return 'A pontszám nem lehet negatív.';
    if (points > review.maxPoints) {
      return `A pontszám nem lehet több a feladat maximumánál (${review.maxPoints} pont).`;
    }
    return null;
  }

  feedbackError(): string | null {
    return this.draftFeedback.length > MAX_FEEDBACK_LENGTH
      ? `A szöveges értékelés legfeljebb ${MAX_FEEDBACK_LENGTH} karakter lehet.`
      : null;
  }

  save(review: TeacherAttemptReviewDto): void {
    if (this.report.loading()) return;

    const pointsError = this.pointsError(review);
    const feedbackError = this.feedbackError();
    // Soha ne legyen néma no-op: ha a mentés nem indul el, a tanárnak tudnia kell,
    // miért (UI-TT-134).
    if (pointsError || feedbackError) {
      this.toastService.warning(pointsError ?? feedbackError!);
      return;
    }

    const feedback = this.draftFeedback.trim();
    if (this.draftPoints == null && !feedback) {
      this.toastService.warning(
        'Adj meg pontszámot vagy szöveges értékelést. A felülbírálás visszavonásához használd a visszaállítást.',
      );
      return;
    }

    this.report.overrideScore(
      this.taskSetId,
      review.attemptId,
      { earnedPoints: this.draftPoints, teacherFeedback: feedback || null },
      () => this.toastService.success('Értékelés mentve.'),
    );
  }

  async revert(review: TeacherAttemptReviewDto): Promise<void> {
    if (this.report.loading()) return;

    const confirmed = await this.confirmService.ask({
      title: 'Visszaállítás az AI pontjára',
      message:
        'Biztosan visszaállítod az AI eredeti pontszámát? A saját pontszámod és a szöveges értékelésed törlődik.',
      confirmLabel: 'Visszaállítás',
      danger: true,
    });
    if (!confirmed) return;

    this.report.revertOverride(this.taskSetId, review.attemptId, () => {
      this.draftPoints = null;
      this.draftFeedback = '';
      this.toastService.success('Visszaállítva az AI pontjára.');
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
}
