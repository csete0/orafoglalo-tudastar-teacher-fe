import { Injectable, signal, computed, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize, take } from 'rxjs/operators';
import { AdminLicenseService } from './admin-license.service';
import {
  CreateInstitutionalLicenseRequest,
  InstitutionalLicenseDto,
  InstitutionalLicenseRevokeResultDto,
  InstitutionalLicenseUsageDto,
  InstitutionalSeatHolderDto,
  UpdateInstitutionalLicenseRequest,
} from '../../models/institutional-license.model';

@Injectable({ providedIn: 'root' })
export class AdminLicenseStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(AdminLicenseService);

  private readonly _licenses = signal<InstitutionalLicenseDto[]>([]);
  private readonly _seats = signal<Record<number, InstitutionalSeatHolderDto[] | undefined>>({});
  private readonly _usage = signal<Record<number, InstitutionalLicenseUsageDto | undefined>>({});
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly licenses = computed(() => this._licenses());
  readonly seats = computed(() => this._seats());
  readonly usage = computed(() => this._usage());
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

  // UI-TT-199: `onSuccess` a testvér `AdminTeacherStore.setQuota()` mintáját követi - a
  // hívó (`admin-intezmenyek.component.ts` `saveLicenseEdit()`) a szerkesztő formot
  // KIZÁRÓLAG ebből zárja. Hiba esetén (pl. `ValidateRange`/`ValidateIdleWindow`) az
  // `onSuccess` sosem fut le, a form nyitva marad az admin begépelt értékeivel - a korábbi
  // "azonnal, feltétel nélkül zár" viselkedés véglegesen eldobta a be nem küldött módosítást.
  // A frissített DTO-t is átadjuk (mint a `GroupStore.create()`/`SchoolStore.create()`-nál),
  // hogy a hívó a `skippedDueToActiveSessionCount`-ot (UI-TT-200) is felolvashassa.
  update(
    id: number,
    request: UpdateInstitutionalLicenseRequest,
    onSuccess?: (license: InstitutionalLicenseDto) => void,
  ): void {
    if (this._loading()) return;

    this._loading.set(true);
    this._error.set(null);

    this.service
      .update(id, request)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (license) => {
          // BE/UI: a licenc-lista frissítése önmagában nem elég. Ha az admin épp NYITVA
          // tartja ennek a licencnek a hely-listáját, az a gyorsítótárból tovább mutatná a
          // már felszabadított/érvénytelenné vált helyeket - a felület és a valóság
          // szétcsúszna. A mutáció után az érintett licenc cache-elt hely-listáját eldobjuk.
          // A cache-t nem elég eldobni (akkor a panel "nincs adat" állapotba esne),
          // hanem ÚJRA KELL TÖLTENI - a lista nyitva marad, csak már a friss állapotot
          // mutatja. Csak akkor, ha ennek a licencnek a helyeit egyáltalán megnyitották.
          if (this._seats()[id] !== undefined) {
            this.loadSeats(id);
          }
          this.load();
          if (onSuccess) onSuccess(license);
        },
        error: (err) => {
          this._error.set(err.error?.errorMessage ?? 'A licenc módosítása sikertelen.');
          this._loading.set(false);
        },
      });
  }

  // UI-TT-200: az `onSuccess`-nek átadott `InstitutionalLicenseRevokeResultDto` hordozza a
  // `skippedDueToActiveSessionCount`-ot - a hívó (`confirmRevoke()`) ebből tud toast-ot
  // mutatni, ha a visszavonás NEM szabadított fel minden helyet (aktív vizsga/kvíz miatt).
  revoke(id: number, onSuccess?: (result: InstitutionalLicenseRevokeResultDto) => void): void {
    if (this._loading()) return;

    this._loading.set(true);
    this._error.set(null);

    this.service
      .revoke(id)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          // BE/UI: a licenc-lista frissítése önmagában nem elég. Ha az admin épp NYITVA
          // tartja ennek a licencnek a hely-listáját, az a gyorsítótárból tovább mutatná a
          // már felszabadított/érvénytelenné vált helyeket - a felület és a valóság
          // szétcsúszna. A mutáció után az érintett licenc cache-elt hely-listáját eldobjuk.
          // A cache-t nem elég eldobni (akkor a panel "nincs adat" állapotba esne),
          // hanem ÚJRA KELL TÖLTENI - a lista nyitva marad, csak már a friss állapotot
          // mutatja. Csak akkor, ha ennek a licencnek a helyeit egyáltalán megnyitották.
          if (this._seats()[id] !== undefined) {
            this.loadSeats(id);
          }
          this.load();
          if (onSuccess) onSuccess(result);
        },
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

  loadUsage(licenseId: number): void {
    this._error.set(null);

    this.service
      .getUsage(licenseId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (usage) => this._usage.update((current) => ({ ...current, [licenseId]: usage })),
        error: (err) => this._error.set(err.error?.errorMessage ?? 'A kimutatás betöltése sikertelen.'),
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
