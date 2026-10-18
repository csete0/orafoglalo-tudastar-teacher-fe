import { ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, input, OnInit, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import {
  QUIZ_DIFFICULTY_LABELS,
  QUIZ_SOURCE_TYPE_LABELS,
  QuizDifficulty,
  QuizSourceQuestionType,
  QuizSourceResultDto,
  QuizTopicOptionDto,
} from '../../models/teacher-quiz.model';
import { TeacherQuizService } from '../../services/teacher-quiz/teacher-quiz.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { LocalSpinnerComponent } from '../../shared/local-spinner/local-spinner.component';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';
import { ReportService } from '../../services/report/report.service';
import {
  AI_HELPER_PREMIUM_TEXT,
  aiHelperBlock,
  aiHelperErrorMessage,
  AiHelperQuotaItemDto,
  quotaRemaining,
} from '../../shared/ai-helper-quota.util';

/** A BE-vel azonos korlátok. */
export const SOURCE_MIN_CHARS = 200;
export const SOURCE_MAX_CHARS = 30_000;
export const SOURCE_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const SOURCE_MAX_COUNT = 12;
const ALLOWED_EXTENSIONS = ['.txt', '.docx', '.pdf'];

type SourceMode = 'text' | 'file';

/** A hívás hibája érthető magyar mondatként (a 429 és a 413 nem `errorMessage` alakú). */
export function sourceErrorMessage(err: unknown): string {
  const status = (err as { status?: number })?.status;
  if (status === 429) return 'Rövid időn belül túl sok kérést indítottál - várj néhány percet, és próbáld újra.';
  if (status === 413) return 'A fájl túl nagy (legfeljebb 10 MB).';
  if (status === 0) return 'Nem sikerült elérni a szervert - ellenőrizd az internetkapcsolatot, és próbáld újra.';
  // A szerver 80 mp után maga is leáll (érthető üzenettel); ez az átjáró (proxy) időtúllépése.
  if (status === 504 || status === 524) return 'Az MI nem válaszolt időben (80 mp) - próbáld újra rövidebb szöveggel vagy kevesebb kérdéssel.';
  return aiHelperErrorMessage(err) ?? extractErrorMessage(err, 'A kérdések elkészítése nem sikerült.');
}

/**
 * „Kérdések szövegből” párbeszédablak a kvíz-szerkesztőben: beillesztett tananyagból vagy fájlból (.txt/.docx/.pdf) az MI
 * kérdés-piszkozatokat készít (Prémium tanárnak, havi kerettel: egy egység = egy generálás). Minden kérdéshez forrás-idézet kell, amit a szerver szó szerint
 * visszakeres a szövegben - ami nem megy át, az okkal kimarad. Az elkészült kérdések jóváhagyatlanul kerülnek a kvízbe.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-kviz-szovegbol',
  standalone: true,
  imports: [FormsModule, IconComponent, LocalSpinnerComponent],
  template: `
    <div class="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" (keydown.escape)="close()">
      <!-- fixed, nem absolute: a görgethető ablak-tartalom alatt is az egész képernyőt takarja. -->
      <div class="fixed inset-0 bg-black/40" data-testid="quiz-source-backdrop" (click)="close()"></div>
      <div #dialog role="dialog" aria-modal="true" aria-labelledby="quiz-source-title" aria-describedby="quiz-source-help" tabindex="-1"
        data-testid="quiz-source-dialog" class="card relative w-full max-w-2xl min-w-0 p-4 sm:p-6 shadow-xl my-8 sm:my-auto outline-none">
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="icon-tile icon-tile-primary shrink-0"><app-icon name="document" class="w-5 h-5 block" /></div>
            <h2 id="quiz-source-title" class="font-bold text-lg">Kérdések szövegből</h2>
          </div>
          <button type="button" class="btn btn-ghost !p-1.5" aria-label="Bezárás" (click)="close()" data-testid="quiz-source-close">
            <app-icon name="x" class="w-5 h-5 block" />
          </button>
        </div>

        @if (generating()) {
          <div aria-live="polite">
            <app-local-spinner label="Készülnek a kérdések, és a szerver ellenőrzi az idézeteket… ez legfeljebb 80 másodpercig tart." />
          </div>
        } @else if (result(); as r) {
          <!-- ── Eredmény ─────────────────────────────── -->
          <div class="space-y-4" data-testid="quiz-source-result" aria-live="polite">
            @if (r.created.length > 0) {
              <p class="bg-success-subtle border border-success/40 rounded-xl p-3 text-sm text-success flex items-start gap-2" role="status" data-testid="quiz-source-created">
                <app-icon name="check" class="w-5 h-5 block shrink-0" />
                <span>{{ r.created.length }} kérdés elkészült (jóváhagyásra vár). A kérdéslistában nézd át és hagyd jóvá őket - a magyarázatukban ott a forrás-idézet.</span>
              </p>
            } @else {
              <p class="bg-warning-subtle border border-warning/40 rounded-xl p-3 text-sm text-warning" role="status" data-testid="quiz-source-none">
                Egy kérdés sem ment át az ellenőrzésen.
                @if (r.refunded) { A felhasznált MI-keretet visszakaptad. }
                Próbáld más szöveggel, kevesebb kérdéssel vagy több kérdéstípussal.
              </p>
            }

            @if (r.warnings?.length) {
              <div class="bg-warning-subtle border border-warning/40 rounded-xl p-3 text-sm text-warning" data-testid="quiz-source-warnings">
                <ul class="list-disc pl-5 space-y-0.5">
                  @for (w of r.warnings; track $index) { <li>{{ w }}</li> }
                </ul>
              </div>
            }

            @if (r.dropped.length > 0) {
              <div data-testid="quiz-source-dropped">
                <h3 class="font-semibold text-sm mb-2">Kimaradt kérdések ({{ r.dropped.length }})</h3>
                <ul class="space-y-2">
                  @for (d of r.dropped; track $index) {
                    <li class="bg-bg-element rounded-xl p-3 text-sm">
                      <p class="break-words">{{ d.text || '(üres kérdés)' }}</p>
                      <p class="text-xs text-danger mt-1 break-words">{{ d.reason }}</p>
                    </li>
                  }
                </ul>
              </div>
            }

            <p class="text-xs text-text-muted">{{ r.sourceChars }} karakternyi forrásból.</p>

            <div class="flex flex-wrap justify-end gap-2 pt-1">
              <button type="button" class="btn btn-ghost" (click)="again()" data-testid="quiz-source-again">Újabb kérdések</button>
              <button type="button" class="btn btn-primary" (click)="close()" data-testid="quiz-source-done">Kész</button>
            </div>
          </div>
        } @else {
          <!-- ── Forrás és beállítások ─────────────────────── -->
          <div class="space-y-4" data-testid="quiz-source-input">
            <p id="quiz-source-help" class="text-sm text-text-muted">
              Másold be a tananyagot, vagy tölts fel egy fájlt: az MI ebből készít kérdéseket. Egy készítés egy egység a havi
              keretedből@if (quota(); as q) { ({{ q.used }}/{{ q.limit }} felhasználva)}, a napi MI-keretedet nem érinti. Minden kérdéshez
              szó szerinti idézet kell a szövegből - amit nem talál benne a rendszer, az kimarad. Az elkészült kérdések
              piszkozatként kerülnek a kvízbe, jóváhagyás után válnak a részévé.
            </p>

            @if (blockMessage(); as block) {
              <p class="bg-warning-subtle border border-warning/40 rounded-xl p-3 text-sm text-warning" role="status" data-testid="quiz-source-blocked">{{ block }}</p>
            } @else if (quota(); as q) {
              <p class="text-xs text-text-muted" data-testid="quiz-source-quota">Havi keret: ebben a hónapban még {{ remaining(q) }} / {{ q.limit }} generálás.</p>
            }

            <div role="radiogroup" aria-label="A forrás" class="flex flex-wrap gap-2">
              @for (m of modes; track m.value) {
                <label class="flex items-center gap-2 rounded-xl px-3 py-2 border border-border-default text-sm" [class.border-primary]="mode() === m.value">
                  <input type="radio" name="quiz-source-mode" [value]="m.value" [checked]="mode() === m.value" (change)="setMode(m.value)"
                    [attr.data-testid]="'quiz-source-mode-' + m.value" />
                  {{ m.label }}
                </label>
              }
            </div>

            @if (mode() === 'text') {
              <div>
                <label for="quiz-source-text" class="text-sm font-medium block mb-1">Tananyag</label>
                <textarea id="quiz-source-text" rows="10" class="input !text-sm" [maxLength]="maxChars" aria-describedby="quiz-source-counter"
                  [ngModel]="text()" (ngModelChange)="text.set($event)" [ngModelOptions]="{ standalone: true }"
                  placeholder="Illeszd be ide a tananyag szövegét (legalább 200 karakter)…" data-testid="quiz-source-text"></textarea>
                <p id="quiz-source-counter" class="text-xs mt-1" [class.text-text-muted]="!textTooShort()" [class.text-warning]="textTooShort()"
                  data-testid="quiz-source-counter">
                  {{ charCount() }} / {{ maxCharsLabel }} karakter
                  @if (textTooShort()) { · legalább {{ minChars }} kell }
                </p>
              </div>
            } @else {
              <div>
                <label for="quiz-source-file" class="text-sm font-medium block mb-1">Fájl (.txt, .docx vagy .pdf, legfeljebb 10 MB)</label>
                <input id="quiz-source-file" type="file" accept=".txt,.docx,.pdf" class="input !text-sm" (change)="onFile($event)" data-testid="quiz-source-file" />
                @if (file(); as f) {
                  <p class="text-xs text-text-muted mt-1 break-all" data-testid="quiz-source-file-name">{{ f.name }} ({{ sizeLabel(f.size) }})</p>
                }
                @if (fileError()) {
                  <p class="text-xs text-danger mt-1" role="alert" data-testid="quiz-source-file-error">{{ fileError() }}</p>
                }
                <p class="text-xs text-text-muted mt-1">
                  Szkennelt (kép) PDF-ből nem olvasható ki a szöveg - akkor másold be. Hosszú PDF-ből csak az első 20 oldal szövege kerül be.
                </p>
              </div>
            }

            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label class="block">
                <span class="text-sm text-text-muted">Témakör</span>
                <select class="input mt-1" [ngModel]="topicId()" (ngModelChange)="topicId.set($event)" [ngModelOptions]="{ standalone: true }"
                  data-testid="quiz-source-topic">
                  <option [ngValue]="null" disabled>Válassz…</option>
                  @for (t of topics(); track t.id) { <option [ngValue]="t.id">{{ t.name }}</option> }
                </select>
              </label>
              <label class="block">
                <span class="text-sm text-text-muted">Darabszám (1–{{ maxCount }})</span>
                <input type="number" min="1" [max]="maxCount" class="input mt-1" [ngModel]="count()" (ngModelChange)="count.set($event)"
                  [ngModelOptions]="{ standalone: true }" data-testid="quiz-source-count" />
              </label>
              <label class="block">
                <span class="text-sm text-text-muted">Nehézség</span>
                <select class="input mt-1" [ngModel]="difficulty()" (ngModelChange)="difficulty.set($event)" [ngModelOptions]="{ standalone: true }"
                  data-testid="quiz-source-difficulty">
                  @for (d of difficulties; track d.value) { <option [ngValue]="d.value">{{ d.label }}</option> }
                </select>
              </label>
            </div>

            <fieldset>
              <legend class="text-sm text-text-muted mb-1">Kérdéstípusok</legend>
              <div class="flex flex-wrap gap-x-4 gap-y-1">
                @for (t of types; track t.value) {
                  <label class="flex items-center gap-2 text-sm">
                    <input type="checkbox" [checked]="selectedTypes().has(t.value)" (change)="toggleType(t.value)"
                      [attr.data-testid]="'quiz-source-type-' + t.value" />
                    {{ t.label }}
                  </label>
                }
              </div>
              @if (selectedTypes().size === 0) {
                <p class="text-xs text-warning mt-1">Legalább egy kérdéstípust válassz.</p>
              }
            </fieldset>

            @if (error()) {
              <p class="bg-danger-subtle border border-danger/40 rounded-xl p-3 text-sm text-danger" role="alert" data-testid="quiz-source-error">{{ error() }}</p>
            }

            <div class="flex flex-wrap justify-end gap-2">
              <button type="button" class="btn btn-ghost" (click)="close()">Mégse</button>
              <button type="button" class="btn btn-primary" (click)="generate()" [disabled]="!canGenerate()" data-testid="quiz-source-generate">
                Kérdések készítése
              </button>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class KvizSzovegbolComponent implements OnInit {
  private readonly service = inject(TeacherQuizService);
  private readonly reports = inject(ReportService);
  private readonly destroyRef = inject(DestroyRef);
  /** A folyamatban lévő kérés - bezáráskor megszakítjuk (a válasz ne írjon egy már nem látható ablakba). */
  private request: Subscription | null = null;

  readonly quizId = input.required<number>();
  readonly topics = input.required<QuizTopicOptionDto[]>();
  /** A kezdő témakör (a szerkesztő AI-szekciójában kiválasztott), ha van. */
  readonly initialTopicId = input<number | null>(null);
  readonly closed = output<void>();
  /**
   * Változhatott a kvíz kérdéslistája - a szerkesztő újratölti. Az érték az elkészült kérdések száma; 0, ha futó kérés
   * közben zárták be az ablakot (a szerver addigra menthetett).
   */
  readonly changed = output<number>();

  readonly minChars = SOURCE_MIN_CHARS;
  readonly maxChars = SOURCE_MAX_CHARS;
  readonly maxCharsLabel = SOURCE_MAX_CHARS.toLocaleString('hu-HU');
  readonly modes: { value: SourceMode; label: string }[] = [
    { value: 'text', label: 'Szöveg beillesztése' },
    { value: 'file', label: 'Fájl feltöltése' },
  ];
  readonly types = (Object.keys(QUIZ_SOURCE_TYPE_LABELS) as QuizSourceQuestionType[]).map((value) => ({ value, label: QUIZ_SOURCE_TYPE_LABELS[value] }));
  readonly difficulties = (Object.keys(QUIZ_DIFFICULTY_LABELS) as QuizDifficulty[]).map((value) => ({ value, label: QUIZ_DIFFICULTY_LABELS[value] }));

  readonly mode = signal<SourceMode>('text');
  readonly text = signal('');
  readonly file = signal<File | null>(null);
  readonly fileError = signal<string | null>(null);
  readonly topicId = signal<number | null>(null);
  readonly count = signal<number>(5);
  readonly difficulty = signal<QuizDifficulty>('Medium');
  readonly selectedTypes = signal<Set<QuizSourceQuestionType>>(new Set(['single', 'multi', 'truefalse', 'cloze']));

  readonly maxCount = SOURCE_MAX_COUNT;
  readonly remaining = quotaRemaining;
  /** A havi keret (betöltéskor és minden válasz után); null: nem ismert. */
  readonly quota = signal<AiHelperQuotaItemDto | null>(null);
  /** false: nem Prémium tanár (a keret-végpontból vagy a hibából). */
  readonly premium = signal<boolean | null>(null);
  /** Prémium hiánya / elfogyott keret: a készítés tiltott, és ez a magyarázat. */
  readonly blockMessage = computed(() => {
    if (this.premium() === false) return AI_HELPER_PREMIUM_TEXT;
    const q = this.quota();
    if (q && quotaRemaining(q) === 0) return `Elfogyott a havi kereted (${q.limit} generálás / hó) - a következő hónapban újra kérhetsz.`;
    return null;
  });

  readonly generating = signal(false);
  readonly error = signal<string | null>(null);
  readonly result = signal<QuizSourceResultDto | null>(null);

  readonly charCount = computed(() => this.text().trim().length);
  readonly textTooShort = computed(() => this.charCount() > 0 && this.charCount() < SOURCE_MIN_CHARS);

  readonly canGenerate = computed(() => {
    if (this.generating() || this.blockMessage() || this.topicId() == null || this.selectedTypes().size === 0) return false;
    const count = Number(this.count());
    if (!Number.isInteger(count) || count < 1 || count > SOURCE_MAX_COUNT) return false;
    return this.mode() === 'text'
      ? this.charCount() >= SOURCE_MIN_CHARS && this.charCount() <= SOURCE_MAX_CHARS
      : this.file() !== null && this.fileError() === null;
  });

  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  ngOnInit(): void {
    const initial = this.initialTopicId();
    this.topicId.set(initial != null && this.topics().some((t) => t.id === initial) ? initial : null);
    // A keret csak tájékoztatás: ha nem jön meg, a szerver úgyis érthető hibát ad.
    this.reports
      .getAiHelperQuota()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (q) => {
          this.premium.set(q.premium);
          if (!this.quota()) this.quota.set(q.quizSource);
        },
        error: () => {},
      });
    setTimeout(() => this.dialog()?.nativeElement.focus());
  }

  setMode(mode: SourceMode): void {
    this.mode.set(mode);
    this.error.set(null);
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.file.set(file);
    this.error.set(null);
    if (!file) {
      this.fileError.set(null);
      return;
    }
    const name = file.name.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext))) this.fileError.set('Csak .txt, .docx vagy .pdf fájl tölthető fel.');
    else if (file.size > SOURCE_MAX_FILE_BYTES) this.fileError.set('A fájl túl nagy (legfeljebb 10 MB).');
    else if (file.size === 0) this.fileError.set('A fájl üres.');
    else this.fileError.set(null);
  }

  toggleType(type: QuizSourceQuestionType): void {
    this.selectedTypes.update((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  generate(): void {
    if (!this.canGenerate()) return;
    this.generating.set(true);
    this.error.set(null);
    const quizId = this.quizId();
    this.request = this.service
      .generateFromSource(quizId, {
        text: this.mode() === 'text' ? this.text().trim() : null,
        file: this.mode() === 'file' ? this.file() : null,
        topicId: this.topicId()!,
        count: Number(this.count()),
        difficulty: this.difficulty(),
        // A rögzített sorrend a teszthez és a naplóhoz.
        questionTypes: this.types.map((t) => t.value).filter((t) => this.selectedTypes().has(t)),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.request = null;
          this.generating.set(false);
          this.result.set(res);
          if (res.quota) this.quota.set(res.quota);
          if (res.created.length > 0) this.changed.emit(res.created.length);
        },
        error: (err) => {
          this.request = null;
          this.generating.set(false);
          const block = aiHelperBlock(err);
          if (block === 'premium') this.premium.set(false);
          if (block === 'quota') {
            const q = this.quota();
            if (q) this.quota.set({ ...q, used: q.limit });
          }
          this.error.set(block ? null : sourceErrorMessage(err));
          if (block && !this.blockMessage()) this.error.set(sourceErrorMessage(err));
        },
      });
  }

  /** Vissza a beállításokhoz (a szöveg és a beállítások megmaradnak). */
  again(): void {
    this.result.set(null);
    this.error.set(null);
  }

  close(): void {
    // A futó kérés megszakítva: a válasz már nem ír ebbe az ablakba. A szerver addigra menthetett - a szerkesztő újratölt.
    if (this.request) {
      this.request.unsubscribe();
      this.request = null;
      this.changed.emit(0);
    }
    this.generating.set(false);
    this.closed.emit();
  }

  sizeLabel(bytes: number): string {
    return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
}
