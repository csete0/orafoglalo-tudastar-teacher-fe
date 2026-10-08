import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TeacherTaskDto } from '../../models/teacher-content.model';
import { TeacherRubricService } from '../../services/teacher-rubric/teacher-rubric.service';
import { ToastService } from '../../shared/toast/toast.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';

/** A backend ProgramLanguages.ReadsInput mintája: csak a konzolról olvasás számít, a fájlbeolvasás nem. */
const READS_STDIN =
  /\binput\s*\(|Console\.Read|System\.in\b|sys\.stdin|\bcin\s*>>|\bscanf\s*\(|\bgetline\s*\(\s*cin|require\(\s*['"]readline|process\.stdin|\bprompt\s*\(/i;

/** Olvas-e a feladat összevont megoldása a billentyűzetről (bármelyik nyelven). */
export function readsKeyboardInput(task: TeacherTaskDto): boolean {
  return task.completeSolutionSnippets.some((s) => READS_STDIN.test(s.code ?? ''));
}

/** A BE-vel azonos korlát (64 KB, UTF-8 bájtban). */
const MAX_STDIN_BYTES = 64 * 1024;

/**
 * „Tesztbemenet” egy kód-feladat kártyáján (PATRICKS-TANARI-SZEMPONTLISTA-TERV.md, I): amit a
 * felhasználó a billentyűzeten beírna, soronként. A futtatásos ellenőrzés ezzel futtatja a tanár
 * megoldását és a diák programját is; véletlenszámos programnál a futtatásos összevetés kimarad.
 *
 * Ha a megoldás nem olvas a billentyűzetről (és nincs tárolt bemenet), a rész összecsukva
 * indul. Mentés után a `saved` jelez - a szerkesztő ekkor az „Automatikus javítás” blokkot
 * újratölti. Az `open()` kinyitja és ide görget (a blokk „stdin” teendője hívja).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-tesztbemenet',
  standalone: true,
  imports: [FormsModule, IconComponent],
  template: `
    <div #panel class="bg-bg-panel rounded-xl p-3 scroll-mt-24" data-testid="run-input-panel">
      <button type="button" class="w-full flex items-center justify-between gap-2 text-left"
        [attr.aria-expanded]="expanded()" (click)="expanded.set(!expanded())" data-testid="run-input-toggle">
        <span class="text-sm font-medium">Tesztbemenet (billentyűzetről beolvasott adatok)</span>
        <span class="flex items-center gap-2 shrink-0 text-xs text-text-muted">
          @if (summary(); as s) { <span data-testid="run-input-summary">{{ s }}</span> }
          <app-icon name="chevron-down" class="w-4 h-4 block transition-transform" [class.rotate-180]="expanded()" />
        </span>
      </button>

      @if (expanded()) {
        <div class="mt-2 space-y-2">
          <p class="text-xs text-text-muted">
            Ha a programod a billentyűzetről olvas (pl. <code class="font-mono">input()</code>,
            <code class="font-mono">Console.ReadLine()</code>, <code class="font-mono">Scanner</code>), írd ide,
            amit a felhasználó beírna – soronként egy bemenetet. Ezzel futtatjuk a megoldásodat és a diákok
            programját is, és a kettő kimenetét részfeladatonként összevetjük.
          </p>
          <p class="text-xs text-text-muted">Példa: ha a program előbb egy nevet, majd egy életkort kér, írd két sorba: <code class="font-mono">Anna</code>, alá <code class="font-mono">17</code>.</p>
          <textarea #stdinField rows="4" spellcheck="false" aria-label="Tesztbemenet"
            [ngModel]="stdin()" (ngModelChange)="stdin.set($event)"
            [ngModelOptions]="{ standalone: true }"
            placeholder="Anna&#10;17"
            class="input !bg-bg-element !px-2 !py-1 !text-xs font-mono" data-testid="run-input-stdin"></textarea>
          <label class="flex items-start gap-2 text-sm">
            <input type="checkbox" class="mt-0.5" [ngModel]="isRandom()" (ngModelChange)="isRandom.set($event)"
              [ngModelOptions]="{ standalone: true }" data-testid="run-input-random" />
            <span>
              A program véletlenszámokat használ
              <span class="block text-xs text-text-muted">A kimenete futásonként más, ezért a futtatásos összevetés kimarad – az MI a kód alapján pontoz.</span>
            </span>
          </label>
          @if (tooLarge()) {
            <p class="text-xs text-danger">A tesztbemenet legfeljebb 64 KB lehet.</p>
          }
          @if (error()) {
            <p class="text-xs text-danger">{{ error() }}</p>
          }
          <button type="button" (click)="save()" [disabled]="saving() || !loaded() || tooLarge()"
            class="btn btn-primary !px-3 !py-1" data-testid="run-input-save">
            Mentés
          </button>
        </div>
      }
    </div>
  `,
})
export class TesztbemenetComponent {
  private readonly rubricService = inject(TeacherRubricService);
  private readonly toastService = inject(ToastService);

  readonly taskSetId = input.required<number>();
  readonly task = input.required<TeacherTaskDto>();
  readonly saved = output<void>();

  readonly stdin = signal('');
  readonly isRandom = signal(false);
  readonly expanded = signal(false);
  readonly loaded = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  /** A mentett állapot rövid jelzése az összecsukott fejlécben. */
  readonly summary = signal<string | null>(null);

  readonly tooLarge = computed(() => new TextEncoder().encode(this.stdin()).length > MAX_STDIN_BYTES);

  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly stdinField = viewChild<ElementRef<HTMLTextAreaElement>>('stdinField');

  // A tárolt bemenet csak a feladat cseréjekor töltődik újra: a store minden mutáció után új
  // `task` objektumot ad, ami nem írhatja felül a tanár éppen gépelt, még nem mentett bemenetét.
  private readonly taskId = computed(() => this.task().id);
  private readonly readsInput = computed(() => readsKeyboardInput(this.task()));

  constructor() {
    effect(() => {
      const taskSetId = this.taskSetId();
      const taskId = this.taskId();
      untracked(() => this.load(taskSetId, taskId));
    });
    // Ha a megoldás később kap billentyűzetes beolvasást, a rész kinyílik.
    effect(() => {
      if (this.readsInput()) untracked(() => this.expanded.set(true));
    });
  }

  /** Kinyitja és ide görget (az „Automatikus javítás” blokk „stdin” teendőjéből). */
  open(): void {
    this.expanded.set(true);
    setTimeout(() => {
      this.panel().nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      this.stdinField()?.nativeElement.focus({ preventScroll: true });
    });
  }

  save(): void {
    if (this.saving() || this.tooLarge()) return;
    this.saving.set(true);
    this.error.set(null);
    const stdin = this.stdin().trim() ? this.stdin() : null;
    this.rubricService.saveRunInput(this.taskSetId(), this.taskId(), { stdin, isRandom: this.isRandom() }).subscribe({
      next: (result) => {
        this.saving.set(false);
        this.apply(result.stdin, result.isRandom);
        this.toastService.success(result.stdin || result.isRandom ? 'Tesztbemenet mentve.' : 'Tesztbemenet törölve.');
        this.saved.emit();
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(extractErrorMessage(err, 'A tesztbemenet mentése nem sikerült.'));
      },
    });
  }

  private load(taskSetId: number, taskId: number): void {
    this.loaded.set(false);
    this.error.set(null);
    this.rubricService.getRunInput(taskSetId, taskId).subscribe({
      next: (result) => {
        this.apply(result.stdin, result.isRandom);
        if (result.stdin || result.isRandom) this.expanded.set(true);
        this.loaded.set(true);
      },
      error: (err) => this.error.set(extractErrorMessage(err, 'A tesztbemenet nem kérhető le.')),
    });
  }

  private apply(stdin: string | null, isRandom: boolean): void {
    // A BE sortöréssel zárja a bemenetet; a szerkesztőben a záró sortörés csak üres sornak látszana.
    this.stdin.set((stdin ?? '').replace(/\n$/, ''));
    this.isRandom.set(isRandom);
    const lines = stdin ? stdin.replace(/\n$/, '').split('\n').length : 0;
    this.summary.set(isRandom ? 'véletlenszámos' : lines > 0 ? `${lines} sor mentve` : null);
  }
}
