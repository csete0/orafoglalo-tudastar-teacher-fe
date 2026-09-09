import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminCouponService } from '../../services/admin/admin-coupon.service';
import { CouponAdminDto, CouponCreateRequest, SubscriptionTypeOption } from '../../models/coupon.model';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { ToastService } from '../../shared/toast/toast.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';

function extractErrorMessage(err: any, fallback: string): string {
  const body = err?.error;
  if (typeof body?.errorMessage === 'string' && body.errorMessage.trim()) {
    return body.errorMessage;
  }
  return fallback;
}

/**
 * B3: kuponkódok kezelése (platform-admin). A kedvezmény két formája - százalék VAGY fix
 * Ft - közül pontosan az egyiket kell megadni; a többi (érvényesség, limit, csomag) opcionális.
 * A validáció a szerveren fut (CouponService.CreateAsync), a hibaüzenetet változtatás nélkül
 * mutatjuk. Törlés nincs: a beváltott kuponhoz Payment-sor tartozik, ezért csak inaktiválás.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-admin-kuponok',
  standalone: true,
  imports: [DatePipe, FormsModule, LocalSpinnerComponent],
  template: `
    <div class="max-w-3xl mx-auto px-4 py-10">
      <h1 class="page-title">Kuponok</h1>
      <p class="text-sm text-text-muted mt-1">
        Kedvezménykódok az előfizetés-vásárláshoz. A diák a fizetési oldalon váltja be;
        a 100%-os kupon bankkártya nélkül aktivál.
      </p>
      <div class="hairline"></div>

      <form (ngSubmit)="create()" class="card p-5 mb-6" novalidate>
        <h2 class="font-bold mb-3">Új kupon</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="sm:col-span-2">
            <label class="text-xs text-text-muted block mb-1" for="code">Kód</label>
            <input id="code" name="code" [(ngModel)]="form.code" class="input font-mono uppercase"
              maxlength="32" placeholder="pl. ISKOLA2026" autocomplete="off" required />
            <p class="text-xs text-text-muted mt-1">Csak betű és szám, max. 32 karakter - a rendszer nagybetűsíti.</p>
          </div>

          <div>
            <label class="text-xs text-text-muted block mb-1">Kedvezmény típusa</label>
            <div class="flex gap-2 text-sm">
              <button type="button" (click)="setKind('percent')"
                class="px-3 py-1.5 rounded-lg border font-semibold transition-colors"
                [class.bg-primary]="kind() === 'percent'" [class.text-white]="kind() === 'percent'"
                [class.border-primary]="kind() === 'percent'"
                [class.border-border-default]="kind() !== 'percent'" [class.text-text-muted]="kind() !== 'percent'">
                Százalék
              </button>
              <button type="button" (click)="setKind('amount')"
                class="px-3 py-1.5 rounded-lg border font-semibold transition-colors"
                [class.bg-primary]="kind() === 'amount'" [class.text-white]="kind() === 'amount'"
                [class.border-primary]="kind() === 'amount'"
                [class.border-border-default]="kind() !== 'amount'" [class.text-text-muted]="kind() !== 'amount'">
                Fix összeg (Ft)
              </button>
            </div>
          </div>
          <div>
            @if (kind() === 'percent') {
              <label class="text-xs text-text-muted block mb-1" for="percentOff">Kedvezmény (%)</label>
              <input id="percentOff" name="percentOff" type="number" min="1" max="100" [(ngModel)]="form.percentOff"
                class="input" placeholder="1–100" />
            } @else {
              <label class="text-xs text-text-muted block mb-1" for="amountOffHuf">Kedvezmény (Ft)</label>
              <input id="amountOffHuf" name="amountOffHuf" type="number" min="1" [(ngModel)]="form.amountOffHuf"
                class="input" placeholder="pl. 1000" />
            }
          </div>

          <div>
            <label class="text-xs text-text-muted block mb-1" for="validFrom">Érvényes ettől</label>
            <input id="validFrom" name="validFrom" type="date" [(ngModel)]="form.validFrom" class="input" />
            <p class="text-xs text-text-muted mt-1">Üresen: azonnal.</p>
          </div>
          <div>
            <label class="text-xs text-text-muted block mb-1" for="validTo">Érvényes eddig</label>
            <input id="validTo" name="validTo" type="date" [(ngModel)]="form.validTo" class="input" />
            <p class="text-xs text-text-muted mt-1">Üresen: nincs lejárat.</p>
          </div>

          <div>
            <label class="text-xs text-text-muted block mb-1" for="maxRedemptions">Beváltási limit</label>
            <input id="maxRedemptions" name="maxRedemptions" type="number" min="1" [(ngModel)]="form.maxRedemptions"
              class="input" placeholder="Üresen: korlátlan" />
          </div>
          <div>
            <label class="text-xs text-text-muted block mb-1" for="subscriptionTypeId">Csomag</label>
            <select id="subscriptionTypeId" name="subscriptionTypeId" [(ngModel)]="form.subscriptionTypeId" class="input">
              <option [ngValue]="null">Bármelyik fizetős csomag</option>
              @for (type of subscriptionTypes(); track type.id) {
                <option [ngValue]="type.id">{{ typeLabel(type) }}</option>
              }
            </select>
          </div>

          <div class="sm:col-span-2">
            <label class="text-xs text-text-muted block mb-1" for="note">Megjegyzés (belső)</label>
            <input id="note" name="note" [(ngModel)]="form.note" class="input" maxlength="200"
              placeholder="pl. Teszt Gimnázium szülői est 2026 ősz" />
          </div>
        </div>

        @if (formError()) {
          <p class="text-danger text-sm mt-3" role="alert">{{ formError() }}</p>
        }

        <div class="flex justify-end mt-4">
          <button type="submit" [disabled]="pending() || !canSubmit()" class="btn btn-primary !px-4 !py-2">
            Kupon létrehozása
          </button>
        </div>
      </form>

      <div class="flex gap-2 mb-4 text-sm flex-wrap">
        @for (option of filterOptions; track option.value) {
          <button (click)="onlyActive.set(option.value)"
            class="px-3 py-1.5 rounded-lg border font-semibold transition-colors"
            [class.bg-primary]="onlyActive() === option.value"
            [class.text-white]="onlyActive() === option.value"
            [class.border-primary]="onlyActive() === option.value"
            [class.border-border-default]="onlyActive() !== option.value"
            [class.text-text-muted]="onlyActive() !== option.value">
            {{ option.label }}
          </button>
        }
      </div>

      @if (error()) {
        <p class="text-danger text-sm mb-4">{{ error() }}</p>
      }
      @if (loading()) {
        <app-local-spinner />
      }

      @if (!loading()) {
        <ul class="space-y-3">
          @for (coupon of visibleCoupons(); track coupon.id) {
            <li class="card p-4">
              <div class="flex justify-between items-start gap-3">
                <div class="min-w-0">
                  <p class="font-mono font-bold text-sm">
                    {{ coupon.code }}
                    @if (!coupon.isActive) {
                      <span class="badge badge-neutral text-xs ml-1">inaktív</span>
                    } @else if (isExhausted(coupon)) {
                      <span class="badge badge-warning text-xs ml-1">elfogyott</span>
                    } @else if (isExpired(coupon)) {
                      <span class="badge badge-warning text-xs ml-1">lejárt</span>
                    } @else {
                      <span class="badge badge-success text-xs ml-1">aktív</span>
                    }
                  </p>
                  <p class="text-xs text-text-muted mt-0.5">
                    {{ discountLabel(coupon) }} ·
                    {{ coupon.subscriptionTypeName || 'bármelyik fizetős csomag' }} ·
                    beváltva: {{ coupon.redemptionCount }}@if (coupon.maxRedemptions !== null) { / {{ coupon.maxRedemptions }}}
                  </p>
                  <p class="text-xs text-text-muted mt-0.5">
                    {{ coupon.validFrom | date: 'yyyy.MM.dd' }} –
                    {{ coupon.validTo ? (coupon.validTo | date: 'yyyy.MM.dd') : 'nincs lejárat' }}
                    @if (coupon.note) { · <span class="italic">{{ coupon.note }}</span> }
                  </p>
                </div>
                @if (coupon.isActive) {
                  <button (click)="deactivate(coupon)" [disabled]="pending()"
                    class="btn btn-ghost !px-3 !py-1.5 !text-xs shrink-0">
                    Inaktiválás
                  </button>
                }
              </div>
            </li>
          } @empty {
            <li class="text-text-muted text-sm py-6 text-center">
              {{ onlyActive() ? 'Nincs aktív kupon.' : 'Még nincs egyetlen kupon sem.' }}
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class AdminKuponokComponent implements OnInit {
  private readonly svc = inject(AdminCouponService);
  private readonly toast = inject(ToastService);
  private readonly confirmService = inject(ConfirmService);

  readonly coupons = signal<CouponAdminDto[]>([]);
  readonly subscriptionTypes = signal<SubscriptionTypeOption[]>([]);
  readonly loading = signal(false);
  readonly pending = signal(false);
  readonly error = signal<string | null>(null);
  readonly formError = signal<string | null>(null);
  readonly onlyActive = signal(true);
  readonly kind = signal<'percent' | 'amount'>('percent');

  readonly filterOptions = [
    { value: true, label: 'Csak aktívak' },
    { value: false, label: 'Összes' },
  ];

  readonly visibleCoupons = computed(() =>
    this.onlyActive() ? this.coupons().filter((c) => c.isActive) : this.coupons(),
  );

  form = this.emptyForm();

  ngOnInit(): void {
    this.load();
    this.svc.subscriptionTypes().subscribe({
      // A `free` csomagra kupon nem adható (a szerver is elutasítja) - a listából kihagyjuk.
      next: (types) => this.subscriptionTypes.set(types.filter((t) => t.price > 0)),
      error: () => this.subscriptionTypes.set([]),
    });
  }

  setKind(kind: 'percent' | 'amount'): void {
    this.kind.set(kind);
    if (kind === 'percent') this.form.amountOffHuf = null;
    else this.form.percentOff = null;
  }

  canSubmit(): boolean {
    const hasDiscount = this.kind() === 'percent' ? !!this.form.percentOff : !!this.form.amountOffHuf;
    return !!this.form.code.trim() && hasDiscount;
  }

  typeLabel(type: SubscriptionTypeOption): string {
    const cycle = type.billingCycle === 'yearly' ? 'éves' : type.billingCycle === 'monthly' ? 'havi' : type.billingCycle;
    return `${type.name} (${cycle}, ${type.price.toLocaleString('hu-HU')} Ft)`;
  }

  discountLabel(coupon: CouponAdminDto): string {
    if (coupon.percentOff !== null) return `${coupon.percentOff}% kedvezmény`;
    return `${(coupon.amountOffHuf ?? 0).toLocaleString('hu-HU')} Ft kedvezmény`;
  }

  isExhausted(coupon: CouponAdminDto): boolean {
    return coupon.maxRedemptions !== null && coupon.redemptionCount >= coupon.maxRedemptions;
  }

  isExpired(coupon: CouponAdminDto): boolean {
    return !!coupon.validTo && new Date(coupon.validTo) < new Date();
  }

  create(): void {
    if (!this.canSubmit() || this.pending()) return;
    this.formError.set(null);
    this.pending.set(true);

    const request: CouponCreateRequest = {
      code: this.form.code.trim(),
      percentOff: this.kind() === 'percent' ? this.form.percentOff : null,
      amountOffHuf: this.kind() === 'amount' ? this.form.amountOffHuf : null,
      // A <input type="date"> helyi naptári napot ad - a lejárat a nap VÉGÉIG él.
      validFrom: this.form.validFrom ? new Date(`${this.form.validFrom}T00:00:00`).toISOString() : null,
      validTo: this.form.validTo ? new Date(`${this.form.validTo}T23:59:59`).toISOString() : null,
      maxRedemptions: this.form.maxRedemptions || null,
      subscriptionTypeId: this.form.subscriptionTypeId,
      note: this.form.note.trim() || null,
    };

    this.svc.create(request).subscribe({
      next: (created) => {
        this.pending.set(false);
        this.coupons.update((list) => [created, ...list]);
        this.form = this.emptyForm();
        this.toast.success(`Kupon létrehozva: ${created.code}`);
      },
      error: (err) => {
        this.pending.set(false);
        this.formError.set(extractErrorMessage(err, 'A kupon létrehozása sikertelen.'));
      },
    });
  }

  async deactivate(coupon: CouponAdminDto): Promise<void> {
    const ok = await this.confirmService.ask({
      message:
        `Inaktiválod a(z) ${coupon.code} kupont? Ezután nem váltható be többé - ` +
        'a korábbi beváltások és az általuk aktivált előfizetések változatlanok maradnak.',
      danger: true,
      confirmLabel: 'Inaktiválás',
    });
    if (!ok) return;

    this.pending.set(true);
    this.svc.deactivate(coupon.id).subscribe({
      next: (updated) => {
        this.pending.set(false);
        this.coupons.update((list) => list.map((c) => (c.id === updated.id ? updated : c)));
        this.toast.success('Kupon inaktiválva.');
      },
      error: (err) => {
        this.pending.set(false);
        this.toast.danger(extractErrorMessage(err, 'Hiba történt.'));
      },
    });
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.list().subscribe({
      next: (data) => {
        this.coupons.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('A kuponok betöltése sikertelen.');
        this.loading.set(false);
      },
    });
  }

  private emptyForm() {
    return {
      code: '',
      percentOff: null as number | null,
      amountOffHuf: null as number | null,
      validFrom: '',
      validTo: '',
      maxRedemptions: null as number | null,
      subscriptionTypeId: null as number | null,
      note: '',
    };
  }
}
