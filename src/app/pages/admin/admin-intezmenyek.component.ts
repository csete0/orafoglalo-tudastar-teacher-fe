import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminSchoolStore } from '../../services/admin/admin-school.store';
import { AdminLicenseStore } from '../../services/admin/admin-license.store';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { SchoolAdminDto } from '../../models/teacher-moderation.model';
import {
  InstitutionalLicenseDto,
  InstitutionalLicenseUsageDayDto,
  InstitutionalLicenseUsageDto,
} from '../../models/institutional-license.model';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-admin-intezmenyek',
  standalone: true,
  imports: [DatePipe, FormsModule, IconComponent, LocalSpinnerComponent],
  template: `
    <div class="max-w-3xl mx-auto px-4 py-10">
      <h1 class="page-title">Intézmények (admin)</h1>
      <p class="text-sm text-text-muted mt-1">
        Intézmények áttekintése, duplikátumok egyesítése és licenc-keretek kezelése
      </p>
      <div class="hairline"></div>

      @if (store.lastMergeResult(); as result) {
        <div class="bg-success-subtle border border-success/40 rounded-xl p-4 mb-4 text-sm">
          <p class="text-success font-bold mb-1">Egyesítés sikeres.</p>
          <p class="text-text-muted">
            {{ result.movedGroups }} csoport, {{ result.movedMemberships }} tagság átkerült
            @if (result.mergedDuplicateMemberships > 0) {
              , {{ result.mergedDuplicateMemberships }} átfedő tagság összevonva
            }.
          </p>
        </div>
      }

      @if (store.error()) {
        <p class="text-danger text-sm mb-4">{{ store.error() }}</p>
      }

      <!-- UI-TT-201/UI-TT-206: ez a globális hely csak akkor mutatja a hibát, ha az NEM
           tartozik már megjelenítve valahova máshoz - vagyis nem a jelenleg nyitott
           szerkesztő form MENTÉSI hibája (az a szerkesztett licenc kártyája MELLETT jelenik
           meg, lásd lejjebb), és nem egy konkrét licenc visszavonási/felszabadítási hibája
           (az a MAGA licenc kártyáján jelenik meg, lásd lejjebb). licenseStore.error() egy
           EGYETLEN, megosztott signal minden licenc-műveletre (admin-license.store.ts) -
           errorSource/errorLicenseId mondja meg, MELYIK művelet/licenc okozta, hogy a
           hiba ne kerülhessen tévesen egy másik, épp nyitva hagyott szerkesztő form alá
           (UI-TT-206: egy B licenc visszavonási hibája korábban A licenc nyitott formája
           alatt jelent meg, ha A formja épp nyitva volt). -->
      @if (licenseStore.error() && !isLicenseErrorHandledInline()) {
        <p class="text-danger text-sm mb-4">{{ licenseStore.error() }}</p>
      }

      @if (store.loading()) {
        <app-local-spinner />
      }

      <div class="card p-5 mb-6">
        <h2 class="font-bold mb-3">Intézmények egyesítése</h2>
        <p class="text-sm text-text-muted mb-3">
          Két véletlenül duplikáltan létrejött intézmény egyesíthető: a forrás összes tanára és csoportja
          átkerül a célba, a forrás intézmény törlődik.
        </p>
        <div class="flex gap-3 items-end flex-wrap">
          <div>
            <label class="text-xs text-text-muted block mb-1">Forrás (törlődik)</label>
            <select [(ngModel)]="sourceId" name="sourceId" class="input !w-auto min-w-48">
              <option [ngValue]="null">Válassz…</option>
              @for (school of store.schools(); track school.id) {
                <option [ngValue]="school.id">{{ schoolLabel(school) }}</option>
              }
            </select>
          </div>
          <div>
            <label class="text-xs text-text-muted block mb-1">Cél (megmarad)</label>
            <select [(ngModel)]="targetId" name="targetId" class="input !w-auto min-w-48">
              <option [ngValue]="null">Válassz…</option>
              @for (school of store.schools(); track school.id) {
                <option [ngValue]="school.id">{{ schoolLabel(school) }}</option>
              }
            </select>
          </div>
          <button (click)="confirmMerge()" [disabled]="!canMerge() || store.loading()" class="btn btn-primary !px-3 !py-1.5">
            Egyesítés
          </button>
        </div>
      </div>

      <ul class="space-y-3">
        @for (school of store.schools(); track school.id) {
          <li class="card p-4 flex gap-3">
            <div class="icon-tile icon-tile-primary">
              <app-icon name="building" class="w-6 h-6 block" />
            </div>
            <div class="min-w-0">
              <p class="font-medium truncate">{{ school.name }}</p>
              @if (school.city) {
                <p class="text-sm text-text-muted truncate">{{ school.city }}</p>
              }
              @if (school.adminDisplayNames.length > 0) {
                <p class="text-sm text-text-muted break-words">Igazgató: {{ school.adminDisplayNames.join(', ') }}</p>
              }
              <p class="text-xs text-text-muted mt-1">
                {{ school.teacherCount }} tanár · {{ school.groupCount }} csoport ·
                létrehozva {{ school.createdAt | date: 'yyyy.MM.dd' }}
              </p>

              <!-- Licenc-keretek: az intézményhez tartoznak, ezért itt jelennek meg,
                   nem külön menüpontban (a fejléc-navigáció 6 linkre van méretezve,
                   ld. UI-TT-181/192/177). -->
              <div class="mt-3 pt-3 border-t border-border-default">
                @for (license of licenseStore.licensesForSchool(school.id); track license.id) {
                  <div class="text-xs mb-2">
                    <span class="font-semibold">{{ tierLabel(license.tier) }}</span>
                    ·
                    <span [class.text-danger]="license.usedSeats >= license.capacity">
                      {{ license.usedSeats }}/{{ license.capacity }} hely használatban
                    </span>
                    @if (license.heldSeats > license.usedSeats) {
                      <span class="text-text-muted">
                        ({{ license.heldSeats - license.usedSeats }} tétlen, átadható)
                      </span>
                    }
                    <br />
                    <span class="text-text-muted">
                      {{ license.validFrom | date: 'yyyy.MM.dd' }} –
                      {{ license.validTo | date: 'yyyy.MM.dd' }}
                      @if (!license.isActive) {
                        · <span class="text-danger">{{ license.revokedAt ? 'visszavonva' : 'nem aktív' }}</span>
                      }
                    </span>
                    @if (license.billingNote) {
                      <br />
                      <span class="text-text-muted">Számlázás: {{ license.billingNote }}</span>
                    }

                    <!-- UI-TT-206: a Visszavonás/Felszabadítás gombok NEM editingLicenseId-hez
                         kötöttek - BÁRMELYIK licenc kártyáján elérhetők, függetlenül attól, hogy
                         épp melyik licenc szerkesztő formja van nyitva. Ezért a hibájuk is ITT,
                         a saját licenc-kártyájuk alatt jelenik meg - nem a globális sávban (azt
                         elnyomnánk vele, ha épp más licenc formja nyitva van), és semmiképp sem
                         egy másik, épp nyitva hagyott licenc szerkesztő formja alatt. -->
                    @if (isCardLicenseError(license)) {
                      <p class="text-danger text-xs mt-1">{{ licenseStore.error() }}</p>
                    }

                    <div class="flex gap-2 mt-1 flex-wrap">
                      <button (click)="toggleSeats(license.id)" class="btn btn-ghost !px-2 !py-1 !text-xs">
                        {{ expandedLicenseId === license.id ? 'Helyek elrejtése' : 'Helyek megtekintése' }}
                      </button>
                      <button (click)="toggleUsage(license.id)" class="btn btn-ghost !px-2 !py-1 !text-xs">
                        {{ expandedUsageLicenseId === license.id ? 'Kimutatás elrejtése' : 'Kihasználtság' }}
                      </button>
                      @if (!license.revokedAt) {
                        <button
                          (click)="startEditLicense(license)"
                          [disabled]="licenseStore.loading()"
                          class="btn btn-ghost !px-2 !py-1 !text-xs"
                        >
                          Szerkesztés
                        </button>
                        <button
                          (click)="confirmRevoke(license)"
                          [disabled]="licenseStore.loading()"
                          class="btn btn-danger !px-2 !py-1 !text-xs"
                        >
                          Visszavonás
                        </button>
                      }
                    </div>

                    @if (editingLicenseId === license.id) {
                      <div class="mt-2 flex flex-wrap gap-2 items-end border-t border-border-default pt-2">
                        <!-- UI-TT-201: a mentés-hiba itt, a szerkesztett licenc mellett is
                             megjelenik - eddig kizárólag a komponens legtetején jelent meg, ahol
                             egy hosszabb intézmény-listán (élesben 7+ intézmény) a lista alján
                             szerkesztő admin görgetés nélkül nem is látta.
                             UI-TT-206: DE csak akkor, ha a hiba TÉNYLEGESEN ennek a formnak a
                             mentési kísérletéből származik (errorSource === 'edit' ÉS
                             errorLicenseId === ennek a licencnek az id-je) - különben egy másik
                             licencen végzett visszavonás/felszabadítás hibája tévesen ide,
                             egy érintetlen licenc nyitott formája alá kerülne. -->
                        @if (isEditFormLicenseError(license)) {
                          <p class="text-danger text-xs w-full mb-1">{{ licenseStore.error() }}</p>
                        }
                        <div>
                          <label class="text-xs text-text-muted block mb-1">Helyek</label>
                          <input type="number" min="0" [(ngModel)]="editCapacity"
                                 [attr.name]="'edit-cap-' + license.id" [ngModelOptions]="{ standalone: true }"
                                 class="input !w-20 !text-xs" />
                        </div>
                        <div>
                          <label class="text-xs text-text-muted block mb-1">Érvényes-tól</label>
                          <input type="date" [(ngModel)]="editValidFrom"
                                 [attr.name]="'edit-from-' + license.id" [ngModelOptions]="{ standalone: true }"
                                 class="input !w-auto !text-xs" />
                        </div>
                        <div>
                          <label class="text-xs text-text-muted block mb-1">Érvényes-ig</label>
                          <input type="date" [(ngModel)]="editValidTo"
                                 [attr.name]="'edit-to-' + license.id" [ngModelOptions]="{ standalone: true }"
                                 class="input !w-auto !text-xs" />
                        </div>
                        <div>
                          <label class="text-xs text-text-muted block mb-1">Tétlenségi ablak (perc)</label>
                          <input type="number" min="0" [(ngModel)]="editIdleWindowMinutes"
                                 [attr.name]="'edit-idle-' + license.id" [ngModelOptions]="{ standalone: true }"
                                 class="input !w-24 !text-xs" />
                        </div>
                        <div>
                          <label class="text-xs text-text-muted block mb-1">Számlázási megjegyzés</label>
                          <input type="text" [(ngModel)]="editBillingNote"
                                 [attr.name]="'edit-note-' + license.id" [ngModelOptions]="{ standalone: true }"
                                 placeholder="pl. fenntartó neve, számlaszám"
                                 class="input !w-56 !text-xs" />
                        </div>
                        <button (click)="saveLicenseEdit(license)" [disabled]="licenseStore.loading()"
                                class="btn btn-primary !px-3 !py-1 !text-xs">
                          Mentés
                        </button>
                        <button (click)="cancelEditLicense()" class="btn btn-ghost !px-3 !py-1 !text-xs">
                          Mégse
                        </button>
                      </div>
                    }

                    @if (expandedLicenseId === license.id) {
                      <ul class="mt-2 space-y-1">
                        @for (seat of licenseStore.seats()[license.id] ?? []; track seat.userId) {
                          <li class="flex items-center gap-2 flex-wrap">
                            <span class="text-text-muted">#{{ seat.seatIndex }}</span>
                            <span>{{ seat.displayName || seat.email }}</span>
                            <span [class]="seat.isFresh ? 'text-success' : 'text-text-muted'">
                              {{ seat.isFresh ? 'aktív' : 'tétlen' }}
                            </span>
                            <!-- A "Felszabadítás" gomb itt van mellette: az admin előre
                                 lássa, kinél nem fog végrehajtódni a művelet. -->
                            @if (seat.sessionInProgress) {
                              <span class="text-warning" title="Vizsga vagy kvíz van folyamatban - a helyét most nem lehet felszabadítani.">
                                &middot; vizsgázik/kvízt ír
                              </span>
                            }
                            <span class="text-text-muted">
                              utoljára: {{ seat.lastActivityAt | date: 'MM.dd HH:mm' }}
                            </span>
                            <button
                              (click)="confirmReleaseSeat(license, seat.userId, seat.displayName || seat.email)"
                              [disabled]="licenseStore.loading()"
                              class="btn btn-ghost !px-2 !py-0.5 !text-xs"
                            >
                              Felszabadítás
                            </button>
                          </li>
                        } @empty {
                          <li class="text-text-muted">Jelenleg senki nem használ helyet.</li>
                        }
                      </ul>
                    }

                    @if (expandedUsageLicenseId === license.id) {
                      @if (licenseStore.usage()[license.id]; as usage) {
                        <div class="mt-2 border-t border-border-default pt-2">
                          <p class="font-semibold mb-1">Kihasználtság — elmúlt {{ usage.rangeDays }} nap</p>

                          <!-- A bővítési döntés fő száma előre: hányan nem fértek be,
                               pedig jogosultak lettek volna. -->
                          <p [class]="usage.totalDenied > 0 ? 'text-danger font-bold' : 'text-text-muted'">
                            {{ usage.totalDenied }} alkalommal nem jutott hely olyan diáknak, aki jogosult lett volna
                          </p>
                          <p class="text-text-muted">
                            Csúcs: {{ usage.peakSeatsInUse }}/{{ usage.capacity }} hely ·
                            {{ usage.daysAtCapacity }} napon telt be ·
                            {{ usage.totalReclaimed }} átvétel tétlen diáktól
                          </p>

                          @if (usage.totalDenied > 0) {
                            <p class="mt-1">
                              Ez a keret szűk: érdemes megfontolni a bővítést.
                            </p>
                          }

                          @if (activeUsageDays(usage).length > 0) {
                            <ul class="mt-2 space-y-0.5">
                              @for (day of activeUsageDays(usage); track day.day) {
                                <li>
                                  <span class="text-text-muted">{{ day.day | date: 'MM.dd' }}</span>
                                  · csúcs {{ day.peakSeatsInUse }}/{{ usage.capacity }}
                                  @if (day.denied > 0) {
                                    · <span class="text-danger">{{ day.denied }} kiszorult</span>
                                  }
                                  @if (day.reclaimed > 0) {
                                    · {{ day.reclaimed }} átvétel
                                  }
                                </li>
                              }
                            </ul>
                          } @else {
                            <p class="text-text-muted mt-1">Ebben az időszakban nem volt használat.</p>
                          }
                        </div>
                      } @else {
                        <p class="text-text-muted mt-2">Kimutatás betöltése…</p>
                      }
                    }
                  </div>
                } @empty {
                  <p class="text-xs text-text-muted">Nincs licenc-keret ehhez az intézményhez.</p>
                }

                <button (click)="startNewLicense(school.id)" class="btn btn-ghost !px-2 !py-1 !text-xs mt-1">
                  + Új licenc
                </button>

                @if (newLicenseSchoolId === school.id) {
                  <div class="mt-2 flex flex-wrap gap-2 items-end">
                    <div>
                      <label class="text-xs text-text-muted block mb-1">Csomag</label>
                      <select [(ngModel)]="newTier" [attr.name]="'tier-' + school.id"
                              [ngModelOptions]="{ standalone: true }" class="input !w-auto !text-xs">
                        <option value="standard">Standard</option>
                        <option value="premium">Prémium</option>
                      </select>
                    </div>
                    <div>
                      <label class="text-xs text-text-muted block mb-1">Helyek</label>
                      <input type="number" min="0" [(ngModel)]="newCapacity"
                             [attr.name]="'cap-' + school.id" [ngModelOptions]="{ standalone: true }"
                             class="input !w-20 !text-xs" />
                    </div>
                    <div>
                      <label class="text-xs text-text-muted block mb-1">Érvényes-tól</label>
                      <input type="date" [(ngModel)]="newValidFrom"
                             [attr.name]="'from-' + school.id" [ngModelOptions]="{ standalone: true }"
                             class="input !w-auto !text-xs" />
                    </div>
                    <div>
                      <label class="text-xs text-text-muted block mb-1">Érvényes-ig</label>
                      <input type="date" [(ngModel)]="newValidTo"
                             [attr.name]="'to-' + school.id" [ngModelOptions]="{ standalone: true }"
                             class="input !w-auto !text-xs" />
                    </div>
                    <div>
                      <label class="text-xs text-text-muted block mb-1">Számlázási megjegyzés</label>
                      <input type="text" [(ngModel)]="newBillingNote"
                             [attr.name]="'note-' + school.id" [ngModelOptions]="{ standalone: true }"
                             placeholder="pl. fenntartó neve, számlaszám"
                             class="input !w-56 !text-xs" />
                    </div>
                    <button (click)="createLicense(school.id)" [disabled]="licenseStore.loading()"
                            class="btn btn-primary !px-3 !py-1 !text-xs">
                      Létrehozás
                    </button>
                    <button (click)="cancelNewLicense()" class="btn btn-ghost !px-3 !py-1 !text-xs">
                      Mégse
                    </button>
                  </div>
                }
              </div>
            </div>
          </li>
        } @empty {
          @if (!store.loading()) {
            <li class="flex flex-col items-center py-10 gap-3">
              <div class="icon-tile icon-tile-neutral">
                <app-icon name="building" class="w-6 h-6 block" />
              </div>
              <p class="font-semibold">Nincs még intézmény.</p>
            </li>
          }
        }
      </ul>
    </div>
  `,
})
export class AdminIntezmenyekComponent {
  readonly store = inject(AdminSchoolStore);
  readonly licenseStore = inject(AdminLicenseStore);
  private readonly confirmService = inject(ConfirmService);
  private readonly toastService = inject(ToastService);

  sourceId: number | null = null;
  targetId: number | null = null;

  expandedLicenseId: number | null = null;
  expandedUsageLicenseId: number | null = null;

  newLicenseSchoolId: number | null = null;
  newTier = 'premium';
  newCapacity = 30;
  newValidFrom = '';
  newValidTo = '';
  newBillingNote = '';

  editingLicenseId: number | null = null;
  editCapacity = 0;
  editValidFrom = '';
  editValidTo = '';
  editIdleWindowMinutes: number | null = null;
  editBillingNote = '';

  constructor() {
    this.store.load();
    this.licenseStore.load();
  }

  tierLabel(tier: string): string {
    return tier === 'premium' ? 'Prémium' : 'Standard';
  }

  // UI-TT-206: a globális hiba-sáv (a komponens tetején) csak akkor legyen elnyomva, ha a
  // hibát MÁR megjelenítjük valahol máshol - vagy a jelenleg nyitott szerkesztő form
  // MENTÉSI hibájaként (`isEditFormLicenseError`), vagy egy konkrét licenc-kártya
  // visszavonási/felszabadítási hibájaként (`isCardLicenseError`). Minden más esetben
  // (pl. `load()`/`create()`/`loadSeats()`/`loadUsage()` hiba) a globális sáv az EGYETLEN
  // hely, ahol a hiba látszana - azt nem szabad elnyomni, akkor sem, ha épp nyitva van egy
  // (a hibától teljesen független) szerkesztő form.
  isLicenseErrorHandledInline(): boolean {
    const source = this.licenseStore.errorSource();
    if (source === 'edit') {
      return this.licenseStore.errorLicenseId() === this.editingLicenseId;
    }
    return source === 'revoke' || source === 'releaseSeat';
  }

  // UI-TT-206: a Visszavonás/Felszabadítás hiba a MŰVELET CÉL-licencének kártyáján jelenik
  // meg - függetlenül attól, hogy épp melyik (akár egy MÁSIK) licenc szerkesztő formja van
  // nyitva. `errorLicenseId` a store-ban a mutáló hívás `id`/`licenseId` paraméterével kerül
  // beállításra, tehát pontosan azt a licencet azonosítja, amin a művelet történt.
  isCardLicenseError(license: InstitutionalLicenseDto): boolean {
    if (!this.licenseStore.error()) return false;
    const source = this.licenseStore.errorSource();
    return (source === 'revoke' || source === 'releaseSeat') && this.licenseStore.errorLicenseId() === license.id;
  }

  // UI-TT-206: a nyitott szerkesztő form alatti hiba KIZÁRÓLAG akkor jelenjen meg, ha a hiba
  // TÉNYLEGESEN ennek a licencnek a mentési kísérletéből (`update()`) származik - nem elég,
  // hogy `editingLicenseId === license.id` (ez csak azt jelenti, hogy ÉPP EZ a form van
  // nyitva, nem azt, hogy a jelenlegi hiba is ehhez tartozik).
  isEditFormLicenseError(license: InstitutionalLicenseDto): boolean {
    if (!this.licenseStore.error()) return false;
    return this.licenseStore.errorSource() === 'edit' && this.licenseStore.errorLicenseId() === license.id;
  }

  toggleUsage(licenseId: number): void {
    if (this.expandedUsageLicenseId === licenseId) {
      this.expandedUsageLicenseId = null;
      return;
    }
    this.expandedUsageLicenseId = licenseId;
    this.licenseStore.loadUsage(licenseId);
  }

  /**
   * Csak azokat a napokat listázzuk, ahol TÖRTÉNT valami - egy 30 elemű, csupa
   * nulla lista elrejtené a lényeget. Az összesítők (fent) így is a teljes
   * időszakra vonatkoznak.
   */
  activeUsageDays(usage: InstitutionalLicenseUsageDto): InstitutionalLicenseUsageDayDto[] {
    return usage.daily.filter((d) => d.peakSeatsInUse > 0 || d.denied > 0 || d.reclaimed > 0);
  }

  toggleSeats(licenseId: number): void {
    if (this.expandedLicenseId === licenseId) {
      this.expandedLicenseId = null;
      return;
    }
    this.expandedLicenseId = licenseId;
    this.licenseStore.loadSeats(licenseId);
  }

  startNewLicense(schoolId: number): void {
    this.newLicenseSchoolId = schoolId;
    this.licenseStore.clearError();

    // Ertelmes alapertelmezes: a mai naptol egy tanevnyi idore.
    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(nextYear.getFullYear() + 1);

    this.newValidFrom = this.toDateInput(today);
    this.newValidTo = this.toDateInput(nextYear);
    this.newTier = 'premium';
    this.newCapacity = 30;
    this.newBillingNote = '';
  }

  cancelNewLicense(): void {
    this.newLicenseSchoolId = null;
  }

  // UI-TT-208: a "+ Új licenc" form KIZÁRÓLAG a store `onSuccess` callback-jéből zár - a
  // korábbi, a HTTP-hívás után közvetlenül, szinkron `this.newLicenseSchoolId = null` a
  // válasz megérkezése ELŐTT lefutott, backend-elutasításnál a begépelt adatokat véglegesen
  // eldobva (ugyanaz a hibaosztály, mint a szerkesztő formon a `UI-TT-199` előtt).
  createLicense(schoolId: number): void {
    if (this.licenseStore.loading()) return;

    this.licenseStore.create(
      {
        schoolId,
        tier: this.newTier,
        capacity: this.newCapacity,
        validFrom: this.newValidFrom,
        validTo: this.newValidTo,
        billingNote: this.newBillingNote?.trim() || null,
      },
      () => {
        this.newLicenseSchoolId = null;
      },
    );
  }

  // UI-TT-198: a "+ Új licenc" form mellé a MEGLÉVŐ licenceket szerkesztő
  // inline form - a backend `UpdateAsync` (kapacitás/érvényesség/idle-window/
  // számlázási megjegyzés) rég kész és tesztelt volt, csak ez a komponens nem
  // hívta meg soha. A kizárólagos korábbi workaround (Visszavonás + Új licenc)
  // azonnal kirúgja a nem-vizsgázó diákokat és nullázza a kihasználtsági
  // előzményt egy vadonatúj licenc-id alatt - ezt váltja ki ez a form.
  startEditLicense(license: InstitutionalLicenseDto): void {
    this.editingLicenseId = license.id;
    this.licenseStore.clearError();

    this.editCapacity = license.capacity;
    this.editValidFrom = license.validFrom.slice(0, 10);
    this.editValidTo = license.validTo.slice(0, 10);
    this.editIdleWindowMinutes = license.idleWindowMinutes;
    this.editBillingNote = license.billingNote ?? '';
  }

  cancelEditLicense(): void {
    this.editingLicenseId = null;
  }

  // UI-TT-199: a form KIZÁRÓLAG a store sikeres callback-jéből zár - ugyanaz a minta, mint
  // az `admin-tanarok.component.ts` `saveQuota()`-ja. Korábban `editingLicenseId = null` itt,
  // feltétel nélkül futott, MIELŐTT a HTTP-válasz megérkezett volna - backend-elutasítás
  // (pl. felcserélt validFrom/validTo) esetén a form már bezárult, az admin begépelt
  // módosítása véglegesen elveszett. Hiba esetén (a store `error`-ágán) ez a callback sosem
  // fut le, a form nyitva marad a begépelt értékekkel, hogy az admin csak a hibás mezőt
  // javítsa.
  saveLicenseEdit(license: InstitutionalLicenseDto): void {
    if (this.licenseStore.loading()) return;

    this.licenseStore.update(
      license.id,
      {
        capacity: this.editCapacity,
        validFrom: this.editValidFrom,
        validTo: this.editValidTo,
        billingNote: this.editBillingNote?.trim() || null,
        idleWindowMinutes: this.editIdleWindowMinutes,
      },
      (updated) => {
        this.editingLicenseId = null;
        this.warnIfSeatsSkipped(updated.skippedDueToActiveSessionCount);
      },
    );
  }

  async confirmRevoke(license: InstitutionalLicenseDto): Promise<void> {
    if (this.licenseStore.loading()) return;

    const ok = await this.confirmService.ask({
      message:
        `Biztosan visszavonod a(z) ${this.tierLabel(license.tier)} licencet ` +
        `(${license.ownerName})? A jelenleg használt ${license.heldSeats} hely azonnal ` +
        'felszabadul, az érintett diákok visszaesnek a saját előfizetésükre.',
      danger: true,
      confirmLabel: 'Visszavonás',
    });
    if (!ok) return;

    // UI-TT-200: a fenti dialógus feltétel nélkül ígéri, hogy MINDEN hely felszabadul - ez
    // szándékosan nem igaz, ha egy diák épp vizsgázik/kvízt ír (a backend ilyenkor
    // SZÁNDÉKOSAN kihagyja a helyét). A callback-ből mutatott toast korrigálja ezt, ha a
    // valóság eltér az ígérettől.
    this.licenseStore.revoke(license.id, (result) => {
      this.warnIfSeatsSkipped(result.skippedDueToActiveSessionCount);
    });
  }

  private warnIfSeatsSkipped(skippedCount: number): void {
    if (skippedCount <= 0) return;

    this.toastService.warning(
      `${skippedCount} hely nem szabadult fel - a diák épp vizsgázik/kvízt ír, ` +
        'a hely csak a munkamenet végeztével válik felszabadíthatóvá.',
    );
  }

  async confirmReleaseSeat(license: InstitutionalLicenseDto, userId: number, label: string): Promise<void> {
    if (this.licenseStore.loading()) return;

    const ok = await this.confirmService.ask({
      message:
        `Felszabadítod ${label} helyét? A diák visszaesik a saját előfizetésére, ` +
        'a hely pedig azonnal kiosztható másnak.',
      danger: true,
      confirmLabel: 'Felszabadítás',
    });
    if (!ok) return;

    this.licenseStore.releaseSeat(license.id, userId);
  }

  // BE-INSTLICENSEADMIN-CREATEFORM-LOCALMIDNIGHT-UTCDATE: a `toISOString()` UTC-re
  // konvertál, ezért helyi éjfél után, UTC éjfél előtt a "mai nap" alapértelmezés a
  // TEGNAPI dátumot töltötte be - az admin észrevétlenül egy nappal korábbi
  // érvényességgel hozott létre licencet. A HELYI naptári napot kell kiírni.
  private toDateInput(date: Date): string {
    const ev = date.getFullYear();
    const ho = String(date.getMonth() + 1).padStart(2, '0');
    const nap = String(date.getDate()).padStart(2, '0');
    return `${ev}-${ho}-${nap}`;
  }

  canMerge(): boolean {
    return this.sourceId !== null && this.targetId !== null && this.sourceId !== this.targetId;
  }

  // UI-TT-195: az eszköz fő célközönsége pontosan az AZONOS NEVŰ, véletlenül
  // duplikáltan létrejött intézmény-párok - önmagában a név emiatt nem elég a
  // legördülőben/jóváhagyó dialógusban a két fizikai intézmény
  // megkülönböztetéséhez. A várost és az id-t is feltüntetjük.
  schoolLabel(school: SchoolAdminDto): string {
    const city = school.city ? `, ${school.city}` : '';
    return `${school.name}${city} (#${school.id})`;
  }

  async confirmMerge(): Promise<void> {
    if (!this.canMerge() || this.sourceId === null || this.targetId === null || this.store.loading()) return;

    const source = this.store.schools().find((s) => s.id === this.sourceId);
    const target = this.store.schools().find((s) => s.id === this.targetId);
    if (!source || !target) return;

    const sourceLabel = this.schoolLabel(source);
    const targetLabel = this.schoolLabel(target);
    const ok = await this.confirmService.ask({
      message:
        `Biztosan egyesíted a(z) „${sourceLabel}” intézményt a(z) „${targetLabel}” intézménybe? ` +
        `Minden tanára és csoportja átkerül, a(z) „${sourceLabel}” törlődik. Ez nem vonható vissza.`,
      danger: true,
      confirmLabel: 'Egyesítés',
    });
    if (!ok) return;

    // Siker-visszajelzés itt nem toast: a lastMergeResult panel részletes
    // összegzést ad (átkerült csoportok/tagságok száma).
    this.store.merge(this.sourceId, this.targetId);
    this.sourceId = null;
    this.targetId = null;
  }
}
