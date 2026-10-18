import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OfficeParagraphAnchor } from '../../models/office-task.model';
import { anchorFor, anchorText, describeAnchor } from './irodai-undo.util';

/** Legfeljebb ennyi találat jelenik meg egyszerre (a többihez a kereső). */
export const PICKER_LIMIT = 100;
const PREVIEW_CHARS = 60;

/**
 * Word-bekezdés kiválasztása a visszacsinálási művelethez: a megoldás bekezdéseinek listája (sorszám + az első ~60 karakter) keresővel -
 * a választás a szerver horgonyát (sorszám + a szöveg eleje) tölti ki. Ha a lista nem érhető el, kézzel is megadható.
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
                (click)="choose(item.index)" [attr.data-testid]="testId() + '-option-' + item.index">
                <span class="font-mono text-text-muted">[{{ item.index }}]</span> {{ item.preview }}
              </button>
            </li>
          } @empty {
            <li class="px-2 py-1 text-sm text-text-muted">Nincs találat.</li>
          }
        </ul>
        @if (hidden() > 0) {
          <p class="text-xs text-text-muted" [attr.data-testid]="testId() + '-more'">Még {{ hidden() }} bekezdés - szűkíts a keresővel.</p>
        }
      } @else if (loading()) {
        <p class="text-xs text-text-muted" role="status">A megoldás bekezdéseinek betöltése…</p>
      } @else if (error()) {
        <p class="text-xs text-warning" [attr.data-testid]="testId() + '-error'">{{ error() }}</p>
      }
      <details class="text-sm" [open]="!paragraphs()">
        <summary class="text-xs text-text-muted cursor-pointer">Kézi megadás (sorszám és a szöveg eleje)</summary>
        <div class="grid grid-cols-[6rem_1fr] gap-2 mt-1">
          <div>
            <label [for]="testId() + '-index'" class="text-xs text-text-muted block">Sorszám (0-tól)</label>
            <input [id]="testId() + '-index'" type="number" min="0" class="input !px-2 !py-1 !text-sm" [ngModel]="anchor()?.index ?? null"
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
  /** A megoldás bekezdései (null: még nincs betöltve / nem érhető el). */
  readonly paragraphs = input<string[] | null>(null);
  readonly loading = input(false);
  readonly error = input<string | null>(null);
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

  private readonly filtered = computed(() => {
    const list = this.paragraphs() ?? [];
    const term = this.search().trim().toLowerCase();
    const items = list.map((text, index) => ({ index, text: anchorText(text) }));
    return term ? items.filter((it) => String(it.index) === term || it.text.toLowerCase().includes(term)) : items;
  });

  readonly matches = computed(() =>
    this.filtered()
      .slice(0, PICKER_LIMIT)
      .map((it) => ({
        index: it.index,
        preview: it.text ? (it.text.length > PREVIEW_CHARS ? it.text.slice(0, PREVIEW_CHARS).trimEnd() + '…' : it.text) : '(üres bekezdés)',
      })),
  );

  readonly hidden = computed(() => Math.max(0, this.filtered().length - PICKER_LIMIT));

  choose(index: number): void {
    const list = this.paragraphs();
    if (list && index >= 0 && index < list.length) this.anchorChange.emit(anchorFor(index, list[index]));
  }

  setIndex(value: unknown): void {
    const index = value === null || value === '' || value === undefined ? null : Number(value);
    this.anchorChange.emit({ index: index === null || Number.isNaN(index) ? null : index, startsWith: this.anchor()?.startsWith ?? '' });
  }

  setText(value: string): void {
    this.anchorChange.emit({ index: this.anchor()?.index ?? null, startsWith: value });
  }
}
