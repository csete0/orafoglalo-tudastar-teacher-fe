import { Injectable, signal, computed, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable } from 'rxjs';
import { finalize, take } from 'rxjs/operators';
import { ReportService } from './report.service';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';
import {
  StudentActivityDetailDto,
  StudentActivitySummaryDto,
  TeacherAttemptReviewDto,
  TeacherScoreOverrideRequest,
  TeacherTaskSetResultsDto,
} from '../../models/report.model';

@Injectable({ providedIn: 'root' })
export class ReportStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(ReportService);

  private readonly _groupActivity = signal<StudentActivitySummaryDto[]>([]);
  private readonly _schoolActivity = signal<StudentActivitySummaryDto[]>([]);
  private readonly _studentDetail = signal<StudentActivityDetailDto | null>(null);
  private readonly _taskSetResults = signal<TeacherTaskSetResultsDto | null>(null);
  private readonly _attemptReview = signal<TeacherAttemptReviewDto | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  /** Külön a mátrix `_loading`-jától: a panel töltése ne cserélje spinnerre az egész táblát. */
  private readonly _reviewLoading = signal(false);

  // Ugyanaz a hiba-osztály, mint a LeaderboardStore/TeacherApplicationStore
  // (UI-TT-124-mintájú) generációs-számláló fixje: mivel ez a store `providedIn:
  // 'root'` és a `takeUntilDestroyed(this.destroyRef)` a STORE saját (gyakorlatilag
  // örökké élő) DestroyRef-jéhez kötött, nem a fogyasztó komponenséhez, egy
  // entitásról (pl. Csoport A) egy másikra (Csoport B) való átnavigálás NEM
  // szakítja meg Csoport A még folyamatban lévő HTTP hívását. Ha az később, Csoport
  // B már megjelenített, helyes válasza UTÁN érkezik meg, csendben felülírná azt.
  // Külön generáció-számláló loaderenkénti, mert a 4 metódus egymástól független
  // entitásokat tölt be különböző signalokba.
  private _groupActivityGeneration = 0;
  private _schoolActivityGeneration = 0;
  private _studentDetailGeneration = 0;
  private _taskSetResultsGeneration = 0;
  // Ugyanaz az indok, mint a fenti négynél: a tanár egy cella panelját bezárva egy
  // MÁSIK cellára kattinthat, mielőtt az első válasza megérkezne — generáció nélkül
  // a lassabb, korábbi válasz felülírná a már megjelenített újat.
  private _attemptReviewGeneration = 0;

  // UI-TT-72 mintája, a 7. fázis dátumszűrőjéhez kiterjesztve. Az alábbi három
  // loadert mostantól nem csak navigációkor hívjuk, hanem UGYANARRA az entitásra
  // is, csak más `from`/`to` szűrővel. Ha ilyenkor is töröljük az adatot, a tábla
  // minden szűrő-váltáskor felvillan üresen ("Nincs adat.") vagy spinnerre vált —
  // ezért csak akkor törlünk, ha ténylegesen MÁSIK entitásra váltottunk.
  private _groupActivityId: number | null = null;
  private _schoolActivityId: number | null = null;
  private _studentDetailId: number | null = null;

  readonly groupActivity = computed(() => this._groupActivity());
  readonly schoolActivity = computed(() => this._schoolActivity());
  readonly studentDetail = computed(() => this._studentDetail());
  readonly taskSetResults = computed(() => this._taskSetResults());
  readonly attemptReview = computed(() => this._attemptReview());
  readonly loading = computed(() => this._loading());
  readonly reviewLoading = computed(() => this._reviewLoading());
  readonly error = computed(() => this._error());

  loadGroupActivity(groupId: number, from?: Date, to?: Date): void {
    const generation = ++this._groupActivityGeneration;
    this._loading.set(true);
    this._error.set(null);
    if (this._groupActivityId !== groupId) {
      this._groupActivity.set([]);
      this._groupActivityId = groupId;
    }

    this.service
      .getGroupActivity(groupId, from, to)
      .pipe(
        take(1),
        finalize(() => {
          if (generation === this._groupActivityGeneration) this._loading.set(false);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (activity) => {
          if (generation !== this._groupActivityGeneration) return;
          this._groupActivity.set(activity);
        },
        error: (err) => {
          if (generation !== this._groupActivityGeneration) return;
          this._error.set(err.error?.errorMessage ?? 'A csoport-aktivitás betöltése sikertelen.');
        },
      });
  }

  loadSchoolActivity(schoolId: number, from?: Date, to?: Date): void {
    const generation = ++this._schoolActivityGeneration;
    this._loading.set(true);
    this._error.set(null);
    if (this._schoolActivityId !== schoolId) {
      this._schoolActivity.set([]);
      this._schoolActivityId = schoolId;
    }

    this.service
      .getSchoolActivity(schoolId, from, to)
      .pipe(
        take(1),
        finalize(() => {
          if (generation === this._schoolActivityGeneration) this._loading.set(false);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (activity) => {
          if (generation !== this._schoolActivityGeneration) return;
          this._schoolActivity.set(activity);
        },
        error: (err) => {
          if (generation !== this._schoolActivityGeneration) return;
          this._error.set(err.error?.errorMessage ?? 'Ehhez a riporthoz intézmény-admin szerep kell.');
        },
      });
  }

  loadStudentActivity(studentUserId: number, from?: Date, to?: Date): void {
    const generation = ++this._studentDetailGeneration;
    this._loading.set(true);
    this._error.set(null);
    if (this._studentDetailId !== studentUserId) {
      this._studentDetail.set(null);
      this._studentDetailId = studentUserId;
    }

    this.service
      .getStudentActivity(studentUserId, from, to)
      .pipe(
        take(1),
        finalize(() => {
          if (generation === this._studentDetailGeneration) this._loading.set(false);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (detail) => {
          if (generation !== this._studentDetailGeneration) return;
          this._studentDetail.set(detail);
        },
        error: (err) => {
          if (generation !== this._studentDetailGeneration) return;
          this._error.set(err.error?.errorMessage ?? 'A diák adatainak betöltése sikertelen.');
        },
      });
  }

  loadTaskSetResults(taskSetId: number): void {
    const generation = ++this._taskSetResultsGeneration;
    this._loading.set(true);
    this._error.set(null);

    // UI-TT-72 mintája: MÁSIK feladatsorra váltáskor a régi adatot azonnal töröljük,
    // különben a válaszig az előző feladatsor mátrixa látszana az új URL alatt. DE
    // ugyanannak az id-nak az újratöltésekor (a felülbírálás minden sikeres mentés
    // után ide fut vissza) szándékosan megtartjuk — egy null érték a sablon
    // `@else if (loading())` ágán át a TELJES táblát, és vele a nyitott értékelő
    // panelt is, egy spinnerre cserélné minden egyes mentésnél.
    if (this._taskSetResults()?.taskSetId !== taskSetId) {
      this._taskSetResults.set(null);
    }

    this.service
      .getTaskSetResults(taskSetId)
      .pipe(
        take(1),
        finalize(() => {
          if (generation === this._taskSetResultsGeneration) this._loading.set(false);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (results) => {
          if (generation !== this._taskSetResultsGeneration) return;
          this._taskSetResults.set(results);
        },
        error: (err) => {
          if (generation !== this._taskSetResultsGeneration) return;
          this._error.set(err.error?.errorMessage ?? 'Az eredmény-mátrix betöltése sikertelen.');
        },
      });
  }

  /** Az értékelő panel adatai egy konkrét beadásra. */
  loadAttemptReview(attemptId: number): void {
    const generation = ++this._attemptReviewGeneration;
    this._reviewLoading.set(true);
    this._error.set(null);
    this._attemptReview.set(null);

    this.service
      .getAttemptReview(attemptId)
      .pipe(
        take(1),
        finalize(() => {
          if (generation === this._attemptReviewGeneration) this._reviewLoading.set(false);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (review) => {
          if (generation !== this._attemptReviewGeneration) return;
          this._attemptReview.set(review);
        },
        error: (err) => {
          if (generation !== this._attemptReviewGeneration) return;
          // Szándékos eltérés a fenti négy loader `err.error?.errorMessage` mintájától:
          // az értékelő végpontok DataAnnotations-validációt is adhatnak
          // (`ValidationProblemDetails`), amit csak ez a helper bont ki helyesen.
          this._error.set(extractErrorMessage(err, 'Az értékelő nézet betöltése sikertelen.'));
        },
      });
  }

  /**
   * Pontszám és/vagy szöveges értékelés mentése. A válasz maga a frissített nézet,
   * ezért a panelt nem kell újratölteni — a MÁTRIXot viszont igen, hogy a cella az új
   * pontszámot és a "felülbírálva" jelzést mutassa.
   *
   * FONTOS: nincs `finalize()` ezen a mutáción. A `_loading` szándékosan true marad a
   * mutáció válasza után is, egészen addig, amíg a szinkron elindított
   * `loadTaskSetResults()` saját `finalize()`-a le nem zárja (UI-TT-45 / UI-TT-147) —
   * enélkül a UI egy pillanatra "kész, nem tölt" állapotot mutatna a régi mátrixszal.
   */
  overrideScore(
    taskSetId: number,
    attemptId: number,
    request: TeacherScoreOverrideRequest,
    onSuccess?: () => void,
  ): void {
    this.mutateReview(this.service.overrideScore(attemptId, request), taskSetId, onSuccess);
  }

  /** A felülbírálás visszavonása — a pontszám visszaáll az AI eredeti értékére. */
  revertOverride(taskSetId: number, attemptId: number, onSuccess?: () => void): void {
    this.mutateReview(this.service.revertOverride(attemptId), taskSetId, onSuccess);
  }

  clearAttemptReview(): void {
    // A generáció léptetése zárja ki, hogy egy még úton lévő válasz a panel bezárása
    // UTÁN visszaírja az adatot (és ezzel láthatatlanul "újranyissa" az állapotot).
    this._attemptReviewGeneration++;
    this._attemptReview.set(null);
    this._reviewLoading.set(false);
  }

  clearError(): void {
    this._error.set(null);
  }

  private mutateReview(
    observable: Observable<TeacherAttemptReviewDto>,
    taskSetId: number,
    onSuccess?: () => void,
  ): void {
    this._loading.set(true);
    this._error.set(null);

    observable
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (review) => {
          // A panel a válaszból frissül; a generációt is léptetjük, hogy egy
          // időközben elindult, régebbi GET válasza ne írhassa vissza a mentés
          // előtti állapotot.
          this._attemptReviewGeneration++;
          this._attemptReview.set(review);
          this.loadTaskSetResults(taskSetId);
          if (onSuccess) onSuccess();
        },
        error: (err) => {
          this._error.set(extractErrorMessage(err, 'A művelet sikertelen.'));
          this._loading.set(false);
        },
      });
  }
}
