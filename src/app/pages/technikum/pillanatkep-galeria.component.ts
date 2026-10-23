import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Subscription, take } from 'rxjs';
import { TeacherTechnikumService } from '../../services/technikum/teacher-technikum.service';
import { DialogShellComponent } from '../../shared/dialog/dialog-shell.component';
import { parseUtc } from '../../shared/utc-date.util';
import { ExamSnapshotGuiDto } from '../../models/technikum.model';

/**
 * A beadott dolgozat grafikus részének képernyőképei: feltöltés-adatok, bélyegképek és nagyító (a közös dialógus-héjon).
 * A képek a pillanatkép megnyitásakor töltődnek (a fül megnyitása előtt is - ezért a szülő a fülön kívül is megtartja,
 * csak az `active` rejti), blobként (a JWT nem süti), objektum-URL-lel; másik dolgozatnál / megszűnéskor felszabadítva.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-pillanatkep-galeria',
  imports: [DatePipe, DialogShellComponent],
  // Az Escape a dokumentumon is zár (mint korábban): a lapozó gomb letiltásakor a fókusz kieshet a dialógusból.
  host: { '(document:keydown.escape)': 'closeLightbox()' },
  template: `
    @if (active()) {
      @let g = gui();
      <p class="text-xs text-text-muted mt-3">Feltöltve: {{ utc(g.uploadedAt) | date: 'yyyy.MM.dd. HH:mm' }} · {{ g.imageCount }} képernyőkép</p>
      @if (g.imageCount) {
        <ul class="gallery mt-2" data-testid="gui-gallery" aria-label="Képernyőképek">
          @for (url of imageUrls(); track $index; let i = $index) {
            <li>
              <button type="button" class="thumb" (click)="lightbox.set(i)" [attr.aria-label]="(i + 1) + '. képernyőkép nagyítása'"
                      [attr.data-testid]="'gui-thumb-' + i">
                @if (url) { <img [src]="url" [alt]="(i + 1) + '. képernyőkép'" /> } @else { <span class="text-xs text-text-muted">betöltés…</span> }
              </button>
            </li>
          }
        </ul>
        @if (imageError(); as err) { <p class="text-danger text-xs mt-1" role="alert">{{ err }}</p> }
      }
    }

    @let i = lightbox();
    @if (i !== null) {
      <app-dialog-shell label="Képernyőkép nagyítva" testId="gui-lightbox" backdropTestId="gui-lightbox-backdrop" align="center" backdropClass="bg-black/80"
                        panelClass="w-full flex flex-col items-center gap-3" (closed)="closeLightbox()">
        <img class="lightbox-img" [src]="imageUrls()[i]" [alt]="(i + 1) + '. képernyőkép'" />
        <div class="lightbox-bar">
          <button type="button" class="btn btn-ghost !text-xs" [disabled]="i === 0" (click)="step(-1)">‹ Előző</button>
          <span class="text-xs">{{ i + 1 }} / {{ imageUrls().length }}</span>
          <button type="button" class="btn btn-ghost !text-xs" [disabled]="i === imageUrls().length - 1" (click)="step(1)">Következő ›</button>
          <button type="button" class="btn btn-primary !text-xs" (click)="closeLightbox()">Bezárás</button>
        </div>
      </app-dialog-shell>
    }
  `,
  styles: [`
    .gallery { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .thumb { display: flex; align-items: center; justify-content: center; width: 10rem; height: 6.5rem; overflow: hidden; border-radius: 0.5rem;
      border: 1px solid var(--color-border-default); background: var(--color-bg-element); }
    .thumb img { width: 100%; height: 100%; object-fit: contain; }
    .thumb:hover, .thumb:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 1px; }
    .lightbox-img { max-width: 100%; max-height: calc(100vh - 6rem); object-fit: contain; border-radius: 0.5rem; background: var(--color-bg-panel); }
    .lightbox-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; padding: 0.375rem 0.75rem; border-radius: 0.75rem;
      background: var(--color-bg-panel); color: var(--color-text-primary); }
    @media (max-width: 480px) { .thumb { width: 8rem; height: 5.25rem; } }
  `],
})
export class PillanatkepGaleriaComponent {
  private readonly api = inject(TeacherTechnikumService);

  readonly sessionId = input.required<number>();
  readonly gui = input.required<ExamSnapshotGuiDto>();
  /** A grafikus rész füle látszik (a betöltött képek fülváltáskor is megmaradnak). */
  readonly active = input(true);

  readonly utc = parseUtc;
  readonly imageUrls = signal<(string | null)[]>([]);
  readonly imageError = signal<string | null>(null);
  readonly lightbox = signal<number | null>(null);

  private loads = new Subscription();

  constructor() {
    // Csak másik dolgozatnál tölt újra (ugyanannak a pontozás utáni friss pillanatképénél a képek maradnak).
    effect(() => {
      const sessionId = this.sessionId();
      untracked(() => {
        this.reset();
        this.load(sessionId, this.gui().imageCount);
      });
    });
    inject(DestroyRef).onDestroy(() => this.reset());
  }

  step(delta: number): void {
    const i = this.lightbox();
    if (i === null) return;
    this.lightbox.set(Math.min(Math.max(i + delta, 0), this.imageUrls().length - 1));
  }

  closeLightbox(): void {
    this.lightbox.set(null);
  }

  private load(sessionId: number, count: number): void {
    this.imageUrls.set(Array.from({ length: count }, () => null));
    for (let i = 0; i < count; i++) {
      this.loads.add(this.api.guiImage(sessionId, i).pipe(take(1)).subscribe({
        next: (blob) => this.imageUrls.update((urls) => urls.map((u, j) => (j === i ? URL.createObjectURL(blob) : u))),
        error: () => this.imageError.set('Egy képernyőkép betöltése sikertelen.'),
      }));
    }
  }

  private reset(): void {
    this.loads.unsubscribe();
    this.loads = new Subscription();
    for (const url of this.imageUrls()) if (url) URL.revokeObjectURL(url);
    this.imageUrls.set([]);
    this.imageError.set(null);
    this.lightbox.set(null);
  }
}
