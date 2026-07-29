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
  private readonly _loading = signal(false);
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
  readonly loading = computed(() => this._loading());
  readonly error = computed(() => this._error());

  readonly selectedTeacherId = computed(() => this._selectedTeacherId());
  readonly taskSets = computed(() => this._taskSets());
  readonly taskSetsLoading = computed(() => this._taskSetsLoading());

  load(): void {
    this._loading.set(true);
    this._error.set(null);

    this.service
      .getTeachers()
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (teachers) => this._teachers.set(teachers),
        error: (err) => this._error.set(err.error?.errorMessage ?? 'A tanárok betöltése sikertelen.'),
      });
  }

  setActive(teacherProfileId: number, isActive: boolean, onSuccess?: () => void): void {
    if (this._loading()) return;

    this._loading.set(true);
    this._error.set(null);

    this.service
      .setActive(teacherProfileId, isActive)
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this._teachers.update((list) =>
            list.map((t) => (t.id === teacherProfileId ? { ...t, isActive } : t)),
          );
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
    if (this._loading()) return;

    this._loading.set(true);
    this._error.set(null);

    this.service
      .setQuota(teacherProfileId, maxTaskSets, maxStorageBytes)
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this._teachers.update((list) =>
            list.map((t) => (t.id === teacherProfileId ? { ...t, maxTaskSets, maxStorageBytes } : t)),
          );
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
    if (this._loading()) return;

    this._loading.set(true);
    this._error.set(null);

    this.service
      .takedownTaskSet(taskSetId)
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this._taskSets.update((list) =>
            list.map((ts) =>
              ts.id === taskSetId ? { ...ts, isPublished: false, takedownAt: new Date().toISOString() } : ts,
            ),
          );
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
    if (this._loading()) return;

    this._loading.set(true);
    this._error.set(null);

    this.service
      .reinstateTaskSet(taskSetId)
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this._taskSets.update((list) =>
            list.map((ts) => (ts.id === taskSetId ? { ...ts, isPublished: true, takedownAt: null } : ts)),
          );
          if (onSuccess) onSuccess();
        },
        error: (err) => this._error.set(err.error?.errorMessage ?? 'A feloldás sikertelen.'),
      });
  }

  clearError(): void {
    this._error.set(null);
  }
}
