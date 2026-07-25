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

  // UI-TT-124: setStatusFilter() minden fülváltáskor feltétel nélkül meghívja load()-ot -
  // egy egyszerű `if (this._loading()) return;` guard (mint approve()/reject()-nél) itt NEM
  // helyes megoldás lenne: a felhasználó legutolsó szűrő-választásának MINDIG érvényesülnie
  // kell, még akkor is, ha egy korábbi (még folyamatban lévő) load() hívást "elveszítene" a
  // guard. Ehelyett egy generációs számlálóval mindkét (átfedő) kérés elindulhat, de csak a
  // LEGUTÓBB indított hívás válasza (akármelyik érkezzen is meg utoljára a hálózaton)
  // érvényesül - ugyanaz a "legfrissebb szándék nyer" minta, mint a UI-TS-108/109 stale-
  // response race fixek a testvér orafoglalo-tudastar-fe repóban.
  private _loadGeneration = 0;

  readonly applications = computed(() => this._applications());
  readonly loading = computed(() => this._loading());
  readonly error = computed(() => this._error());
  readonly statusFilter = computed(() => this._statusFilter());

  setStatusFilter(status: 'pending' | 'approved' | 'rejected' | 'all'): void {
    this._statusFilter.set(status);
    this.load();
  }

  load(): void {
    const generation = ++this._loadGeneration;
    this._loading.set(true);
    this._error.set(null);
    this._applications.set([]);

    this.service
      .getApplications(this._statusFilter())
      .pipe(
        take(1),
        finalize(() => {
          // Egy elavult (időközben egy ÚJABB load()-tól "lekörözött") hívás finalize()-a
          // ne zárja le a loading-ot, amíg a ténylegesen legutóbbi hívás még folyamatban van.
          if (generation === this._loadGeneration) this._loading.set(false);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (applications) => {
          // Elavult válasz - egy KÉSŐBBI load() már felülírta a szándékot, ezt eldobjuk.
          if (generation !== this._loadGeneration) return;
          this._applications.set(applications);
        },
        error: (err) => {
          if (generation !== this._loadGeneration) return;
          this._error.set(err.error?.errorMessage ?? 'A jelentkezések betöltése sikertelen.');
        },
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
