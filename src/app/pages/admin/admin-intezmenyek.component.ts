import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminSchoolStore } from '../../services/admin/admin-school.store';
import { AdminLicenseStore } from '../../services/admin/admin-license.store';
import { ConfirmService } from '../../shared/confirm/confirm.service';
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

      @if (licenseStore.error()) {
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

                    <div class="flex gap-2 mt-1 flex-wrap">
                      <button (click)="toggleSeats(license.id)" class="btn btn-ghost !px-2 !py-1 !text-xs">
                        {{ expandedLicenseId === license.id ? 'Helyek elrejtése' : 'Helyek megtekintése' }}
                      </button>
                      <button (click)="toggleUsage(license.id)" class="btn btn-ghost !px-2 !py-1 !text-xs">
                        {{ expandedUsageLicenseId === license.id ? 'Kimutatás elrejtése' : 'Kihasználtság' }}
                      </button>
                      @if (!license.revokedAt) {
                        <button
                          (click)="confirmRevoke(license)"
                          [disabled]="licenseStore.loading()"
                          class="btn btn-danger !px-2 !py-1 !text-xs"
                        >
                          Visszavonás
                        </button>
                      }
                    </div>

                    @if (expandedLicenseId === license.id) {
                      <ul class="mt-2 space-y-1">
                        @for (seat of licenseStore.seats()[license.id] ?? []; track seat.userId) {
                          <li class="flex items-center gap-2 flex-wrap">
                            <span class="text-text-muted">#{{ seat.seatIndex }}</span>
                            <span>{{ seat.displayName || seat.email }}</span>
                            <span [class]="seat.isFresh ? 'text-success' : 'text-text-muted'">
                              {{ seat.isFresh ? 'aktív' : 'tétlen' }}
                            </span>
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

  constructor() {
    this.store.load();
    this.licenseStore.load();
  }

  tierLabel(tier: string): string {
    return tier === 'premium' ? 'Prémium' : 'Standard';
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

  createLicense(schoolId: number): void {
    if (this.licenseStore.loading()) return;

    this.licenseStore.create({
      schoolId,
      tier: this.newTier,
      capacity: this.newCapacity,
      validFrom: this.newValidFrom,
      validTo: this.newValidTo,
      billingNote: this.newBillingNote?.trim() || null,
    });

    this.newLicenseSchoolId = null;
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

    this.licenseStore.revoke(license.id);
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
