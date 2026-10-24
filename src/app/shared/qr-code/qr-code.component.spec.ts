import { TestBed } from '@angular/core/testing';
import { QrCodeComponent } from './qr-code.component';

describe('QrCodeComponent', () => {
  it('a canvas képként, a kódolt szöveggel olvasható fel; renderelési hiba nem töri el az oldalt', async () => {
    // A jsdom-ban nincs canvas-rajzolás: a getContext null, a toCanvas hibáját a komponens elnyeli.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const fixture = TestBed.createComponent(QrCodeComponent);
    fixture.componentRef.setInput('value', 'https://pelda.hu/csatlakozas/ABC');
    fixture.detectChanges();
    await fixture.whenStable();
    const canvas = fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement;
    expect(canvas.getAttribute('role')).toBe('img');
    expect(canvas.getAttribute('aria-label')).toBe('QR-kód: https://pelda.hu/csatlakozas/ABC');

    fixture.componentRef.setInput('value', 'masik');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(canvas.getAttribute('aria-label')).toBe('QR-kód: masik');
  });
});
