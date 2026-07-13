import { Injectable, signal, computed, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, take } from 'rxjs/operators';
import { ReportService } from './report.service';
import { StudentActivityDetailDto, StudentActivitySummaryDto, TeacherTaskSetResultsDto } from '../../models/report.model';

@Injectable({ providedIn: 'root' })
export class ReportStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(ReportService);

  private readonly _groupActivity = signal<StudentActivitySummaryDto[]>([]);
  private readonly _schoolActivity = signal<StudentActivitySummaryDto[]>([]);
  private readonly _studentDetail = signal<StudentActivityDetailDto | null>(null);
  private readonly _taskSetResults = signal<TeacherTaskSetResultsDto | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly groupActivity = computed(() => this._groupActivity());
  readonly schoolActivity = computed(() => this._schoolActivity());
  readonly studentDetail = computed(() => this._studentDetail());
  readonly taskSetResults = computed(() => this._taskSetResults());
  readonly loading = computed(() => this._loading());
  readonly error = computed(() => this._error());

  loadGroupActivity(groupId: number, from?: Date, to?: Date): void {
    this._loading.set(true);
    this._error.set(null);
    this._groupActivity.set([]);

    this.service
      .getGroupActivity(groupId, from, to)
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (activity) => this._groupActivity.set(activity),
        error: (err) => this._error.set(err.error?.errorMessage ?? 'A csoport-aktivitás betöltése sikertelen.'),
      });
  }

  loadSchoolActivity(schoolId: number, from?: Date, to?: Date): void {
    this._loading.set(true);
    this._error.set(null);
    this._schoolActivity.set([]);

    this.service
      .getSchoolActivity(schoolId, from, to)
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (activity) => this._schoolActivity.set(activity),
        error: (err) => this._error.set(err.error?.errorMessage ?? 'Ehhez a riporthoz intézmény-admin szerep kell.'),
      });
  }

  loadStudentActivity(studentUserId: number, from?: Date, to?: Date): void {
    this._loading.set(true);
    this._error.set(null);
    this._studentDetail.set(null);

    this.service
      .getStudentActivity(studentUserId, from, to)
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (detail) => this._studentDetail.set(detail),
        error: (err) => this._error.set(err.error?.errorMessage ?? 'A diák adatainak betöltése sikertelen.'),
      });
  }

  loadTaskSetResults(taskSetId: number): void {
    this._loading.set(true);
    this._error.set(null);
    this._taskSetResults.set(null);

    this.service
      .getTaskSetResults(taskSetId)
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (results) => this._taskSetResults.set(results),
        error: (err) => this._error.set(err.error?.errorMessage ?? 'Az eredmény-mátrix betöltése sikertelen.'),
      });
  }

  clearError(): void {
    this._error.set(null);
  }
}
