import { TestBed } from '@angular/core/testing';
import { ToastComponent } from './toast.component';
import { ToastService } from './toast.service';

describe('ToastComponent', () => {
  it('az aktuális üzenetet állapot-színnel mutatja, a bezárás gomb eltünteti', () => {
    const fixture = TestBed.createComponent(ToastComponent);
    const service = TestBed.inject(ToastService);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="toast"]')).toBeNull();

    service.warning('Figyelem!');
    fixture.detectChanges();
    const toast = el.querySelector('[data-testid="toast"]')!;
    expect(toast.getAttribute('role')).toBe('alert');
    expect(toast.textContent).toContain('Figyelem!');
    expect(toast.classList).toContain('border-warning');

    (el.querySelector('button[aria-label="Bezárás"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="toast"]')).toBeNull();
  });
});
