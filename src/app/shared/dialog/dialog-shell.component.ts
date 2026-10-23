import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';

/**
 * Közös modális dialógus-héj: háttér, `role`/`aria-modal`/ARIA-címke, Escape →
 * `closed`, opcionálisan háttérkattintás → `closed`, és a fókusz kezelése.
 * A tartalom content projectionnel jön; a héjat a hívó `@if`-fel mountolja.
 *
 * Fókusz: megjelenéskor a panelen belüli `[data-dialog-autofocus]` elemre, ennek
 * hiányában magára a panelre kerül; a héj megszűnésekor visszakerül arra az
 * elemre, amely a megnyitás előtt fókuszban volt (UI-TT-187: enélkül a fókusz
 * document.body-ra esik, és a billentyűzetes felhasználó elveszti a helyét).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-dialog-shell',
  standalone: true,
  template: `
    <div class="fixed inset-0 z-50 flex justify-center p-4"
         [class.items-center]="align() === 'center'"
         [class.items-start]="align() === 'top'"
         [class.overflow-y-auto]="align() === 'top'"
         (keydown.escape)="closed.emit()">
      <!-- fixed, nem absolute: a görgethető ablak-tartalom alatt is az egész képernyőt takarja. -->
      <div class="fixed inset-0 bg-black/40" [attr.data-testid]="backdropTestId()" (click)="onBackdropClick()"></div>
      <div #panel [attr.role]="role()" aria-modal="true" tabindex="-1"
           [attr.aria-labelledby]="labelledBy()" [attr.aria-label]="label()" [attr.aria-describedby]="describedBy()"
           [attr.data-testid]="testId()"
           class="relative outline-none" [class]="panelClass()">
        <ng-content />
      </div>
    </div>
  `,
})
export class DialogShellComponent {
  readonly role = input<'dialog' | 'alertdialog'>('dialog');
  /** A dialógus címének `id`-je (`aria-labelledby`). */
  readonly labelledBy = input<string | null>(null);
  /** Látható cím-id hiányában közvetlen `aria-label`. */
  readonly label = input<string | null>(null);
  readonly describedBy = input<string | null>(null);
  /** `center`: függőlegesen középre (rövid dialógus); `top`: felülről, görgethető (hosszú tartalom). */
  readonly align = input<'center' | 'top'>('top');
  readonly closeOnBackdrop = input(true);
  /** A panel osztályai (méret, padding, kártya-stílus). */
  readonly panelClass = input('');
  readonly testId = input<string | null>(null);
  readonly backdropTestId = input<string | null>(null);

  /** Escape-re, illetve (ha engedélyezett) háttérkattintásra. */
  readonly closed = output<void>();

  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  constructor() {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // setTimeout (nem afterNextRender): ugyanaz az időzítés, mint a korábbi kézi
    // dialógusoké — a megnyitó kattintás/billentyű eseménykezelése előbb lefut.
    const focusTimer = setTimeout(() => {
      const panel = this.panel().nativeElement;
      (panel.querySelector<HTMLElement>('[data-dialog-autofocus]') ?? panel).focus();
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(focusTimer);
      previouslyFocused?.focus();
    });
  }

  onBackdropClick(): void {
    if (this.closeOnBackdrop()) this.closed.emit();
  }
}
