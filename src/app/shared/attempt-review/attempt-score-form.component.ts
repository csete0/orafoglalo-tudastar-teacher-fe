import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, output, Signal, WritableSignal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ReportStore } from '../../services/report/report.store';
import { TeacherAttemptReviewDto } from '../../models/report.model';
import { ConfirmService } from '../confirm/confirm.service';
import { ToastService } from '../toast/toast.service';

/** A backend `TeacherAttemptReviewService.MaxTeacherFeedbackLength` párja. */
const MAX_FEEDBACK_LENGTH = 2000;

const LEFT_GROUP_NOTE = 'A diák kilépett a csoportból – a tagként írt dolgozata csak olvasható.';

/**
 * Piszkozat-mező: a beadás első nézetéből töltődik fel, utána (ugyanarra a beadásra) csak a tanár
 * írja. A nézet későbbi frissülése (mentés-válasz, visszaállítás) így nem írja vissza a mentett
 * értéket a tanár épp szerkesztett szövegére (UI-TT-62 minta); másik beadás nézete újratölti.
 */
function draftOf<T>(
  review: Signal<TeacherAttemptReviewDto>,
  initial: (review: TeacherAttemptReviewDto) => T,
): WritableSignal<T> {
  return linkedSignal<TeacherAttemptReviewDto, T>({
    source: review,
    computation: (current, previous) =>
      previous && previous.source.attemptId === current.attemptId ? previous.value : initial(current),
  });
}

/**
 * Az értékelő panel „Saját értékelés” része: pont-felülírás, szöveges értékelés, mentés és a
 * felülbírálás visszaállítása. A mentés/visszaállítás a ReportStore-on át megy (az a feladatsor
 * mátrixát is frissíti); a `changed` a panelen át a szülőnek szól.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-attempt-score-form',
  imports: [FormsModule],
  host: { class: 'block mt-4' },
  template: `
    @let r = review();
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
        {{ r.studentLeftGroup ? leftGroupNote : 'Ehhez a beadáshoz még nincs kiértékelt eredmény, ezért a pontszám nem módosítható.' }}
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
      <textarea #feedbackInput rows="3" [id]="'ertekeles-' + r.attemptId"
        [value]="draftFeedback()"
        (input)="onFeedbackInput(feedbackInput.value)"
        [attr.maxlength]="maxFeedbackLength"
        [disabled]="!canEditScore(r)"
        class="input !py-1.5 w-full disabled:opacity-60 disabled:cursor-not-allowed"
        placeholder="Amit a diáknak érdemes tudnia — akkor is hasznos, ha a pontszámmal egyetértesz."></textarea>
      @if (!canEditScore(r)) {
        <p class="text-sm text-text-muted mt-1">
          {{ r.studentLeftGroup ? leftGroupNote : 'Ehhez a beadáshoz még nincs kiértékelt eredmény, ezért a szöveges értékelés sem menthető el.' }}
        </p>
      } @else {
        <div class="flex justify-between gap-2 mt-1">
          @if (feedbackError(); as err) {
            <p class="text-sm text-danger">{{ err }}</p>
          } @else {
            <span></span>
          }
          <span class="text-xs text-text-muted">{{ draftFeedback().length }}/{{ maxFeedbackLength }}</span>
        </div>
      }
    </div>
  `,
})
export class AttemptScoreFormComponent {
  readonly report = inject(ReportStore);
  private readonly confirmService = inject(ConfirmService);
  private readonly toastService = inject(ToastService);

  /** A panelen éppen nyitott beadás nézete (a panel csak a saját beadásáét adja át). */
  readonly review = input.required<TeacherAttemptReviewDto>();
  readonly taskSetId = input.required<number>();
  readonly changed = output<void>();

  /** A backend ugyanezt a korlátot kényszeríti ki (TeacherAttemptReviewService). */
  readonly maxFeedbackLength = MAX_FEEDBACK_LENGTH;
  readonly leftGroupNote = LEFT_GROUP_NOTE;

  readonly draftPoints = draftOf(this.review, (review) => review.earnedPoints);
  readonly draftFeedback = draftOf(this.review, (review) => review.teacherFeedback ?? '');

  /**
   * BE-TEACHERATTEMPTREVIEW-OVERRIDE-FEEDBACK-LOST-UPDATE: nyomon követi, hogy a tanár
   * TÉNYLEGESEN hozzáért-e az értékelés-mezőhöz, mióta a panel a jelenlegi beadáshoz
   * betöltődött — a mentéskor ez dönti el, hogy a `teacherFeedback` egyáltalán
   * elküldésre kerüljön-e. Enélkül egy csak-pontszámot-módosító mentés (a mező
   * érintetlenül hagyva) ugyanazt a `null`-t küldené, mint egy szándékos törlés — a
   * backend nem tudná megkülönböztetni a kettőt, és lenullázná egy MÁSIK, konkurens
   * tanár épp beírt értékelését.
   */
  readonly feedbackTouched = draftOf(this.review, () => false);

  readonly feedbackError = computed(() =>
    this.draftFeedback().length > MAX_FEEDBACK_LENGTH
      ? `A szöveges értékelés legfeljebb ${MAX_FEEDBACK_LENGTH} karakter lehet.`
      : null,
  );

  /**
   * A pontszám csak akkor szerkeszthető, ha egyáltalán van kiértékelt eredmény.
   * A backend `MaxPoints`-a 0, ha a beadáshoz nem tartozik `ExamTaskResult` —
   * ilyenkor a mentés szerver-oldalon is elutasításra kerülne.
   * A kilépett diák dolgozata csak olvasható (a BE is elutasítja a módosítást).
   */
  canEditScore(review: TeacherAttemptReviewDto): boolean {
    return review.maxPoints > 0 && !review.studentLeftGroup;
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
    const points = this.draftPoints();
    if (points == null) return null;
    if (!Number.isInteger(points)) return 'A pontszám csak egész szám lehet.';
    if (points < 0) return 'A pontszám nem lehet negatív.';
    if (points > review.maxPoints) {
      return `A pontszám nem lehet több a feladat maximumánál (${review.maxPoints} pont).`;
    }
    return null;
  }

  onFeedbackInput(value: string): void {
    this.draftFeedback.set(value);
    this.feedbackTouched.set(true);
  }

  save(review: TeacherAttemptReviewDto): void {
    if (this.report.taskSetResultsLoading()) return;

    // Soha ne legyen néma no-op: ha a mentés nem indul el, a tanárnak tudnia kell,
    // miért (UI-TT-134).
    const error = this.pointsError(review) ?? this.feedbackError();
    if (error) {
      this.toastService.warning(error);
      return;
    }

    const points = this.draftPoints();
    const feedbackProvided = this.feedbackTouched();
    if (points == null && !feedbackProvided) {
      this.toastService.warning(
        'Adj meg pontszámot vagy szöveges értékelést. A felülbírálás visszavonásához használd a visszaállítást.',
      );
      return;
    }

    this.report.overrideScore(
      this.taskSetId(),
      review.attemptId,
      { earnedPoints: points, teacherFeedback: this.draftFeedback().trim() || null, feedbackProvided },
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
      this.draftPoints.set(null);
      this.draftFeedback.set('');
      this.feedbackTouched.set(false);
      this.toastService.success(
        aiScoreExists ? 'Visszaállítva az AI pontjára.' : 'Felülbírálás törölve.',
      );
      this.changed.emit();
    });
  }
}
