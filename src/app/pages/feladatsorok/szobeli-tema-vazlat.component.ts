import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  ORAL_AUDIENCE_LABELS,
  ORAL_TOPIC_ITEM_COUNT,
  ORAL_TOPIC_QUESTIONS_PER_ITEM,
  OralAudience,
  oralTopicErrors,
} from '../../models/teacher-oral-exam.model';
import { TeacherOralExamService } from '../../services/teacher-oral-exam/teacher-oral-exam.service';
import {
  AI_HELPER_PREMIUM_TEXT,
  aiHelperBlock,
  AiHelperQuotaItemDto,
  quotaRemaining,
} from '../../shared/ai-helper-quota.util';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { ToastService } from '../../shared/toast/toast.service';
import { SOURCE_MAX_CHARS, SOURCE_MAX_FILE_BYTES, SOURCE_MIN_CHARS, sourceErrorMessage } from './kviz-szovegbol.component';

type SourceMode = 'text' | 'file';
const ALLOWED_EXTENSIONS = ['.txt', '.docx', '.pdf'];
const TITLE_MAX = 200;

/** A vázlat hibája: a 100 s-os határidő és a validátor hibalistája saját szöveggel, a többi a kvíz-forrás mintájára. */
export function draftErrorMessage(err: unknown): string {
  const status = (err as { status?: number })?.status;
  if (status === 504 || status === 524) return 'Az MI nem válaszolt időben (100 mp) - próbáld újra rövidebb anyaggal vagy kevesebb tétellel.';
  return sourceErrorMessage(err);
}

/**
 * Új szóbeli téma a tanár anyagából (szöveg VAGY .txt/.docx/.pdf): az MI tételeket (kérdések elvárt elemekkel) és szempontlistát
 * vázol; a vázlat a szerkesztőbe kerül, ott a tanár átnézi és jóváhagyja. Egy vázlat egy egység a havi szóbeli-tételvázlat keretből.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-szobeli-tema-vazlat',
  standalone: true,
  imports: [FormsModule, RouterLink, LocalSpinnerComponent],
  template: `
    <div class="max-w-2xl mx-auto px-4 py-10">
      <a routerLink="/feladatsorok/szobeli" class="text-sm text-text-muted hover:underline">← Vissza a szóbeli témákhoz</a>
      <h1 class="page-title mt-3">Új szóbeli téma anyagból</h1>
      <p class="text-sm text-text-muted mt-1">
        Az MI a tananyagodból szóbeli tételeket (kérdéseket az elvárt elemekkel) és szempontlistát készít. A vázlatot utána átnézed,
        javítod és jóváhagyod - csak a jóváhagyott téma adható ki.
      </p>
      <div class="hairline"></div>

      @if (generating()) {
        <div aria-live="polite" data-testid="oral-draft-progress">
          <app-local-spinner label="Készül a tételvázlat… ez akár 100 másodpercig is tarthat, ne zárd be az oldalt." />
        </div>
      } @else {
        <form class="space-y-4" (ngSubmit)="generate()" data-testid="oral-draft-form">
          @if (blockMessage(); as block) {
            <p class="bg-warning-subtle border border-warning/40 rounded-xl p-3 text-sm text-warning" role="status" data-testid="oral-draft-blocked">{{ block }}</p>
          } @else if (quota(); as q) {
            <p class="text-xs text-text-muted" data-testid="oral-draft-quota">
              1 egység a havi {{ q.limit }}-ből (ebben a hónapban még {{ remaining(q) }} vázlat).
            </p>
          }

          <label class="block text-sm">A téma címe
            <input class="input mt-1" name="title" [maxLength]="titleMax" [ngModel]="title()" (ngModelChange)="title.set($event)"
              placeholder="pl. A fotoszintézis" data-testid="oral-draft-title" />
          </label>

          <div role="radiogroup" aria-label="Az anyag" class="flex flex-wrap gap-2">
            @for (m of modes; track m.value) {
              <label class="flex items-center gap-2 rounded-xl px-3 py-2 border border-border-default text-sm" [class.border-primary]="mode() === m.value">
                <input type="radio" name="source-mode" [value]="m.value" [checked]="mode() === m.value" (change)="mode.set(m.value)"
                  [attr.data-testid]="'oral-draft-mode-' + m.value" />
                {{ m.label }}
              </label>
            }
          </div>

          @if (mode() === 'text') {
            <div>
              <label for="oral-draft-text" class="text-sm font-medium block mb-1">Tananyag</label>
              <textarea id="oral-draft-text" name="text" rows="10" class="input !text-sm" [maxLength]="maxChars"
                [ngModel]="text()" (ngModelChange)="text.set($event)" placeholder="Illeszd be ide a tananyag szövegét (legalább 200 karakter)…"
                data-testid="oral-draft-text"></textarea>
              <p class="text-xs mt-1" [class.text-text-muted]="!textTooShort()" [class.text-warning]="textTooShort()" data-testid="oral-draft-counter">
                {{ charCount() }} / {{ maxCharsLabel }} karakter @if (textTooShort()) { · legalább {{ minChars }} kell }
              </p>
            </div>
          } @else {
            <div>
              <label for="oral-draft-file" class="text-sm font-medium block mb-1">Fájl (.txt, .docx vagy .pdf, legfeljebb 10 MB)</label>
              <input id="oral-draft-file" type="file" accept=".txt,.docx,.pdf" class="input !text-sm" (change)="onFile($event)" data-testid="oral-draft-file" />
              @if (fileError(); as fe) {
                <p class="text-xs text-danger mt-1" role="alert" data-testid="oral-draft-file-error">{{ fe }}</p>
              }
            </div>
          }

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label class="block text-sm">Tételek ({{ itemRange.min }}–{{ itemRange.max }})
              <input type="number" name="itemCount" class="input mt-1" [min]="itemRange.min" [max]="itemRange.max"
                [ngModel]="itemCount()" (ngModelChange)="itemCount.set($event)" data-testid="oral-draft-items" />
            </label>
            <label class="block text-sm">Kérdés / tétel ({{ questionRange.min }}–{{ questionRange.max }})
              <input type="number" name="questionsPerItem" class="input mt-1" [min]="questionRange.min" [max]="questionRange.max"
                [ngModel]="questionsPerItem()" (ngModelChange)="questionsPerItem.set($event)" data-testid="oral-draft-questions" />
            </label>
            <label class="block text-sm">Célcsoport
              <select name="audience" class="input mt-1" [ngModel]="audience()" (ngModelChange)="audience.set($event)" data-testid="oral-draft-audience">
                @for (a of audiences; track a.value) { <option [ngValue]="a.value">{{ a.label }}</option> }
              </select>
            </label>
          </div>

          @if (error(); as err) {
            <div class="bg-danger-subtle border border-danger/40 rounded-xl p-3 text-sm text-danger" role="alert" data-testid="oral-draft-error">
              <p>{{ err }}</p>
              @if (errorList().length) {
                <ul class="list-disc pl-5 mt-1 space-y-0.5">
                  @for (e of errorList(); track $index) { <li class="break-words">{{ e }}</li> }
                </ul>
              }
            </div>
          }

          <div class="flex justify-end">
            <button type="submit" class="btn btn-primary" [disabled]="!canGenerate()" data-testid="oral-draft-submit">Vázlat készítése</button>
          </div>
        </form>
      }
    </div>
  `,
})
export class SzobeliTemaVazlatComponent implements OnInit {
  private readonly api = inject(TeacherOralExamService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly modes: { value: SourceMode; label: string }[] = [
    { value: 'text', label: 'Szöveg beillesztése' },
    { value: 'file', label: 'Fájl feltöltése' },
  ];
  readonly audiences = (Object.keys(ORAL_AUDIENCE_LABELS) as OralAudience[]).map((value) => ({ value, label: ORAL_AUDIENCE_LABELS[value] }));
  readonly itemRange = ORAL_TOPIC_ITEM_COUNT;
  readonly questionRange = ORAL_TOPIC_QUESTIONS_PER_ITEM;
  readonly minChars = SOURCE_MIN_CHARS;
  readonly maxChars = SOURCE_MAX_CHARS;
  readonly maxCharsLabel = SOURCE_MAX_CHARS.toLocaleString('hu-HU');
  readonly titleMax = TITLE_MAX;
  readonly remaining = quotaRemaining;

  readonly title = signal('');
  readonly mode = signal<SourceMode>('text');
  readonly text = signal('');
  readonly file = signal<File | null>(null);
  readonly fileError = signal<string | null>(null);
  readonly itemCount = signal<number>(5);
  readonly questionsPerItem = signal<number>(4);
  readonly audience = signal<OralAudience>('kozep');

  readonly quota = signal<AiHelperQuotaItemDto | null>(null);
  readonly premium = signal<boolean | null>(null);
  readonly generating = signal(false);
  readonly error = signal<string | null>(null);
  readonly errorList = signal<string[]>([]);

  readonly charCount = computed(() => this.text().trim().length);
  readonly textTooShort = computed(() => this.charCount() > 0 && this.charCount() < SOURCE_MIN_CHARS);

  readonly blockMessage = computed(() => {
    if (this.premium() === false) return AI_HELPER_PREMIUM_TEXT;
    const q = this.quota();
    if (q && quotaRemaining(q) === 0) return `Elfogyott a havi kereted (${q.limit} szóbeli-tételvázlat / hó) - a következő hónapban újra kérhetsz.`;
    return null;
  });

  readonly canGenerate = computed(() => {
    if (this.generating() || this.blockMessage()) return false;
    const title = this.title().trim();
    if (!title || title.length > TITLE_MAX) return false;
    if (!inRange(this.itemCount(), ORAL_TOPIC_ITEM_COUNT) || !inRange(this.questionsPerItem(), ORAL_TOPIC_QUESTIONS_PER_ITEM)) return false;
    return this.mode() === 'text'
      ? this.charCount() >= SOURCE_MIN_CHARS && this.charCount() <= SOURCE_MAX_CHARS
      : this.file() !== null && this.fileError() === null;
  });

  ngOnInit(): void {
    // A keret csak tájékoztatás: ha nem jön meg, a szerver úgyis érthető hibát ad.
    this.api.quota().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (q) => {
        this.premium.set(q.premium);
        this.quota.set(q.oralDraft ?? null);
      },
      error: () => {},
    });
  }

  onFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.file.set(file);
    this.error.set(null);
    if (!file) this.fileError.set(null);
    else if (!ALLOWED_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))) this.fileError.set('Csak .txt, .docx vagy .pdf fájl tölthető fel.');
    else if (file.size > SOURCE_MAX_FILE_BYTES) this.fileError.set('A fájl túl nagy (legfeljebb 10 MB).');
    else if (file.size === 0) this.fileError.set('A fájl üres.');
    else this.fileError.set(null);
  }

  generate(): void {
    if (!this.canGenerate()) return;
    this.generating.set(true);
    this.error.set(null);
    this.errorList.set([]);
    this.api
      .draft({
        text: this.mode() === 'text' ? this.text().trim() : null,
        file: this.mode() === 'file' ? this.file() : null,
        title: this.title().trim(),
        itemCount: Number(this.itemCount()),
        questionsPerItem: Number(this.questionsPerItem()),
        audience: this.audience(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.toast.success('A tételvázlat elkészült - nézd át, és hagyd jóvá.');
          for (const warning of res.warnings) this.toast.warning(warning, 8000);
          void this.router.navigate(['/feladatsorok/szobeli', res.topic.id]);
        },
        error: (err) => {
          this.generating.set(false);
          const block = aiHelperBlock(err);
          if (block === 'premium') this.premium.set(false);
          if (block === 'quota') {
            const q = this.quota();
            this.quota.set(q ? { ...q, used: q.limit } : null);
          }
          // A blokkoló sáv maga a magyarázat; ha nincs (nem ismert keret), a hibaszöveg.
          this.error.set(block && this.blockMessage() ? null : draftErrorMessage(err));
          this.errorList.set(oralTopicErrors(err).map((e) => (e.path ? `${e.path}: ${e.message}` : e.message)));
        },
      });
  }
}

function inRange(value: number, range: { min: number; max: number }): boolean {
  const n = Number(value);
  return Number.isInteger(n) && n >= range.min && n <= range.max;
}
