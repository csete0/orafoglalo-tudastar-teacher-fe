import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ReportStore } from '../../services/report/report.store';
import { RubricGradeItemDto, SubmittedFileDto, TeacherAttemptReviewDto } from '../../models/report.model';
import { ReportService } from '../../services/report/report.service';
import { ConfirmService } from '../confirm/confirm.service';
import { ToastService } from '../toast/toast.service';
import { LocalSpinnerComponent } from '../local-spinner/local-spinner.component';
import { gradeReason, GradeReasonView } from '../grade-reason.util';

/** A backend `TeacherAttemptReviewService.MaxTeacherFeedbackLength` párja. */
const MAX_FEEDBACK_LENGTH = 2000;

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
  imports: [FormsModule, LocalSpinnerComponent],
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
          <details class="mt-4 text-sm" data-testid="attempt-rubric">
            <summary class="cursor-pointer">
              <span class="text-xs uppercase tracking-wide text-text-muted">Szempontonként</span>
              <strong class="ml-2">{{ g.rawPoints }}/{{ g.rawTotal }} nyers pont</strong>
              @if (g.draftRubric) { <span class="text-xs text-warning ml-1">vázlat-útmutató</span> }
              <span class="text-xs text-text-muted ml-1">– {{ lost(g.items).length }} szempontnál veszett pont</span>
            </summary>
            <ul class="mt-2 space-y-1">
              @for (item of g.items; track item.itemId) {
                <li [class.text-text-muted]="!isLost(item)">
                  <span class="font-semibold tabular-nums">{{ item.kind === 'statement' ? (item.ok ? '✓' : '✗') : item.points + '/' + item.maxPoints }}</span>
                  {{ item.text }}
                  @if (isLost(item) && reason(item); as why) {
                    <span class="text-text-muted" data-testid="attempt-rubric-reason">– {{ why.text }}</span>
                    @if (why.detail) { <span class="block text-xs text-text-muted" data-testid="attempt-rubric-reason-detail">{{ why.detail }}</span> }
                  }
                </li>
              }
            </ul>
          </details>
        }

        <!-- ── A diák megoldása (irodai beadásnál a fenti fájlok helyettesítik) ── -->
        @if (r.studentCode && !r.submissionFiles?.length) {
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
              <button type="button" (click)="save(r)" [disabled]="report.taskSetResultsLoading()"
                class="btn btn-primary !px-3 !py-1.5">Mentés</button>
              @if (r.isOverridden) {
                <!-- BE-TEACHERATTEMPTREVIEW-REVERT-NOAISCORE-MISLEADING-CONFIRM:
                     a gomb felirata korábban feltétel nélkül "Visszaállítás az AI
                     pontjára" volt, akkor is, ha az AI SOSEM értékelte a beadást
                     (napi token-limit/hiba - aiEarnedPoints null, dokumentáltan
                     legitim állapot). Ilyenkor a revert() ténylegesen nem "vissza"
                     állít semmit, hanem véglegesen törli a tanár kézzel beírt
                     pontszámát/értékelését - a gomb feliratának ezt tükröznie kell,
                     ne állítson létező AI-alapértéket. -->
                <button type="button" (click)="revert(r)" [disabled]="report.taskSetResultsLoading()"
                  class="btn btn-danger !px-3 !py-1.5">{{ hasAiScore(r) ? 'Visszaállítás az AI pontjára' : 'Felülbírálás törlése' }}</button>
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
            <!-- UI-TT-190: canEditScore(r)===false esetén a "Mentés" gomb (és maga
                 a save() hívási útja) nincs renderelve - enélkül a [disabled] nélkül
                 a tanár írhatott ide szöveget, ami a panel bezárásakor
                 (draftFeedback visszaáll review.teacherFeedback-re) nyomtalanul,
                 figyelmeztetés nélkül elveszett - "néma no-op", pontosan az a
                 hibaosztály, amit a save() lent explicit el akar kerülni. A mező
                 szándékosan NEM [(ngModel)]-t, hanem egyirányú [value] + (input)
                 kezelést használ - az NgModel saját disabled-állapot-
                 szinkronizációja (a mögöttes FormControl sosem lett ténylegesen
                 disable()-özve) minden CD-ciklusban visszaírta volna false-ra a
                 [disabled]/[attr.disabled] binding által beállított értéket. -->
            <textarea rows="3" [id]="'ertekeles-' + r.attemptId"
              [value]="draftFeedback"
              (input)="draftFeedback = $any($event.target).value; feedbackTouched = true"
              [attr.maxlength]="maxFeedbackLength"
              [disabled]="!canEditScore(r)"
              class="input !py-1.5 w-full disabled:opacity-60 disabled:cursor-not-allowed"
              placeholder="Amit a diáknak érdemes tudnia — akkor is hasznos, ha a pontszámmal egyetértesz."></textarea>
            @if (!canEditScore(r)) {
              <p class="text-sm text-text-muted mt-1">
                Ehhez a beadáshoz még nincs kiértékelt eredmény, ezért a szöveges értékelés sem menthető el.
              </p>
            } @else {
              <div class="flex justify-between gap-2 mt-1">
                @if (feedbackError(); as err) {
                  <p class="text-sm text-danger">{{ err }}</p>
                } @else {
                  <span></span>
                }
                <span class="text-xs text-text-muted">{{ draftFeedback.length }}/{{ maxFeedbackLength }}</span>
              </div>
            }
          </div>
        </div>
      </div>
    } @else if (report.reviewLoading()) {
      <app-local-spinner />
    }
  `,
})
export class AttemptReviewPanelComponent {
  readonly report = inject(ReportStore);
  private readonly confirmService = inject(ConfirmService);
  private readonly toastService = inject(ToastService);
  private readonly reportService = inject(ReportService);

  readonly attemptId = input.required<number>();
  readonly taskSetId = input.required<number>();
  readonly closed = output<void>();
  readonly changed = output<void>();

  /** A backend ugyanezt a korlátot kényszeríti ki (TeacherAttemptReviewService). */
  readonly maxFeedbackLength = MAX_FEEDBACK_LENGTH;


  // Piszkozat: sima mezők, nem signal — az admin-tanarok kvóta-szerkesztés mintája.
  draftPoints: number | null = null;
  draftFeedback = '';

  /**
   * BE-TEACHERATTEMPTREVIEW-OVERRIDE-FEEDBACK-LOST-UPDATE: nyomon követi, hogy a tanár
   * TÉNYLEGESEN hozzáért-e az értékelés-mezőhöz, mióta a panel a jelenlegi beadáshoz
   * betöltődött — a mentéskor ez dönti el, hogy a `teacherFeedback` egyáltalán
   * elküldésre kerüljön-e. Enélkül egy csak-pontszámot-módosító mentés (a mező
   * érintetlenül hagyva) ugyanazt a `null`-t küldené, mint egy szándékos törlés — a
   * backend nem tudná megkülönböztetni a kettőt, és lenullázná egy MÁSIK, konkurens
   * tanár épp beírt értékelését.
   */
  feedbackTouched = false;

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
      this.feedbackTouched = false;
    });
  }

  private syncedAttemptId: number | null = null;


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

  /**
   * A pontszám csak akkor szerkeszthető, ha egyáltalán van kiértékelt eredmény.
   * A backend `MaxPoints`-a 0, ha a beadáshoz nem tartozik `ExamTaskResult` —
   * ilyenkor a mentés szerver-oldalon is elutasításra kerülne.
   */
  canEditScore(review: TeacherAttemptReviewDto): boolean {
    return review.maxPoints > 0;
  }

  /**
   * BE-TEACHERATTEMPTREVIEW-REVERT-NOAISCORE-MISLEADING-CONFIRM: van-e ténylegesen
   * olyan AI-eredmény, amire a revert() visszaállítana. Szándékosan KIZÁRÓLAG
   * `aiEarnedPoints`-ot nézi, nem `aiScoredAt`-ot is - a backend `RevertOverrideAsync`
   * ténylegesen `EarnedPoints = AiEarnedPoints`-et hajt végre, tehát EZ a mező dönti el
   * a valós hatást. `aiEarnedPoints` null, ha az AI a napi token-limit vagy egy hiba
   * miatt sosem értékelte a beadást (dokumentáltan legitim, gyakori állapot, ld.
   * `ExamTaskResult.AiEarnedPoints` doc-kommentje) - ilyenkor a `revert()` NEM
   * "visszaállít" semmit, hanem véglegesen törli a tanár kézzel beírt
   * pontszámát/értékelését, `aiScoredAt`-tól függetlenül.
   */
  hasAiScore(review: TeacherAttemptReviewDto): boolean {
    return review.aiEarnedPoints != null;
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
    if (this.report.taskSetResultsLoading()) return;

    const pointsError = this.pointsError(review);
    const feedbackError = this.feedbackError();
    // Soha ne legyen néma no-op: ha a mentés nem indul el, a tanárnak tudnia kell,
    // miért (UI-TT-134).
    if (pointsError || feedbackError) {
      this.toastService.warning(pointsError ?? feedbackError!);
      return;
    }

    const feedback = this.draftFeedback.trim();
    if (this.draftPoints == null && !this.feedbackTouched) {
      this.toastService.warning(
        'Adj meg pontszámot vagy szöveges értékelést. A felülbírálás visszavonásához használd a visszaállítást.',
      );
      return;
    }

    this.report.overrideScore(
      this.taskSetId(),
      review.attemptId,
      { earnedPoints: this.draftPoints, teacherFeedback: feedback || null, feedbackProvided: this.feedbackTouched },
      () => {
        this.toastService.success('Értékelés mentve.');
        this.changed.emit();
      },
    );
  }

  async revert(review: TeacherAttemptReviewDto): Promise<void> {
    if (this.report.taskSetResultsLoading()) return;

    // BE-TEACHERATTEMPTREVIEW-REVERT-NOAISCORE-MISLEADING-CONFIRM: ha nincs valódi
    // AI-pontszám (az AI sosem értékelte ezt a beadást), a megerősítő ablak és a
    // sikertoast korábban feltétel nélkül azt állította, hogy egy AI-értékelésre áll
    // vissza - valójában a tanár saját munkája véglegesen, visszavonhatatlanul
    // törlődik, nincs mire "visszaállni". A szöveg ezt az esetet explicit
    // megkülönbözteti, hogy a tanár tudatosan döntsön.
    const aiScoreExists = this.hasAiScore(review);
    const confirmed = await this.confirmService.ask({
      title: aiScoreExists ? 'Visszaállítás az AI pontjára' : 'Felülbírálás törlése',
      message: aiScoreExists
        ? 'Biztosan visszaállítod az AI eredeti pontszámát? A saját pontszámod és a szöveges értékelésed törlődik.'
        : 'FIGYELEM: az AI még nem értékelte ezt a beadást, nincs mire visszaállni. A saját pontszámod és a szöveges értékelésed véglegesen törlődik.',
      confirmLabel: aiScoreExists ? 'Visszaállítás' : 'Törlés',
      danger: true,
    });
    if (!confirmed) return;

    this.report.revertOverride(this.taskSetId(), review.attemptId, () => {
      this.draftPoints = null;
      this.draftFeedback = '';
      this.feedbackTouched = false;
      this.toastService.success(
        aiScoreExists ? 'Visszaállítva az AI pontjára.' : 'Felülbírálás törölve.',
      );
      this.changed.emit();
    });
  }


  /** Pontot vesztett szempont: állításnál hamis, egyébként a maximumnál kevesebb pont. */
  isLost(item: RubricGradeItemDto): boolean {
    return item.kind === 'statement' ? item.ok === false : item.points < item.maxPoints;
  }

  /** Az indok közérthetően (a gépi tétel nyers szabály-útvonala nélkül). */
  reason(item: RubricGradeItemDto): GradeReasonView | null {
    const state = item.kind === 'statement' ? (item.ok ? 'full' : 'none') : item.points >= item.maxPoints ? 'full' : item.points > 0 ? 'partial' : 'none';
    return gradeReason(item.reason, state);
  }

  lost(items: RubricGradeItemDto[]): RubricGradeItemDto[] {
    return items.filter((i) => this.isLost(i));
  }

  kb(bytes: number): number {
    return Math.max(1, Math.round(bytes / 1024));
  }

  downloadFile(r: TeacherAttemptReviewDto, f: SubmittedFileDto): void {
    this.reportService.downloadAttemptFile(r.attemptId, f.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = f.name;
        a.click();
        URL.revokeObjectURL(url);
      },
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

  /** A megnyitott beadás betöltése; attemptId-váltáskor a latch feloldásával, hogy az új beadás piszkozata töltődjön. */
  private readonly loadOnOpen = effect(() => {
    const attemptId = this.attemptId();
    untracked(() => {
      this.syncedAttemptId = null;
      this.draftPoints = null;
      this.draftFeedback = '';
      this.feedbackTouched = false;
      this.report.loadAttemptReview(attemptId);
    });
  });

  close(): void {
    this.report.clearAttemptReview();
    this.closed.emit();
  }
}
