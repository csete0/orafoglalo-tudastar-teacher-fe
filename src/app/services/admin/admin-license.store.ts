import { Injectable, signal, computed, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, take } from 'rxjs/operators';
import { AdminLicenseService } from './admin-license.service';
import {
  CreateInstitutionalLicenseRequest,
  InstitutionalLicenseDto,
  InstitutionalSeatHolderDto,
  UpdateInstitutionalLicenseRequest,
} from '../../models/institutional-license.model';

@Injectable({ providedIn: 'root' })
export class AdminLicenseStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(AdminLicenseService);

  private readonly _licenses = signal<InstitutionalLicenseDto[]>([]);
  private readonly _seats = signal<Record<number, InstitutionalSeatHolderDto[] | undefined>>({});
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly licenses = computed(() => this._licenses());
  readonly seats = computed(() => this._seats());
  readonly loading = computed(() => this._loading());
  readonly error = computed(() => this._error());

  /** Egy adott intézményhez tartozó licencek (az Intézmények oldal sorai alá). */
  licensesForSchool(schoolId: number): InstitutionalLicenseDto[] {
    return this._licenses().filter((l) => l.schoolId === schoolId);
  }

  clearError(): void {
    this._error.set(null);
  }

  load(): void {
    this._loading.set(true);
    this._error.set(null);

    // Mindig next + error ág: egy next-only subscribe esetén hiba után a store
    // némán üres listát mutatna, és egy kezeletlen HttpErrorResponse is landolna
    // (ld. az admin-school.store.ts UI-TT-65 megjegyzését).
    this.service
      .getLicenses()
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (licenses) => this._licenses.set(licenses),
        error: (err) => this._error.set(err.error?.errorMessage ?? 'A licencek betöltése sikertelen.'),
      });
  }

  create(request: CreateInstitutionalLicenseRequest): void {
    if (this._loading()) return;

    this._loading.set(true);
    this._error.set(null);

    // Nincs finalize(): siker esetén a load() felel a loading ki/be kapcsolásáért
    // (és a lista frissítéséért), így a gomb a teljes műveletsor alatt letiltva
    // marad. Hiba esetén viszont load() sosem fut le - ott itt kapcsoljuk ki.
    this.service
      .create(request)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.load(),
        error: (err) => {
          this._error.set(err.error?.errorMessage ?? 'A licenc létrehozása sikertelen.');
          this._loading.set(false);
        },
      });
  }

  update(id: number, request: UpdateInstitutionalLicenseRequest): void {
    if (this._loading()) return;

    this._loading.set(true);
    this._error.set(null);

    this.service
      .update(id, request)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.load(),
        error: (err) => {
          this._error.set(err.error?.errorMessage ?? 'A licenc módosítása sikertelen.');
          this._loading.set(false);
        },
      });
  }

  revoke(id: number): void {
    if (this._loading()) return;

    this._loading.set(true);
    this._error.set(null);

    this.service
      .revoke(id)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.load(),
        error: (err) => {
          this._error.set(err.error?.errorMessage ?? 'A licenc visszavonása sikertelen.');
          this._loading.set(false);
        },
      });
  }

  loadSeats(licenseId: number): void {
    this._error.set(null);

    this.service
      .getSeats(licenseId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (seats) => this._seats.update((current) => ({ ...current, [licenseId]: seats })),
        error: (err) => this._error.set(err.error?.errorMessage ?? 'A helyek betöltése sikertelen.'),
      });
  }

  releaseSeat(licenseId: number, userId: number): void {
    if (this._loading()) return;

    this._loading.set(true);
    this._error.set(null);

    this.service
      .releaseSeat(licenseId, userId)
      .pipe(
        take(1),
        finalize(() => this._loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          // A hely-lista ÉS a licenc-sor számai is változtak.
          this.loadSeats(licenseId);
          this.load();
        },
        error: (err) => this._error.set(err.error?.errorMessage ?? 'A hely felszabadítása sikertelen.'),
      });
  }
}
