import { Injectable, signal, computed, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, take } from 'rxjs/operators';
import { AdminApplicationService } from './admin-application.service';
import { RejectTeacherApplicationRequest, TeacherApplicationAdminDto } from '../../models/teacher-application.model';

@Injectable({ providedIn: 'root' })
export class AdminApplicationStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(AdminApplicationService);

  private readonly _applications = signal<TeacherApplicationAdminDto[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _statusFilter = signal<'pending' | 'approved' | 'rejected' | 'all'>('pending');

  readonly applications = computed(() => this._applications());
  readonly loading = computed(() => this._loading());
  readonly error = computed(() => this._error());
  readonly statusFilter = computed(() => this._statusFilter());

  setStatusFilter(status: 'pending' | 'approved' | 'rejected' | 'all'): void {
    this._statusFilter.set(status);
    this.load();
  }

  load(): void {
    this._loading.set(true);
    this._error.set(null);

    this.service
      .getApplications(this._statusFilter())
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (applications) => this._applications.set(applications),
        error: (err) => this._error.set(err.error?.errorMessage ?? 'A jelentkezések betöltése sikertelen.'),
      });
  }

  approve(id: number, onSuccess?: () => void): void {
    if (this._loading()) return;

    this._loading.set(true);
    this._error.set(null);

    this.service
      .approve(id)
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this._applications.update((list) => list.filter((a) => a.id !== id));
          if (onSuccess) onSuccess();
        },
        error: (err) => this._error.set(err.error?.errorMessage ?? 'A jóváhagyás sikertelen.'),
      });
  }

  reject(id: number, request: RejectTeacherApplicationRequest, onSuccess?: () => void): void {
    if (this._loading()) return;

    this._loading.set(true);
    this._error.set(null);

    this.service
      .reject(id, request)
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this._applications.update((list) => list.filter((a) => a.id !== id));
          if (onSuccess) onSuccess();
        },
        error: (err) => this._error.set(err.error?.errorMessage ?? 'Az elutasítás sikertelen.'),
      });
  }

  clearError(): void {
    this._error.set(null);
  }
}
