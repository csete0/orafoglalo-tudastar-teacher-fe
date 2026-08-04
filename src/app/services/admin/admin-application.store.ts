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
  // UI-TT-137: approve()/reject() korábban egyetlen KÖZÖS `_loading` jelzőt osztottak
  // (amit maga a `load()` is írt) - ha az admin egy jelentkezés jóváhagyását indította, egy
  // MÁSIK, teljesen független jelentkezés elutasítása (vagy akár egy háttér-`load()`)
  // csendben elakadt a guardon. Műveletenkénti+entitásonkénti kulcs, a UserStore/
  // AdminTeacherStore-nál már bevált mintát követve - a `load()` saját generációs
  // számlálós logikája (ld. UI-TT-124) VÁLTOZATLAN marad, csak a publikus `loading()`
  // jelzőbe regisztrálja magát, hogy az ő ideje alatt is `true` maradjon.
  private readonly _inFlight = signal<ReadonlySet<string>>(new Set<string>());
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
  readonly loading = computed(() => this._inFlight().size > 0);
  readonly error = computed(() => this._error());
  readonly statusFilter = computed(() => this._statusFilter());

  setStatusFilter(status: 'pending' | 'approved' | 'rejected' | 'all'): void {
    this._statusFilter.set(status);
    this.load();
  }

  load(): void {
    const generation = ++this._loadGeneration;
    const key = `load:${generation}`;
    this._inFlight.update((prev) => new Set(prev).add(key));
    this._error.set(null);
    this._applications.set([]);

    this.service
      .getApplications(this._statusFilter())
      .pipe(
        take(1),
        finalize(() => {
          this._inFlight.update((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
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
    const key = `approve:${id}`;
    if (this._isInFlight(key)) return;
    this._begin(key);

    this.service
      .approve(id)
      .pipe(
        take(1),
        finalize(() => this._end(key)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this._applications.update((list) => list.filter((a) => a.id !== id));
          // UI-TT-167: `_error` a UI-TT-137 fix után is EGYETLEN, minden jelentkezés
          // között MEGOSZTOTT signal maradt (csak `_inFlight` lett entitásonkénti) - egy
          // sikeresen lezáruló, FÜGGETLEN jelentkezés-döntés törli a régi, MÁSIK
          // jelentkezéstől származó hibaüzenetet is, hogy ne maradjon látható utána.
          this._error.set(null);
          if (onSuccess) onSuccess();
        },
        error: (err) => this._error.set(err.error?.errorMessage ?? 'A jóváhagyás sikertelen.'),
      });
  }

  reject(id: number, request: RejectTeacherApplicationRequest, onSuccess?: () => void): void {
    const key = `reject:${id}`;
    if (this._isInFlight(key)) return;
    this._begin(key);

    this.service
      .reject(id, request)
      .pipe(
        take(1),
        finalize(() => this._end(key)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this._applications.update((list) => list.filter((a) => a.id !== id));
          // UI-TT-167, ld. approve() fenti megjegyzését.
          this._error.set(null);
          if (onSuccess) onSuccess();
        },
        error: (err) => this._error.set(err.error?.errorMessage ?? 'Az elutasítás sikertelen.'),
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
