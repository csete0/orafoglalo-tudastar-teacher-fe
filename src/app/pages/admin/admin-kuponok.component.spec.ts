import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AdminKuponokComponent } from './admin-kuponok.component';
import { AdminCouponService } from '../../services/admin/admin-coupon.service';
import { ToastService } from '../../shared/toast/toast.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { CouponAdminDto } from '../../models/coupon.model';

function makeCoupon(overrides: Partial<CouponAdminDto> = {}): CouponAdminDto {
  return {
    id: 1,
    code: 'ISKOLA2026',
    percentOff: 20,
    amountOffHuf: null,
    validFrom: '2026-09-01T00:00:00Z',
    validTo: null,
    maxRedemptions: null,
    redemptionCount: 0,
    subscriptionTypeId: null,
    subscriptionTypeName: null,
    isActive: true,
    createdAt: '2026-09-01T00:00:00Z',
    note: null,
    ...overrides,
  };
}

describe('AdminKuponokComponent - B3: kuponok admin nézet', () => {
  let svcMock: {
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    deactivate: ReturnType<typeof vi.fn>;
    subscriptionTypes: ReturnType<typeof vi.fn>;
  };
  let toastMock: { success: ReturnType<typeof vi.fn>; danger: ReturnType<typeof vi.fn> };
  let confirmMock: { ask: ReturnType<typeof vi.fn> };

  function configure(coupons: CouponAdminDto[] = []) {
    svcMock = {
      list: vi.fn().mockReturnValue(of(coupons)),
      create: vi.fn().mockImplementation((req) => of(makeCoupon({ ...req, id: 99, code: req.code.toUpperCase() }))),
      deactivate: vi.fn().mockImplementation((id: number) => of(makeCoupon({ id, isActive: false }))),
      subscriptionTypes: vi.fn().mockReturnValue(of([
        { id: 1, name: 'Ingyenes', price: 0, billingCycle: 'monthly' },
        { id: 2, name: 'Standard', price: 2990, billingCycle: 'monthly' },
        { id: 3, name: 'Prémium', price: 29900, billingCycle: 'yearly' },
      ])),
    };
    toastMock = { success: vi.fn(), danger: vi.fn() };
    confirmMock = { ask: vi.fn().mockResolvedValue(true) };

    TestBed.configureTestingModule({
      imports: [AdminKuponokComponent],
      providers: [
        { provide: AdminCouponService, useValue: svcMock },
        { provide: ToastService, useValue: toastMock },
        { provide: ConfirmService, useValue: confirmMock },
      ],
    });
    const fixture = TestBed.createComponent(AdminKuponokComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('betöltéskor csak az aktív kuponokat listázza, az "Összes" szűrő az inaktívakat is', () => {
    const fixture = configure([
      makeCoupon({ id: 1, code: 'AKTIV' }),
      makeCoupon({ id: 2, code: 'REGI', isActive: false }),
    ]);
    const el: HTMLElement = fixture.nativeElement;

    expect(el.textContent).toContain('AKTIV');
    expect(el.textContent).not.toContain('REGI');

    fixture.componentInstance.onlyActive.set(false);
    fixture.detectChanges();
    expect(el.textContent).toContain('REGI');
    expect(el.textContent).toContain('inaktív');
  });

  it('a csomag-legördülőből kihagyja az ingyenes csomagot', () => {
    const fixture = configure();

    expect(fixture.componentInstance.subscriptionTypes().map((t) => t.id)).toEqual([2, 3]);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Ingyenes (');
  });

  it('a kedvezmény és a beváltás-számláló olvasható címkét kap', () => {
    const fixture = configure([
      makeCoupon({ id: 1, code: 'SZAZ', percentOff: 100, maxRedemptions: 5, redemptionCount: 2 }),
      makeCoupon({ id: 2, code: 'FIX', percentOff: null, amountOffHuf: 1500, subscriptionTypeName: 'Standard' }),
    ]);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('100% kedvezmény');
    expect(text).toContain('beváltva: 2 / 5');
    expect(text).toContain('Ft kedvezmény');
    expect(text).toContain('Standard');
  });

  it('elfogyott és lejárt kupon jelvényt kap', () => {
    const fixture = configure([
      makeCoupon({ id: 1, code: 'ELFOGYOTT', maxRedemptions: 1, redemptionCount: 1 }),
      makeCoupon({ id: 2, code: 'LEJART', validTo: '2020-01-01T00:00:00Z' }),
    ]);
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('elfogyott');
    expect(text).toContain('lejárt');
  });

  it('létrehozás: százalékos kuponnál csak a percentOff megy, a dátumok ISO-ként, a válasz a lista elejére kerül', () => {
    const fixture = configure([makeCoupon({ id: 1, code: 'REGI' })]);
    const component = fixture.componentInstance;
    component.form.code = ' uj2026 ';
    component.form.percentOff = 25;
    component.form.validTo = '2026-12-31';
    component.form.maxRedemptions = 10;
    component.form.subscriptionTypeId = 2;
    component.form.note = ' Őszi kampány ';

    component.create();
    fixture.detectChanges();

    const req = svcMock.create.mock.calls[0][0];
    expect(req.code).toBe('uj2026');
    expect(req.percentOff).toBe(25);
    expect(req.amountOffHuf).toBeNull();
    expect(req.validFrom).toBeNull();
    expect(new Date(req.validTo).getTime()).toBe(new Date('2026-12-31T23:59:59').getTime());
    expect(req.maxRedemptions).toBe(10);
    expect(req.subscriptionTypeId).toBe(2);
    expect(req.note).toBe('Őszi kampány');

    expect(component.coupons()[0].code).toBe('UJ2026');
    expect(component.form.code).toBe('');
    expect(toastMock.success).toHaveBeenCalled();
  });

  it('fix összegű kuponnál a percentOff null, az amountOffHuf megy', () => {
    const fixture = configure();
    const component = fixture.componentInstance;
    component.setKind('amount');
    component.form.code = 'FIX';
    component.form.amountOffHuf = 1000;

    component.create();

    const req = svcMock.create.mock.calls[0][0];
    expect(req.percentOff).toBeNull();
    expect(req.amountOffHuf).toBe(1000);
  });

  it('kód vagy kedvezmény nélkül a küldés tiltott, és nem hív szervert', () => {
    const fixture = configure();
    const component = fixture.componentInstance;

    component.form.code = 'X';
    expect(component.canSubmit()).toBe(false);
    component.create();
    expect(svcMock.create).not.toHaveBeenCalled();

    component.form.code = '';
    component.form.percentOff = 10;
    expect(component.canSubmit()).toBe(false);
  });

  it('a szerver validációs hibáját (OrafoglaloException errorMessage) az űrlap alatt mutatja', () => {
    const fixture = configure();
    const component = fixture.componentInstance;
    svcMock.create.mockReturnValue(throwError(() => ({ error: { errorMessage: 'Ilyen kód már létezik.' } })));
    component.form.code = 'DUPLA';
    component.form.percentOff = 10;

    component.create();
    fixture.detectChanges();

    expect(component.formError()).toBe('Ilyen kód már létezik.');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Ilyen kód már létezik.');
    expect(component.pending()).toBe(false);
  });

  it('inaktiválás: megerősítés után deactivate() hívódik, és a sor inaktív lesz', async () => {
    const fixture = configure([makeCoupon({ id: 7, code: 'VEGE' })]);
    const component = fixture.componentInstance;

    await component.deactivate(component.coupons()[0]);
    fixture.detectChanges();

    expect(confirmMock.ask).toHaveBeenCalled();
    expect(svcMock.deactivate).toHaveBeenCalledWith(7);
    expect(component.coupons()[0].isActive).toBe(false);
    expect(toastMock.success).toHaveBeenCalled();
    // "Csak aktívak" szűrőben a sor eltűnik
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nincs aktív kupon.');
  });

  it('inaktiválás elutasított megerősítésnél nem hív szervert', async () => {
    const fixture = configure([makeCoupon({ id: 7 })]);
    confirmMock.ask.mockResolvedValue(false);

    await fixture.componentInstance.deactivate(fixture.componentInstance.coupons()[0]);

    expect(svcMock.deactivate).not.toHaveBeenCalled();
  });

  it('betöltési hiba esetén hibaüzenet jelenik meg', () => {
    svcMock = {} as any;
    TestBed.configureTestingModule({
      imports: [AdminKuponokComponent],
      providers: [
        { provide: AdminCouponService, useValue: {
          list: vi.fn().mockReturnValue(throwError(() => new Error('net'))),
          subscriptionTypes: vi.fn().mockReturnValue(of([])),
        } },
        { provide: ToastService, useValue: { success: vi.fn(), danger: vi.fn() } },
        { provide: ConfirmService, useValue: { ask: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(AdminKuponokComponent);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('betöltése sikertelen');
  });
});
