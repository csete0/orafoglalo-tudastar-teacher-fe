import { Injectable, signal, computed, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, take } from 'rxjs/operators';
import { AdminSchoolService } from './admin-school.service';
import { SchoolAdminDto, SchoolMergeResultDto } from '../../models/teacher-moderation.model';

@Injectable({ providedIn: 'root' })
export class AdminSchoolStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(AdminSchoolService);

  private readonly _schools = signal<SchoolAdminDto[]>([]);
  private readonly _loading = signal(false);
  private readonly _lastMergeResult = signal<SchoolMergeResultDto | null>(null);
  private readonly _error = signal<string | null>(null);

  readonly schools = computed(() => this._schools());
  readonly loading = computed(() => this._loading());
  readonly lastMergeResult = computed(() => this._lastMergeResult());
  readonly error = computed(() => this._error());

  load(): void {
    this._loading.set(true);
    this._error.set(null);

    // UI-TT-65: korábban egy sima next-only callbackkel subscribe-olt - hiba
    // esetén a store error()-je sosem állt be (a admin némán "üres listát" látott
    // volna), ÉS egy kezeletlen RxJS-kivétel is landolt (a "ERROR HttpErrorResponse"
    // konzol-tünet).
    this.service
      .getSchools()
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (schools) => this._schools.set(schools),
        error: (err) => this._error.set(err.error?.errorMessage ?? 'Az intézmények betöltése sikertelen.'),
      });
  }

  /**
   * Siker esetén a lista teljes újratöltéssel frissül — egyszerűbb, mint
   * optimista update, mert egy egyesítés két sort is módosít egyszerre
   * (a forrás eltűnik, a cél számai nőnek). Sikertelen egyesítésnél (pl.
   * a backend OrafoglaloException-t dob, mert a forrás időközben törölve
   * lett) a korábbi, immár félrevezető sikeres eredményt is töröljük, hogy
   * ne maradjon egy ellentmondó "Egyesítés sikeres." panel a képernyőn.
   */
  merge(sourceSchoolId: number, targetSchoolId: number): void {
    if (this._loading()) return;

    this._loading.set(true);
    this._error.set(null);

    // Nincs finalize() itt: siker esetén load() maga felel a loading
    // ki/be kapcsolásáért (a listát is újratölti), így a gomb a teljes
    // egyesítés+újratöltés alatt letiltva marad. Hiba esetén viszont
    // load() sosem fut le, ezért azt a loading-jelet itt kapcsoljuk ki.
    this.service
      .merge(sourceSchoolId, targetSchoolId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this._lastMergeResult.set(result);
          this.load();
        },
        error: (err) => {
          this._lastMergeResult.set(null);
          this._error.set(err.error?.errorMessage ?? 'Az egyesítés sikertelen.');
          this._loading.set(false);
        },
      });
  }

  clearLastMergeResult(): void {
    this._lastMergeResult.set(null);
  }

  clearError(): void {
    this._error.set(null);
  }
}
