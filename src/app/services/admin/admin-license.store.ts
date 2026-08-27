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

// UI-TT-206: `error` egyetlen, megosztott signal MINDEN licenc-műveletre
// (create/update/revoke/releaseSeat/load/loadSeats/loadUsage). A hívónak (a komponensnek)
// tudnia kell, MELYIK művelet és MELYIK licenc okozta az aktuális hibát, hogy a helyes
// helyre tudja irányítani a megjelenítést - ne a szerkesztett licenc kártyája alá kerüljön
// egy másik licenc visszavonási hibája.
export type LicenseErrorSource =
  | 'load'
  | 'create'
  | 'edit'
  | 'revoke'
  | 'releaseSeat'
  | 'loadSeats'
  | 'loadUsage';

@Injectable({ providedIn: 'root' })
export class AdminLicenseStore {
  private readonly destroyRef = inject(DestroyRef);
  private readonly service = inject(AdminLicenseService);

  private readonly _licenses = signal<InstitutionalLicenseDto[]>([]);
  private readonly _seats = signal<Record<number, InstitutionalSeatHolderDto[] | undefined>>({});
  private readonly _usage = signal<Record<number, InstitutionalLicenseUsageDto | undefined>>({});
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  // UI-TT-206: melyik művelet (és - ha értelmezhető - melyik konkrét licenc) állította be
  // a jelenlegi `_error`-t. `errorLicenseId` `null`, ha a hiba nem egy MEGLÉVŐ licenchez
  // kötött (pl. `load()` a teljes listáért, vagy `create()`, aminek még nincs id-je).
  private readonly _errorSource = signal<LicenseErrorSource | null>(null);
  private readonly _errorLicenseId = signal<number | null>(null);

  readonly licenses = computed(() => this._licenses());
  readonly seats = computed(() => this._seats());
  readonly usage = computed(() => this._usage());
  readonly loading = computed(() => this._loading());
  readonly error = computed(() => this._error());
  readonly errorSource = computed(() => this._errorSource());
  readonly errorLicenseId = computed(() => this._errorLicenseId());

  /** Egy adott intézményhez tartozó licencek (az Intézmények oldal sorai alá). */
  licensesForSchool(schoolId: number): InstitutionalLicenseDto[] {
    return this._licenses().filter((l) => l.schoolId === schoolId);
  }

  clearError(): void {
    this._error.set(null);
    this._errorSource.set(null);
    this._errorLicenseId.set(null);
  }

  private setError(message: string, source: LicenseErrorSource, licenseId: number | null = null): void {
    this._error.set(message);
    this._errorSource.set(source);
    this._errorLicenseId.set(licenseId);
  }

  load(): void {
    this._loading.set(true);
    this.clearError();

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
        error: (err) => this.setError(err.error?.errorMessage ?? 'A licencek betöltése sikertelen.', 'load'),
      });
  }

  // UI-TT-208: `onSuccess` a testvér `update()`/`UI-TT-199` mintáját követi - a hívó
  // (`admin-intezmenyek.component.ts` `createLicense()`) a "+ Új licenc" formot KIZÁRÓLAG
  // ebből zárja. Korábban a form szinkron, feltétel nélkül zárt közvetlenül a `create()`
  // hívása UTÁN - jóval a HTTP-válasz előtt -, így backend-elutasításnál (pl. felcserélt
  // validFrom/validTo, érvénytelen kapacitás) a begépelt adatok véglegesen elvesztek.
  create(request: CreateInstitutionalLicenseRequest, onSuccess?: (license: InstitutionalLicenseDto) => void): void {
    if (this._loading()) return;

    this._loading.set(true);
    this.clearError();

    // Nincs finalize(): siker esetén a load() felel a loading ki/be kapcsolásáért
    // (és a lista frissítéséért), így a gomb a teljes műveletsor alatt letiltva
    // marad. Hiba esetén viszont load() sosem fut le - ott itt kapcsoljuk ki.
    this.service
      .create(request)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (license) => {
          this.load();
          if (onSuccess) onSuccess(license);
        },
        error: (err) => {
          this.setError(err.error?.errorMessage ?? 'A licenc létrehozása sikertelen.', 'create');
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
    this.clearError();

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
          this.setError(err.error?.errorMessage ?? 'A licenc módosítása sikertelen.', 'edit', id);
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
    this.clearError();

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
          this.setError(err.error?.errorMessage ?? 'A licenc visszavonása sikertelen.', 'revoke', id);
          this._loading.set(false);
        },
      });
  }

  loadSeats(licenseId: number): void {
    // UI-TT-207: ez a metódus BÁRMELYIK licenc kártyájáról indítható ("Helyek
    // megtekintése"), az `editingLicenseId`/`errorLicenseId`-től függetlenül. A korábbi
    // feltétel nélküli `clearError()` egy MÁSIK, még megoldatlan licenc-hiba üzenetét
    // (pl. B licenc sikertelen visszavonása) némán eltüntette, amint az admin C licencen
    // rákattintott erre az ártalmatlan, csak-olvasó gombra - csak akkor töröljük a hibát,
    // ha az ÉPPEN ERRE a licencre vonatkozik (pl. egy korábbi, ugyanerre a licencre eső
    // loadSeats-hiba utáni újrapróbálkozás).
    if (this._errorLicenseId() === licenseId) {
      this.clearError();
    }

    this.service
      .getSeats(licenseId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (seats) => this._seats.update((current) => ({ ...current, [licenseId]: seats })),
        error: (err) =>
          this.setError(err.error?.errorMessage ?? 'A helyek betöltése sikertelen.', 'loadSeats', licenseId),
      });
  }

  loadUsage(licenseId: number): void {
    // UI-TT-207: ld. loadSeats() ugyanezen megjegyzését - csak a SAJÁT, korábbi hibáját
    // töröljük, egy másik licenc még megoldatlan hibáját nem érinthetjük.
    if (this._errorLicenseId() === licenseId) {
      this.clearError();
    }

    this.service
      .getUsage(licenseId)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (usage) => this._usage.update((current) => ({ ...current, [licenseId]: usage })),
        error: (err) =>
          this.setError(err.error?.errorMessage ?? 'A kimutatás betöltése sikertelen.', 'loadUsage', licenseId),
      });
  }

  releaseSeat(licenseId: number, userId: number): void {
    if (this._loading()) return;

    this._loading.set(true);
    this.clearError();

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
        error: (err) =>
          this.setError(err.error?.errorMessage ?? 'A hely felszabadítása sikertelen.', 'releaseSeat', licenseId),
      });
  }
}
