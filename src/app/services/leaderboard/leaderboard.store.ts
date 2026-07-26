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

  // A csoport-/intézmény-részletek oldalak "kategória"/"időszak" <select>-jei
  // ngModelChange-re AZONNAL újratöltik a ranglistát - gyors, egymást követő
  // váltásnál (pl. "Heti" -> "Havi") mindkét hívás ténylegesen elindul, nincs
  // guard, ami blokkolná. Ugyanaz a hiba-osztály, mint az AdminApplicationStore
  // szűrő-váltása (UI-TT-124): ha a KORÁBBAN indított hívás válasza érkezik meg
  // KÉSŐBB, csendben felülírná a MÁR megérkezett, frissebb szándéknak megfelelő
  // adatot. Ugyanaz a generációs-számláló minta zárja ezt ki - csak a
  // LEGUTÓBB indított hívás válasza érvényesül.
  private _loadGeneration = 0;

  readonly leaderboard = computed(() => this._leaderboard());
  readonly loading = computed(() => this._loading());
  readonly error = computed(() => this._error());

  loadGroupLeaderboard(groupId: number, category: LeaderboardCategory, period: LeaderboardPeriod): void {
    const generation = ++this._loadGeneration;
    this._loading.set(true);
    this._error.set(null);
    this._leaderboard.set(null);

    this.service
      .getGroupLeaderboard(groupId, category, period)
      .pipe(
        take(1),
        finalize(() => {
          if (generation === this._loadGeneration) this._loading.set(false);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => {
          if (generation !== this._loadGeneration) return;
          this._leaderboard.set(result);
        },
        error: (err) => {
          if (generation !== this._loadGeneration) return;
          this._error.set(err.error?.errorMessage ?? 'A ranglista betöltése sikertelen.');
        },
      });
  }

  loadSchoolLeaderboard(schoolId: number, category: LeaderboardCategory, period: LeaderboardPeriod): void {
    const generation = ++this._loadGeneration;
    this._loading.set(true);
    this._error.set(null);
    this._leaderboard.set(null);

    this.service
      .getSchoolLeaderboard(schoolId, category, period)
      .pipe(
        take(1),
        finalize(() => {
          if (generation === this._loadGeneration) this._loading.set(false);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (result) => {
          if (generation !== this._loadGeneration) return;
          this._leaderboard.set(result);
        },
        error: (err) => {
          if (generation !== this._loadGeneration) return;
          this._error.set(err.error?.errorMessage ?? 'A ranglista betöltése sikertelen.');
        },
      });
  }

  clearError(): void {
    this._error.set(null);
  }
}
