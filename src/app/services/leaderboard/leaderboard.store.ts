import { Injectable, signal, computed, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, take } from 'rxjs/operators';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardCategory, LeaderboardPeriod, LeaderboardResponseDto } from '../../models/leaderboard.model';

@Injectable({ providedIn: 'root' })
export class LeaderboardStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(LeaderboardService);

  private readonly _leaderboard = signal<LeaderboardResponseDto | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly leaderboard = computed(() => this._leaderboard());
  readonly loading = computed(() => this._loading());
  readonly error = computed(() => this._error());

  loadGroupLeaderboard(groupId: number, category: LeaderboardCategory, period: LeaderboardPeriod): void {
    this._loading.set(true);
    this._error.set(null);
    this._leaderboard.set(null);

    this.service
      .getGroupLeaderboard(groupId, category, period)
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => this._leaderboard.set(result),
        error: (err) => this._error.set(err.error?.errorMessage ?? 'A ranglista betöltése sikertelen.'),
      });
  }

  loadSchoolLeaderboard(schoolId: number, category: LeaderboardCategory, period: LeaderboardPeriod): void {
    this._loading.set(true);
    this._error.set(null);
    this._leaderboard.set(null);

    this.service
      .getSchoolLeaderboard(schoolId, category, period)
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => this._leaderboard.set(result),
        error: (err) => this._error.set(err.error?.errorMessage ?? 'A ranglista betöltése sikertelen.'),
      });
  }

  clearError(): void {
    this._error.set(null);
  }
}
