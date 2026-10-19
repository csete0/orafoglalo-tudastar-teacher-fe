import { ChangeDetectionStrategy, Component, TemplateRef, computed, input, model, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

/** A sor alá rajzolt sablon (pl. megjegyzés-szálak) környezete. */
export interface KodSorKornyezet {
  $implicit: number;
  text: string;
}

/** A fájllista sorrendje: előbb a diák fájljai, utána a csak olvasható keret, mindkettő ábécérendben. */
export function codeFilePaths(files: Record<string, string>, readOnlyPaths: readonly string[]): string[] {
  const ro = new Set(readOnlyPaths);
  return Object.keys(files).sort((a, b) => Number(ro.has(a)) - Number(ro.has(b)) || a.localeCompare(b));
}

/** Egy fájl sorai (CRLF-ből is). */
export function codeLines(text: string | undefined): string[] {
  return (text ?? '').split('\n').map((l) => l.replace(/\r$/, ''));
}

/**
 * Kódolvasó (csak olvasás): fájllista és sorszámozott kód. A projekt-kiadás osztály-nézete megjegyzésekkel használja
 * (`commentable`, `lineExtras`), a technikumi dolgozat pillanatképe csak nézetként.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-kod-olvaso',
  standalone: true,
  imports: [NgTemplateOutlet],
  template: `
    <div class="grid gap-3 md:grid-cols-[14rem_minmax(0,1fr)]">
      <div class="min-w-0">
        <ul class="space-y-0.5 text-xs font-mono">
          @for (path of paths(); track path) {
            <li><button type="button" class="w-full text-left px-2 py-1 rounded break-all" [class.bg-bg-element]="activePath() === path" (click)="activePath.set(path)">
              {{ path }}{{ readOnlyPaths().includes(path) ? ' (keret)' : '' }}
              @if (badges()[path]; as n) { <span class="comment-count" [attr.aria-label]="n + ' nyitott megjegyzés'">{{ n }}</span> }
              @if (suggestionBadges()[path]; as n) { <span class="suggestion-count" [attr.aria-label]="n + ' AI-javaslat'">{{ n }}</span> }
            </button></li>
          }
        </ul>
        <!-- A fájllista alá vetített tartalom (pl. az AI-javaslatok listája). -->
        <ng-content />
      </div>
      <div class="code-view" tabindex="0" data-testid="code-view">
        @for (text of lines(); track $index; let i = $index) {
          <div class="code-line" [class.code-line--marked]="markedLines().has(i + 1)">
            @if (commentable()) {
              <button type="button" class="code-ln code-ln--action" [attr.aria-label]="'Megjegyzés a(z) ' + (i + 1) + '. sorhoz'"
                      (click)="lineClick.emit(i + 1)">{{ i + 1 }}</button>
            } @else {
              <span class="code-ln" aria-hidden="true">{{ i + 1 }}</span>
            }
            <span class="code-text">{{ text }}</span>
          </div>
          @if (lineExtras(); as tpl) {
            <ng-container *ngTemplateOutlet="tpl; context: { $implicit: i + 1, text }" />
          }
        } @empty {
          <p class="px-3 text-text-muted">Nincs megnyitható fájl.</p>
        }
      </div>
    </div>
  `,
  styles: [`
    .code-view { max-height: 60vh; overflow: auto; padding: 0.5rem 0; border-radius: 0.5rem; background: var(--color-bg-element);
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.75rem; line-height: 1.5; }
    .code-line { display: flex; }
    .code-line--marked { background: var(--color-warning-subtle, rgba(154, 103, 0, 0.1)); }
    .code-ln { flex: none; width: 3rem; padding-right: 0.75rem; text-align: right; color: var(--color-text-muted); user-select: none; }
    .code-ln--action:hover, .code-ln--action:focus-visible { color: var(--color-primary); text-decoration: underline; }
    .code-text { white-space: pre; padding-right: 0.75rem; }
    .comment-count { margin-left: 0.25rem; padding: 0 0.375rem; border-radius: 999px; background: var(--color-warning); color: #fff; font-size: 0.625rem; }
    .suggestion-count { margin-left: 0.25rem; padding: 0 0.375rem; border-radius: 999px; border: 1px dashed var(--color-primary); color: var(--color-primary); font-size: 0.625rem; }
  `],
})
export class KodOlvasoComponent {
  readonly files = input.required<Record<string, string>>();
  readonly readOnlyPaths = input<readonly string[]>([]);
  /** A megnyitott fájl (kétirányú): a szülő választja ki az elsőt (`codeFilePaths(...)[0]`). */
  readonly activePath = model<string | null>(null);
  /** Igaz: a sorszám gomb, és `lineClick`-et küld (megjegyzés írása). */
  readonly commentable = input(false);
  /** Kiemelt sorok (pl. megjegyzés van rajtuk). */
  readonly markedLines = input<ReadonlySet<number>>(new Set());
  /** Fájlonkénti jelvény-szám (pl. nyitott megjegyzések). */
  readonly badges = input<Record<string, number>>({});
  /** Fájlonkénti AI-javaslat-szám (szaggatott keretes jelvény). */
  readonly suggestionBadges = input<Record<string, number>>({});
  /** Minden sor alá rajzolt sablon (pl. megjegyzés-szálak). */
  readonly lineExtras = input<TemplateRef<KodSorKornyezet> | null>(null);
  readonly lineClick = output<number>();

  readonly paths = computed(() => codeFilePaths(this.files(), this.readOnlyPaths()));
  readonly lines = computed(() => {
    const path = this.activePath();
    return path ? codeLines(this.files()[path]) : [];
  });
}
