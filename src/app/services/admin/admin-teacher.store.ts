import { Injectable, signal, computed, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, take } from 'rxjs/operators';
import { AdminTeacherService } from './admin-teacher.service';
import { AdminTaskSetDto, TeacherProfileAdminDto } from '../../models/teacher-moderation.model';

@Injectable({ providedIn: 'root' })
export class AdminTeacherStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(AdminTeacherService);

  private readonly _teachers = signal<TeacherProfileAdminDto[]>([]);
  // UI-TT-136: a UI-TT-117 fix `setActive()`/`setQuota()`/`takedownTaskSet()`-re (és a
  // szintén ide tartozó `reinstateTaskSet()`-re) rakott dupla-kattintás elleni korai-return
  // egyetlen KÖZÖS jelzőt védett, nem tanáronkénti/feladatsoronkéntit - ha az admin egy tanár
  // sorában elindított egy hívást, egy MÁSIK tanár sorában megnyomott gomb csendben elakadt a
  // guardon. Műveletenkénti+entitásonkénti kulcs (`${method}:${id}`), a UserStore/NotificationStore/
  // ExamStore-nál már bevált mintát követve: mindegyik hívás csak a SAJÁT célpontját blokkolja,
  // a publikus `loading()` viszont változatlanul "bármi folyamatban van"-t jelent.
  private readonly _inFlight = signal<ReadonlySet<string>>(new Set<string>());
  private readonly _error = signal<string | null>(null);

  private readonly _selectedTeacherId = signal<number | null>(null);
  private readonly _taskSets = signal<AdminTaskSetDto[]>([]);
  private readonly _taskSetsLoading = signal(false);

  // UI-TT-108: ugyanaz a stale-response hibaosztály, mint a ReportStore/SchoolStore
  // (UI-TT-148/149) fixjénél, de itt a KÖVETKEZMÉNY súlyosabb: nem csak megtévesztő
  // olvasási nézet, hanem egy VALÓS admin-mutáció rossz célpontra alkalmazása. Ha az
  // admin A tanárra kattint, majd — még A `getTaskSets()`-e előtt — B-re, és A válasza
  // ér célba utoljára, A feladatsor-listája felülírja B-ét, miközben a
  // `selectedTeacherId()` B-t mutat: egy innen indított `takedownTaskSet()` A tanár
  // tartalmát vonná vissza B helyett.
  private _taskSetsGeneration = 0;

  readonly teachers = computed(() => this._teachers());
  readonly loading = computed(() => this._inFlight().size > 0);
  readonly error = computed(() => this._error());

  readonly selectedTeacherId = computed(() => this._selectedTeacherId());
  readonly taskSets = computed(() => this._taskSets());
  readonly taskSetsLoading = computed(() => this._taskSetsLoading());

  load(): void {
    if (this._isInFlight('load')) return;
    this._begin('load');

    this.service
      .getTeachers()
      .pipe(
        take(1),
        finalize(() => this._end('load')),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (teachers) => this._teachers.set(teachers),
        error: (err) => this._error.set(err.error?.errorMessage ?? 'A tanárok betöltése sikertelen.'),
      });
  }

  setActive(teacherProfileId: number, isActive: boolean, onSuccess?: () => void): void {
    const key = `setActive:${teacherProfileId}`;
    if (this._isInFlight(key)) return;
    this._begin(key);

    this.service
      .setActive(teacherProfileId, isActive)
      .pipe(
        take(1),
        finalize(() => this._end(key)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this._teachers.update((list) =>
            list.map((t) => (t.id === teacherProfileId ? { ...t, isActive } : t)),
          );
          // UI-TT-168: `_error` a UI-TT-136 fix után is EGYETLEN, minden tanár között
          // MEGOSZTOTT signal maradt (csak `_inFlight` lett entitásonkénti) - egy
          // sikeresen lezáruló, FÜGGETLEN döntés törli a régi, MÁSIK tanártól származó
          // hibaüzenetet is, hogy ne maradjon látható utána.
          this._error.set(null);
          if (onSuccess) onSuccess();
        },
        error: (err) => this._error.set(err.error?.errorMessage ?? 'A módosítás sikertelen.'),
      });
  }

  setQuota(
    teacherProfileId: number,
    maxTaskSets: number | null,
    maxStorageBytes: number | null,
    onSuccess?: () => void,
  ): void {
    const key = `setQuota:${teacherProfileId}`;
    if (this._isInFlight(key)) return;
    this._begin(key);

    this.service
      .setQuota(teacherProfileId, maxTaskSets, maxStorageBytes)
      .pipe(
        take(1),
        finalize(() => this._end(key)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this._teachers.update((list) =>
            list.map((t) => (t.id === teacherProfileId ? { ...t, maxTaskSets, maxStorageBytes } : t)),
          );
          // UI-TT-168, ld. setActive() fenti megjegyzését.
          this._error.set(null);
          if (onSuccess) onSuccess();
        },
        error: (err) => this._error.set(err.error?.errorMessage ?? 'A kvóta mentése sikertelen.'),
      });
  }

  selectTeacher(teacherProfileId: number): void {
    if (this._selectedTeacherId() === teacherProfileId) {
      // A generációt a BEZÁRÓ ágon is léptetni kell: ha a sor összecsukásakor még
      // folyamatban van egy `getTaskSets()`, a késve érkező válasza enélkül
      // visszatöltené a listát egy már deszelektált tanárhoz.
      this._taskSetsGeneration++;
      this._selectedTeacherId.set(null);
      this._taskSets.set([]);
      this._taskSetsLoading.set(false);
      return;
    }

    const generation = ++this._taskSetsGeneration;
    this._selectedTeacherId.set(teacherProfileId);
    this._taskSets.set([]);
    this._taskSetsLoading.set(true);
    this._error.set(null);

    this.service
      .getTaskSets(teacherProfileId)
      .pipe(
        take(1),
        finalize(() => {
          if (generation === this._taskSetsGeneration) this._taskSetsLoading.set(false);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (taskSets) => {
          if (generation !== this._taskSetsGeneration) return;
          this._taskSets.set(taskSets);
        },
        error: (err) => {
          if (generation !== this._taskSetsGeneration) return;
          this._error.set(err.error?.errorMessage ?? 'A feladatsorok betöltése sikertelen.');
        },
      });
  }

  takedownTaskSet(taskSetId: number, onSuccess?: () => void): void {
    const key = `takedownTaskSet:${taskSetId}`;
    if (this._isInFlight(key)) return;
    this._begin(key);

    this.service
      .takedownTaskSet(taskSetId)
      .pipe(
        take(1),
        finalize(() => this._end(key)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this._taskSets.update((list) =>
            list.map((ts) =>
              ts.id === taskSetId ? { ...ts, isPublished: false, takedownAt: new Date().toISOString() } : ts,
            ),
          );
          // UI-TT-168, ld. setActive() fenti megjegyzését.
          this._error.set(null);
          if (onSuccess) onSuccess();
        },
        error: (err) => this._error.set(err.error?.errorMessage ?? 'A visszavonás sikertelen.'),
      });
  }

  /**
   * Az admin-takedown feloldása. A takedown óta a tanár SAJÁT publikálása szerveroldalon
   * elhasal, tehát enélkül a művelet nélkül a döntés csak nyers API-hívással lenne
   * visszafordítható — ez az egyetlen felületi útja.
   */
  reinstateTaskSet(taskSetId: number, onSuccess?: () => void): void {
    const key = `reinstateTaskSet:${taskSetId}`;
    if (this._isInFlight(key)) return;
    this._begin(key);

    this.service
      .reinstateTaskSet(taskSetId)
      .pipe(
        take(1),
        finalize(() => this._end(key)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this._taskSets.update((list) =>
            list.map((ts) => (ts.id === taskSetId ? { ...ts, isPublished: true, takedownAt: null } : ts)),
          );
          // UI-TT-168, ld. setActive() fenti megjegyzését.
          this._error.set(null);
          if (onSuccess) onSuccess();
        },
        error: (err) => this._error.set(err.error?.errorMessage ?? 'A feloldás sikertelen.'),
      });
  }

  clearError(): void {
    this._error.set(null);
  }

  private _isInFlight(key: string): boolean {
    return this._inFlight().has(key);
  }

  private _begin(key: string): void {
    this._inFlight.update((prev) => new Set(prev).add(key));
    this._error.set(null);
  }

  private _end(key: string): void {
    this._inFlight.update((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }
}
