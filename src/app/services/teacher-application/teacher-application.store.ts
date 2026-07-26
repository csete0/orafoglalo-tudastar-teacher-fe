import { Injectable, signal, computed, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, take } from 'rxjs/operators';
import { TeacherApplicationService } from './teacher-application.service';
import { ApplyTeacherRequest, TeacherApplicationDto } from '../../models/teacher-application.model';

@Injectable({ providedIn: 'root' })
export class TeacherApplicationStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(TeacherApplicationService);

  private readonly _application = signal<TeacherApplicationDto | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _checked = signal(false);

  // JelentkezesComponent 5 másodpercenként pollozza loadMine()-t, amíg isPending() igaz -
  // egy korábbi, még folyamatban lévő hívás válasza (ha a round-trip lassabb, mint a 5mp-es
  // pollozási intervallum) korábban felülírhatta volna egy KÉSŐBBI, már megérkezett
  // "Approved"/"Rejected" állapotot vissza elavult "Pending"-re. Ugyanaz a generációs
  // számláló minta, mint az AdminApplicationStore.load()-nál - csak a LEGUTÓBB indított
  // hívás válasza érvényesül, függetlenül attól, melyik érkezik meg utoljára a hálózaton.
  private _loadGeneration = 0;

  readonly application = computed(() => this._application());
  readonly loading = computed(() => this._loading());
  readonly error = computed(() => this._error());
  /** Igaz, ha lefutott legalább egy getMine hívás (404 = nincs jelentkezés, de ez is "checked"). */
  readonly checked = computed(() => this._checked());
  readonly status = computed(() => this._application()?.status ?? null);
  readonly isPending = computed(() => this.status() === 'Pending');
  readonly isApproved = computed(() => this.status() === 'Approved');
  readonly isRejected = computed(() => this.status() === 'Rejected');

  loadMine(): void {
    const generation = ++this._loadGeneration;
    this._loading.set(true);
    this._error.set(null);

    this.service
      .getMine()
      .pipe(
        take(1),
        finalize(() => {
          // Egy elavult (időközben egy ÚJABB loadMine()-tól "lekörözött") hívás
          // finalize()-a ne zárja le a loading-ot/jelölje "checked"-nek, amíg a
          // ténylegesen legutóbbi hívás még folyamatban van.
          if (generation === this._loadGeneration) {
            this._loading.set(false);
            this._checked.set(true);
          }
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (application) => {
          // Elavult válasz - egy KÉSŐBBI loadMine() már felülírta a szándékot, eldobjuk.
          if (generation !== this._loadGeneration) return;
          this._application.set(application);
        },
        error: (err) => {
          if (generation !== this._loadGeneration) return;
          if (err.status === 404) {
            this._application.set(null);
          } else {
            this._error.set(err.error?.errorMessage ?? 'A jelentkezés állapotának lekérdezése sikertelen.');
          }
        },
      });
  }

  apply(request: ApplyTeacherRequest, onSuccess?: () => void): void {
    this._loading.set(true);
    this._error.set(null);

    this.service
      .apply(request)
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (application) => {
          this._application.set(application);
          this._checked.set(true);
          if (onSuccess) onSuccess();
        },
        error: (err) => {
          this._error.set(err.error?.errorMessage ?? 'A jelentkezés beadása sikertelen.');
        },
      });
  }

  clearError(): void {
    this._error.set(null);
  }
}
