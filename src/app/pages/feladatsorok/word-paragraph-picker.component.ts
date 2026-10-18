import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OfficeParagraphAnchor, OfficeWordParagraph } from '../../models/office-task.model';
import { describeAnchor } from './irodai-undo.util';

/** Legfeljebb ennyi találat jelenik meg egyszerre (a többihez a kereső). */
export const PICKER_LIMIT = 100;
const PREVIEW_CHARS = 60;

function preview(text: string, truncated: boolean): string {
  const chars = Array.from(text);
  if (chars.length > PREVIEW_CHARS) return chars.slice(0, PREVIEW_CHARS).join('').trimEnd() + '…';
  return truncated ? text + '…' : text;
}

/**
 * Word-bekezdés kiválasztása a visszacsinálási művelethez: a megoldás bekezdéseinek listája (a szerver generálási eredményéből; sorszám
 * 1-től + az első ~60 karakter) keresővel - a választás a szerver horgonyát (0-alapú sorszám + a szöveg eleje rövidítésjel nélkül) tölti
 * ki. Ha a lista nem érhető el, kézzel is megadható.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-word-paragraph-picker',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="space-y-1 min-w-0" [attr.data-testid]="testId()">
      <div class="flex flex-wrap items-baseline gap-2">
        <span class="text-xs text-text-muted">{{ label() }}</span>
        <span class="text-sm break-words min-w-0" [attr.data-testid]="testId() + '-value'">{{ anchor() ? current() : 'nincs kiválasztva' }}</span>
        @if (optional() && anchor()) {
          <button type="button" class="text-xs text-danger hover:underline" (click)="anchorChange.emit(null)" [attr.data-testid]="testId() + '-clear'">{{ clearLabel() }}</button>
        }
      </div>
      @if (paragraphs(); as list) {
        <label [for]="testId() + '-search'" class="sr-only">{{ label() }} - keresés a bekezdések között</label>
        <input [id]="testId() + '-search'" type="search" class="input !px-2 !py-1 !text-sm" placeholder="Keresés a bekezdések szövegében vagy sorszámában"
          [ngModel]="search()" (ngModelChange)="search.set($event)" [ngModelOptions]="{ standalone: true }" [attr.data-testid]="testId() + '-search'" />
        <ul class="max-h-56 overflow-y-auto border border-border-default rounded-lg divide-y divide-border-default" role="listbox" [attr.aria-label]="label()"
          [attr.data-testid]="testId() + '-list'">
          @for (item of matches(); track item.index) {
            <li role="option" [attr.aria-selected]="item.index === anchor()?.index">
              <button type="button" class="w-full text-left px-2 py-1 text-sm hover:bg-bg-element disabled:opacity-50 break-words"
                [class.bg-primary-subtle]="item.index === anchor()?.index" [disabled]="item.index < minIndex()"
                (click)="choose(item)" [attr.data-testid]="testId() + '-option-' + item.index">
                <span class="font-mono text-text-muted">[{{ item.index + 1 }}]</span> {{ item.preview }}
                @if (item.meta) { <span class="text-xs text-text-muted">({{ item.meta }})</span> }
              </button>
            </li>
          } @empty {
            <li class="px-2 py-1 text-sm text-text-muted">Nincs találat.</li>
          }
        </ul>
        @if (hidden() > 0) {
          <p class="text-xs text-text-muted" [attr.data-testid]="testId() + '-more'">Még {{ hidden() }} bekezdés - szűkíts a keresővel.</p>
        }
      } @else if (unavailable()) {
        <p class="text-xs text-warning" [attr.data-testid]="testId() + '-unavailable'">{{ unavailable() }}</p>
      }
      <details class="text-sm" [open]="!paragraphs()">
        <summary class="text-xs text-text-muted cursor-pointer">Kézi megadás (sorszám és a szöveg eleje)</summary>
        <div class="grid grid-cols-[6rem_1fr] gap-2 mt-1">
          <div>
            <label [for]="testId() + '-index'" class="text-xs text-text-muted block">Sorszám (1-től)</label>
            <input [id]="testId() + '-index'" type="number" min="1" class="input !px-2 !py-1 !text-sm" [ngModel]="number()"
              (ngModelChange)="setIndex($event)" [ngModelOptions]="{ standalone: true }" [attr.data-testid]="testId() + '-index'" />
          </div>
          <div class="min-w-0">
            <label [for]="testId() + '-text'" class="text-xs text-text-muted block">A bekezdés szövegének eleje</label>
            <input [id]="testId() + '-text'" class="input !px-2 !py-1 !text-sm" maxlength="200" [ngModel]="anchor()?.startsWith ?? ''"
              (ngModelChange)="setText($event)" [ngModelOptions]="{ standalone: true }" [attr.data-testid]="testId() + '-text'" />
          </div>
        </div>
      </details>
    </div>
  `,
})
export class WordParagraphPickerComponent {
  /** A megoldás bekezdései (null: nem érhető el - csak kézi megadás). */
  readonly paragraphs = input<OfficeWordParagraph[] | null>(null);
  /** Miért nincs lista (a kézi megadás fölött jelenik meg). */
  readonly unavailable = input<string | null>(null);
  readonly anchor = input<OfficeParagraphAnchor | null | undefined>(null);
  readonly label = input.required<string>();
  readonly testId = input.required<string>();
  /** Elhagyható horgony („to”, ill. a removeHyperlinks „from”-ja): törölhető. */
  readonly optional = input(false);
  readonly clearLabel = input('Törlés');
  /** Az ennél kisebb sorszámú bekezdések nem választhatók (a „to” nem lehet a „from” előtt). */
  readonly minIndex = input(0);
  readonly anchorChange = output<OfficeParagraphAnchor | null>();

  readonly search = signal('');

  readonly current = computed(() => describeAnchor(this.anchor()));
  /** A kézi mező 1-től számoz. */
  readonly number = computed(() => {
    const index = this.anchor()?.index;
    return index == null ? null : index + 1;
  });

  private readonly filtered = computed(() => {
    const list = this.paragraphs() ?? [];
    const term = this.search().trim().toLowerCase();
    return term ? list.filter((p) => String(p.index + 1) === term || p.text.toLowerCase().includes(term)) : list;
  });

  readonly matches = computed(() =>
    this.filtered()
      .slice(0, PICKER_LIMIT)
      .map((p) => ({
        index: p.index,
        text: p.text,
        preview: p.text ? preview(p.text, p.truncated) : '(üres bekezdés)',
        meta: [p.inTable ? 'táblázatban' : null, p.style && p.style.toLowerCase() !== 'normal' ? p.style : null].filter(Boolean).join(', '),
      })),
  );

  readonly hidden = computed(() => Math.max(0, this.filtered().length - PICKER_LIMIT));

  /** A horgony a szerver szövege változatlanul (a „…” csak a megjelenítésé). */
  choose(item: { index: number; text: string }): void {
    this.anchorChange.emit({ index: item.index, startsWith: item.text });
  }

  setIndex(value: unknown): void {
    const n = value === null || value === '' || value === undefined ? NaN : Number(value);
    this.anchorChange.emit({ index: Number.isNaN(n) ? null : n - 1, startsWith: this.anchor()?.startsWith ?? '' });
  }

  setText(value: string): void {
    this.anchorChange.emit({ index: this.anchor()?.index ?? null, startsWith: value });
  }
}
