import { ChangeDetectionStrategy, Component, computed, DestroyRef, ElementRef, inject, input, OnInit, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { concat, Subscription, toArray } from 'rxjs';
import {
  ClassTestFeedbackDraftDto,
  ClassTestFeedbackItem,
  ClassTestStudentRow,
  FEEDBACK_DRAFT_BATCH,
  FEEDBACK_MAX_CHARS,
  FEEDBACK_SAVE_BATCH,
} from '../../models/class-test.model';
import { ClassTestService } from '../../services/class-test/class-test.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';
import { IconComponent } from '../../shared/icon/icon.component';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';

/** Egy diák sora a párbeszédablakban. */
export interface FeedbackRow {
  userId: number;
  name: string;
  examSessionId: number | null;
  /** Beadta a dolgozatot - csak ilyen munkamenetre menthető visszajelzés. */
  submitted: boolean;
  /** A szerver válasza (null: még nem jött meg). */
  draft: ClassTestFeedbackDraftDto | null;
  /** A már elmentett visszajelzés (az áttekintőből, majd a vázlat-válaszból). */
  saved: string | null;
  /** A szerkesztett szöveg. */
  text: string;
}

/** A vázlat-hívás hibája érthető magyar mondatként. */
export function draftErrorMessage(err: unknown): string {
  const status = (err as { status?: number })?.status;
  if (status === 429) return 'Rövid időn belül túl sok vázlatot kértél - várj néhány percet, és folytasd.';
  if (status === 0) return 'Nem sikerült elérni a szervert - ellenőrizd az internetkapcsolatot, és folytasd.';
  return extractErrorMessage(err, 'A vázlatok elkészítése nem sikerült.');
}

const norm = (s: string | null | undefined) => (s ?? '').trim();

/**
 * „Visszajelzések AI-vázlattal” a dolgozat-áttekintőben: diákonként egy, a dolgozat egészére szóló szöveg. Az MI a pontokból
 * és az értékelés tényeiből vázlatot ír (a tanár napi MI-keretéből; a számokat a szerver ellenőrzi), a tanár átírja, és
 * egyben menti. Az időkeretből kimaradt diákokat („pending”) a felület magától újra kéri, haladásjelzéssel. A mentés a pontot
 * nem módosítja; a diák a szöveget az eredmények közzététele után látja.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-dolgozat-visszajelzes',
  standalone: true,
  imports: [FormsModule, IconComponent],
  template: `
    <div class="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" (keydown.escape)="close()">
      <!-- fixed, nem absolute: a görgethető ablak-tartalom alatt is az egész képernyőt takarja. -->
      <div class="fixed inset-0 bg-black/40" data-testid="feedback-backdrop" (click)="close()"></div>
      <div #dialog role="dialog" aria-modal="true" aria-labelledby="feedback-title" aria-describedby="feedback-help" tabindex="-1"
        data-testid="feedback-dialog" class="card relative w-full max-w-3xl min-w-0 p-4 sm:p-6 shadow-xl my-8 sm:my-auto outline-none">
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="flex items-center gap-3 min-w-0">
            <div class="icon-tile icon-tile-primary shrink-0"><app-icon name="sparkles" class="w-5 h-5 block" /></div>
            <h2 id="feedback-title" class="font-bold text-lg">Visszajelzések AI-vázlattal</h2>
          </div>
          <button type="button" class="btn btn-ghost !p-1.5" aria-label="Bezárás" (click)="close()" [disabled]="saving()" data-testid="feedback-close">
            <app-icon name="x" class="w-5 h-5 block" />
          </button>
        </div>

        <div id="feedback-help" class="text-sm text-text-muted space-y-1 mb-4">
          <p>
            Az MI a pontokból és az értékelésből diákonként rövid vázlatot ír a napi MI-keretedből; a benne szereplő számokat a
            rendszer ellenőrzi. Írd át nyugodtan - a pontokat a mentés nem változtatja meg.
          </p>
          <p class="font-medium" [class.text-warning]="published()" data-testid="feedback-visibility">
            @if (published()) {
              Az eredmény már közzé van téve: a diákok mentés után azonnal látják, és értesítést kapnak.
            } @else {
              A diákok a visszajelzést az eredmények közzététele után látják.
            }
          </p>
        </div>

        <!-- Haladás -->
        <div aria-live="polite" class="mb-3">
          @if (drafting()) {
            <div data-testid="feedback-progress">
              <p class="text-sm mb-1">Vázlatok készülnek… {{ processed() }} / {{ total() }} diák kész</p>
              <div class="h-2 rounded-full bg-bg-element overflow-hidden" role="progressbar" aria-label="Vázlatok készítése"
                [attr.aria-valuenow]="processed()" aria-valuemin="0" [attr.aria-valuemax]="total()">
                <div class="h-full bg-primary transition-all" [style.width.%]="total() ? (100 * processed()) / total() : 0"></div>
              </div>
            </div>
          } @else if (remaining() > 0) {
            <div class="bg-warning-subtle border border-warning/40 rounded-xl p-3 text-sm text-warning flex flex-wrap items-center justify-between gap-2"
              role="status" data-testid="feedback-remaining">
              <span>
                @if (draftError()) { {{ draftError() }} }
                @else { {{ remaining() }} diák vázlata nem fért bele az időbe. }
              </span>
              <button type="button" class="btn btn-primary !px-3 !py-1" (click)="resume()" data-testid="feedback-resume">Folytatás ({{ remaining() }})</button>
            </div>
          }
        </div>

        <ul class="space-y-3" data-testid="feedback-list">
          @for (row of rows(); track row.userId) {
            <li class="bg-bg-element rounded-xl p-3" [attr.data-testid]="'feedback-row-' + row.userId">
              <div class="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                <span class="font-medium">{{ row.name }}</span>
                <span class="text-xs text-text-muted tabular-nums">
                  @if (row.draft?.earnedPoints != null) { {{ row.draft!.earnedPoints }} / {{ row.draft!.maxPoints }} pont }
                  @if (statusLabel(row); as label) { · {{ label }} }
                </span>
              </div>

              @if (isEditable(row)) {
                @if (row.draft?.status === 'failed') {
                  <p class="text-xs text-danger mb-1" [attr.data-testid]="'feedback-failed-' + row.userId">Nem készült vázlat: {{ row.draft!.reason }} - írd meg kézzel.</p>
                }
                @if (row.saved && row.draft?.draft && norm(row.draft!.draft) !== norm(row.text)) {
                  <div class="text-xs text-text-muted mb-1 flex flex-wrap items-center gap-2" [attr.data-testid]="'feedback-has-saved-' + row.userId">
                    <span>Már van elmentett visszajelzés - azt látod a mezőben.</span>
                    <button type="button" class="btn btn-ghost !px-2 !py-0.5 !text-xs" (click)="useDraft(row)" [attr.data-testid]="'feedback-use-draft-' + row.userId">
                      AI-vázlat használata
                    </button>
                  </div>
                }
                <label class="sr-only" [for]="'feedback-text-' + row.userId">{{ row.name }} visszajelzése</label>
                <textarea [id]="'feedback-text-' + row.userId" rows="4" class="input !bg-bg-panel !text-sm" [maxLength]="maxChars"
                  [ngModel]="row.text" (ngModelChange)="setText(row.userId, $event)" [ngModelOptions]="{ standalone: true }"
                  [disabled]="saving()" [attr.data-testid]="'feedback-text-' + row.userId"></textarea>
                <p class="text-xs mt-1 flex flex-wrap justify-between gap-2">
                  <span [class.text-warning]="isDeleting(row)" class="text-text-muted">
                    @if (isDeleting(row)) { A mentéskor az elmentett visszajelzés törlődik. }
                    @else if (isChanged(row)) { Módosítva. }
                  </span>
                  <span class="text-text-muted tabular-nums">{{ row.text.length }} / {{ maxChars }}</span>
                </p>
              } @else if (row.draft?.status === 'skipped') {
                <p class="text-sm text-text-muted" [attr.data-testid]="'feedback-skipped-' + row.userId">Kimarad: {{ row.draft!.reason }}</p>
              } @else if (!row.submitted) {
                <p class="text-sm text-text-muted">Nem adta be a dolgozatot.</p>
              } @else if (row.draft?.status === 'pending') {
                <p class="text-sm text-text-muted" [attr.data-testid]="'feedback-pending-' + row.userId">A vázlat még nem készült el.</p>
              } @else {
                <p class="text-sm text-text-muted">Vázlat készül…</p>
              }
            </li>
          }
        </ul>

        @if (saveError()) {
          <p class="bg-danger-subtle border border-danger/40 rounded-xl p-3 text-sm text-danger mt-3" role="alert" data-testid="feedback-save-error">{{ saveError() }}</p>
        }

        <div class="flex flex-wrap items-center justify-end gap-2 mt-4">
          <span class="text-sm text-text-muted mr-auto" data-testid="feedback-change-count">{{ changes().length }} módosított visszajelzés</span>
          <button type="button" class="btn btn-ghost" (click)="close()" [disabled]="saving()">Mégse</button>
          <button type="button" class="btn btn-primary" (click)="save()" [disabled]="!canSave()" data-testid="feedback-save">
            {{ saving() ? 'Mentés…' : 'Mentés' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class DolgozatVisszajelzesComponent implements OnInit {
  private readonly service = inject(ClassTestService);
  private readonly confirmService = inject(ConfirmService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly assignmentId = input.required<number>();
  /** Az áttekintő névsora (a megnyitáskori állapot - az élő frissítés nem írja át a szerkesztést). */
  readonly students = input.required<ClassTestStudentRow[]>();
  /** Közzétett eredmény: a mentés után a diák azonnal látja. */
  readonly published = input(false);
  readonly closed = output<void>();
  /** Sikeres mentés után - az áttekintő újratölt. */
  readonly saved = output<void>();

  readonly maxChars = FEEDBACK_MAX_CHARS;
  readonly norm = norm;

  readonly rows = signal<FeedbackRow[]>([]);
  readonly drafting = signal(false);
  readonly draftError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  /** A még kérendő diákok (az időkeretből kimaradtak elöl). */
  private readonly queue = signal<number[]>([]);
  readonly total = signal(0);
  readonly remaining = computed(() => this.queue().length);
  readonly processed = computed(() => this.total() - this.remaining());

  /** A futó vázlat-kérés; bezáráskor megszakítjuk. A sorszám az elavult válaszokat szűri. */
  private draftRequest: Subscription | null = null;
  private generation = 0;

  readonly changes = computed<ClassTestFeedbackItem[]>(() =>
    this.rows()
      .filter((r) => this.isEditable(r) && this.isChanged(r))
      .map((r) => ({ examSessionId: r.examSessionId!, feedback: norm(r.text) || null })),
  );
  readonly tooLong = computed(() => this.rows().some((r) => r.text.length > FEEDBACK_MAX_CHARS));
  readonly canSave = computed(() => !this.saving() && !this.drafting() && this.changes().length > 0 && !this.tooLong());

  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  ngOnInit(): void {
    const students = this.students();
    this.rows.set(
      students.map((s) => ({
        userId: s.userId,
        name: s.name,
        examSessionId: s.examSessionId,
        submitted: s.status === 'submitted',
        draft: null,
        saved: s.teacherFeedback ?? null,
        text: s.teacherFeedback ?? '',
      })),
    );
    // Csak beadott dolgozathoz kérünk vázlatot - a többinek nincs miből (és a keretet sem terheli).
    const wanted = students.filter((s) => s.status === 'submitted').map((s) => s.userId);
    this.total.set(wanted.length);
    this.queue.set(wanted);
    this.next();
    setTimeout(() => this.dialog()?.nativeElement.focus());
  }

  /** A következő legfeljebb 60 diák vázlata; a kimaradtak („pending”) a sor elejére kerülnek, és újra kérjük őket. */
  private next(): void {
    const queue = this.queue();
    if (queue.length === 0) {
      this.drafting.set(false);
      return;
    }
    const batch = queue.slice(0, FEEDBACK_DRAFT_BATCH);
    const generation = ++this.generation;
    this.drafting.set(true);
    this.draftError.set(null);
    this.draftRequest = this.service
      .draftFeedback(this.assignmentId(), batch)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          if (generation !== this.generation) return;
          this.draftRequest = null;
          this.merge(res.items);
          const pending = new Set(res.pendingUserIds);
          const stillPending = batch.filter((id) => pending.has(id));
          this.queue.set([...stillPending, ...this.queue().slice(batch.length)]);
          // Előrehaladás nélkül nem kérünk újra (különben végtelen ciklus) - a tanár a „Folytatás”-sal indíthatja.
          if (stillPending.length === batch.length) {
            this.drafting.set(false);
            return;
          }
          this.next();
        },
        error: (err) => {
          if (generation !== this.generation) return;
          this.draftRequest = null;
          this.drafting.set(false);
          this.draftError.set(draftErrorMessage(err));
        },
      });
  }

  resume(): void {
    if (this.drafting() || this.saving() || this.remaining() === 0) return;
    this.next();
  }

  private merge(items: ClassTestFeedbackDraftDto[]): void {
    const byUser = new Map(items.map((i) => [i.userId, i]));
    this.rows.update((rows) =>
      rows.map((row) => {
        const item = byUser.get(row.userId);
        if (!item) return row;
        const saved = item.savedFeedback ?? row.saved;
        // Nem írjuk felül, amit a tanár már beírt, és az elmentett szöveget sem - a vázlat ilyenkor gombbal hozható be.
        const untouched = norm(row.text) === norm(row.saved);
        const text = untouched && !saved && item.status === 'ready' && item.draft ? item.draft : untouched ? (saved ?? '') : row.text;
        return { ...row, draft: item, saved, examSessionId: item.examSessionId ?? row.examSessionId, text };
      }),
    );
  }

  isEditable(row: FeedbackRow): boolean {
    return row.submitted && row.examSessionId != null && !!row.draft && (row.draft.status === 'ready' || row.draft.status === 'failed');
  }

  isChanged(row: FeedbackRow): boolean {
    return norm(row.text) !== norm(row.saved);
  }

  isDeleting(row: FeedbackRow): boolean {
    return !!norm(row.saved) && !norm(row.text);
  }

  statusLabel(row: FeedbackRow): string | null {
    if (row.draft?.status === 'ready') return 'AI-vázlat';
    if (row.draft?.status === 'failed') return 'nincs vázlat';
    return null;
  }

  setText(userId: number, text: string): void {
    this.rows.update((rows) => rows.map((r) => (r.userId === userId ? { ...r, text } : r)));
  }

  useDraft(row: FeedbackRow): void {
    if (row.draft?.draft) this.setText(row.userId, row.draft.draft);
  }

  /** Egy tranzakció kérésenként (legfeljebb 200 tétel); hibánál egyik tétel sem mentődik az adott kérésben. */
  save(): void {
    if (!this.canSave()) return;
    const items = this.changes();
    this.saving.set(true);
    this.saveError.set(null);
    const chunks = [];
    for (let i = 0; i < items.length; i += FEEDBACK_SAVE_BATCH) chunks.push(items.slice(i, i + FEEDBACK_SAVE_BATCH));
    concat(...chunks.map((chunk) => this.service.saveFeedback(this.assignmentId(), chunk)))
      .pipe(toArray(), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (results) => {
          this.saving.set(false);
          const saved = results.reduce((sum, r) => sum + r.saved, 0);
          const notified = results.reduce((sum, r) => sum + r.notifiedStudents, 0);
          this.toastService.success(
            `${saved} visszajelzés elmentve.` + (notified > 0 ? ` ${notified} diák értesítést kapott.` : this.published() ? '' : ' A diákok a közzététel után látják.'),
          );
          this.saved.emit();
          this.closed.emit();
        },
        error: (err) => {
          this.saving.set(false);
          this.saveError.set(extractErrorMessage(err, 'A mentés nem sikerült.'));
          // Több részletnél az elsők már elmentődhettek - az áttekintő frissüljön.
          if (chunks.length > 1) this.saved.emit();
        },
      });
  }

  async close(): Promise<void> {
    if (this.saving()) return;
    if (this.changes().length > 0) {
      const ok = await this.confirmService.ask({
        title: 'Nem mentett visszajelzések',
        message: `${this.changes().length} módosított visszajelzés nincs elmentve. Bezárod mentés nélkül?`,
        confirmLabel: 'Bezárás mentés nélkül',
        cancelLabel: 'Vissza',
        danger: true,
      });
      if (!ok) return;
    }
    // A futó vázlat-kérés megszakítva; a késve érkező válasz a sorszám miatt sem írna.
    this.generation++;
    this.draftRequest?.unsubscribe();
    this.draftRequest = null;
    this.drafting.set(false);
    this.closed.emit();
  }
}
