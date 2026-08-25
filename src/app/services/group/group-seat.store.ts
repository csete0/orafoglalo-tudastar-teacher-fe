import { Injectable, signal, computed, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, take } from 'rxjs/operators';
import { GroupSeatService } from './group-seat.service';
import { GroupSeatOverviewDto, ReleaseGroupSeatsResultDto } from '../../models/group-seat.model';

@Injectable({ providedIn: 'root' })
export class GroupSeatStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(GroupSeatService);

  private readonly _overview = signal<GroupSeatOverviewDto | null>(null);
  private readonly _lastReleaseResult = signal<ReleaseGroupSeatsResultDto | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly overview = computed(() => this._overview());
  readonly lastReleaseResult = computed(() => this._lastReleaseResult());
  readonly loading = computed(() => this._loading());
  readonly error = computed(() => this._error());

  /** Van-e egyáltalán érvényes licenc a csoport intézményéhez. */
  readonly hasLicense = computed(() => this._overview()?.licenseId != null);

  clear(): void {
    this._overview.set(null);
    this._lastReleaseResult.set(null);
    this._error.set(null);
  }

  load(groupId: number): void {
    this._loading.set(true);
    this._error.set(null);

    // Mindig next + error ág (ld. admin-school.store.ts UI-TT-65).
    this.service
      .getOverview(groupId)
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (overview) => this._overview.set(overview),
        error: (err) => this._error.set(err.error?.errorMessage ?? 'A helyek betöltése sikertelen.'),
      });
  }

  releaseSeat(groupId: number, studentUserId: number): void {
    if (this._loading()) return;

    this._loading.set(true);
    this._error.set(null);
    this._lastReleaseResult.set(null);

    // Nincs finalize(): siker esetén a load() felel a loading kikapcsolásáért, így a
    // gomb a teljes művelet + újratöltés alatt letiltva marad.
    this.service
      .releaseSeat(groupId, studentUserId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.load(groupId),
        error: (err) => {
          this._error.set(err.error?.errorMessage ?? 'A hely felszabadítása sikertelen.');
          this._loading.set(false);
        },
      });
  }

  releaseAll(groupId: number): void {
    if (this._loading()) return;

    this._loading.set(true);
    this._error.set(null);
    this._lastReleaseResult.set(null);

    this.service
      .releaseAll(groupId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this._lastReleaseResult.set(result);
          this.load(groupId);
        },
        error: (err) => {
          this._error.set(err.error?.errorMessage ?? 'A helyek felszabadítása sikertelen.');
          this._loading.set(false);
        },
      });
  }
}
