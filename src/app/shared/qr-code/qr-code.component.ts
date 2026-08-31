import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  input,
  viewChild,
} from '@angular/core';
import * as QRCode from 'qrcode';

/**
 * UI-UX-T1: QR-kód megjelenítő. Az osztálytermi fő eset a kivetítés: a diákok a
 * telefonjukkal beolvassák a csatlakozási linket, gépelés nélkül. Canvasra
 * renderel (qrcode lib, helyi npm-függőség - CDN-t a CSP amúgy sem engedne).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-qr-code',
  standalone: true,
  template: `
    <canvas #canvas [attr.aria-label]="'QR-kód: ' + value()" role="img"
      class="rounded-lg bg-white p-2"></canvas>
  `,
})
export class QrCodeComponent {
  /** A kódolandó szöveg (tipikusan URL). */
  readonly value = input.required<string>();
  /** Élhossz pixelben - kivetítéshez nagy (pl. 280), inline-hoz kisebb. */
  readonly size = input(220);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  constructor() {
    effect(() => {
      const value = this.value();
      const size = this.size();
      const element = this.canvas().nativeElement;
      // A fehér háttér + margó szándékos: kivetítőn sötét témában is olvasható marad.
      void QRCode.toCanvas(element, value, { width: size, margin: 1 }).catch(() => {
        // Renderelési hiba (elméleti): a canvas üres marad, a kód/link szövegként
        // amúgy is ott van a QR mellett - nem törjük el az oldalt.
      });
    });
  }
}
