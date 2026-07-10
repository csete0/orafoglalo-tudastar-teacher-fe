import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ToastService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('show beállítja a toast signalt', () => {
    service.show('success', 'Siker!');

    expect(service.toast()).toEqual({ state: 'success', message: 'Siker!' });
  });

  it('a toast az időzítő lejártával automatikusan eltűnik', () => {
    service.show('danger', 'Hiba', 3000);

    vi.advanceTimersByTime(2999);
    expect(service.toast()).not.toBeNull();

    vi.advanceTimersByTime(1);
    expect(service.toast()).toBeNull();
  });

  it('újabb show a korábbi időzítőt elveti (a második toast végig látszik)', () => {
    service.show('success', 'Első', 3000);
    vi.advanceTimersByTime(2000);

    service.show('warning', 'Második', 3000);
    vi.advanceTimersByTime(2000); // az első timere itt már lejárt volna

    expect(service.toast()).toEqual({ state: 'warning', message: 'Második' });

    vi.advanceTimersByTime(1000);
    expect(service.toast()).toBeNull();
  });

  it('dismiss azonnal eltünteti a toastot', () => {
    service.show('success', 'Siker!');
    service.dismiss();

    expect(service.toast()).toBeNull();
  });
});
