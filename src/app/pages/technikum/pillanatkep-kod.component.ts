import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subscription, finalize, take } from 'rxjs';
import { TeacherTechnikumService } from '../../services/technikum/teacher-technikum.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { CodeFileRank, KodOlvasoComponent, codeFilePaths } from '../../shared/kod-olvaso/kod-olvaso.component';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';
import { AiHelperQuotaItemDto, aiHelperErrorMessage } from '../../shared/ai-helper-quota.util';
import { parseUtc } from '../../shared/utc-date.util';
import { CodeCommentSuggestionDto } from '../../models/teacher-project.model';
import { DESKTOP_LANGUAGE_LABEL, EXAM_PART_LABEL, EXAM_PART_ROOTS, ExamCodeCommentDto, ExamPartKey, ExamSessionSnapshotDto } from '../../models/technikum.model';

/** A pillanatkép fülei: az öt vizsgarész és a részekhez nem tartozó (pl. hivatalos adat-) fájlok. */
type Tab = ExamPartKey | 'egyeb';

/** Az asztali részek (konzolos, grafikus): ezek nyelve a munkamenet nyelve (C# / Java). */
const DESKTOP_PARTS: readonly Tab[] = ['console', 'gui'];

const HAND_WRITTEN_SOURCES = ['.cs', '.xaml', '.java', '.fxml'];

/**
 * Az asztali részek fájlsorrendje (BE: ExamCodeCommentService.Priority): előbb a kézzel írt forrás (.cs, .xaml, .java, .fxml),
 * aztán a generált (.Designer.cs), végül minden más (projektfájlok: .csproj, pom.xml, build.gradle…, adatfájlok).
 */
export const desktopFileRank: CodeFileRank = (path) => {
  const p = path.toLowerCase();
  if (p.endsWith('.designer.cs')) return 1;
  return HAND_WRITTEN_SOURCES.some((x) => p.endsWith(x)) ? 0 : 2;
};

/** Kliens-oldali (nem mentett) MI-javaslat; a `key` csak a felületen azonosít. */
interface Suggestion extends CodeCommentSuggestionDto {
  key: number;
  partKey: ExamPartKey;
}

/**
 * A beadott technikumi dolgozat kódja vizsgarészenként (a tanári pillanatképben): a részek fájljai csak olvasva, a sorszámra
 * kattintva soronkénti megjegyzés (írás, szerkesztés, törlés - a diák a közzététel után látja), a grafikus résznél a
 * képernyőképek nagyítható galériája és a feltöltött zip forrásfájljai. „MI-javaslat”: soronkénti javaslatok a rész fájljaira
 * (havi keret), amelyekből csak az elfogadottak lesznek megjegyzések.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-pillanatkep-kod',
  standalone: true,
  imports: [DatePipe, KodOlvasoComponent],
  host: { '(document:keydown.escape)': 'closeLightbox()' },
  template: `
    <div class="mt-4" data-testid="snapshot-code">
      <div class="flex flex-wrap gap-1.5" role="tablist" aria-label="Vizsgarészek">
        @for (t of tabs(); track t.key) {
          <button type="button" role="tab" class="part-tab" [attr.aria-selected]="tab() === t.key" [attr.data-testid]="'part-tab-' + t.key"
                  (click)="selectTab(t.key)">
            {{ t.label }}
            @if (t.language) { <span class="lang-badge" [attr.data-testid]="'part-lang-' + t.key">{{ t.language }}</span> }
            @if (t.comments) { <span class="comment-count" [attr.aria-label]="t.comments + ' megjegyzés'">{{ t.comments }}</span> }
          </button>
        }
      </div>

      @if (tab() === 'gui') {
        @if (snapshot().gui; as g) {
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
        } @else {
          <p class="text-sm text-text-muted mt-3" data-testid="gui-missing">A diák a dolgozat alatt nem töltött fel grafikus programot.</p>
        }
      }

      @if (tab() !== 'egyeb' && !locked()) {
        <div class="ai-bar mt-3 flex flex-wrap items-center gap-2">
          <button type="button" class="btn btn-ghost !px-2 !py-1 !text-xs" data-testid="suggest-part" [disabled]="suggesting() || !hasFiles()"
                  (click)="requestSuggestions()">{{ suggesting() ? 'Az MI dolgozik…' : 'MI-javaslat erre a részre' }}</button>
          @if (suggestQuota(); as q) { <span class="text-xs text-text-muted">Havi keret: {{ q.used }}/{{ q.limit }}</span> }
          <span class="text-xs text-text-muted basis-full">A javaslatokat a diák nem látja, és nem mentjük el: csak az elfogadottakból lesz megjegyzés.</span>
          @if (suggestError(); as err) { <p class="text-xs text-danger basis-full" role="alert" data-testid="suggest-error">{{ err }}</p> }
          @if (suggestNote(); as note) { <p class="text-xs text-text-muted basis-full" role="status">{{ note }}</p> }
        </div>
      }

      @if (hasFiles()) {
        <app-kod-olvaso class="block mt-3" [files]="files()" [readOnlyPaths]="snapshot().readOnlyPaths" [fileRank]="fileRank()" [activePath]="activePath()"
                        (activePathChange)="selectFile($event)" [commentable]="commentable()" [markedLines]="markedLines()"
                        [badges]="commentCounts()" [suggestionBadges]="suggestionCounts()" [lineExtras]="threadTpl" (lineClick)="startComment($event)" />
      } @else if (tab() !== 'gui') {
        <p class="text-sm text-text-muted mt-3">Ebben a részben nincs beadott fájl.</p>
      }
      @if (commentError(); as err) { <p class="text-danger text-sm mt-2" role="alert" data-testid="comment-error">{{ err }}</p> }

      <ng-template #threadTpl let-line>
        @for (c of commentsAt(line); track c.id) {
          <div class="thread" [attr.data-testid]="'comment-' + c.id">
            <p class="text-xs text-text-muted">
              <strong class="text-text-primary">{{ c.authorName }}</strong> · {{ utc(c.createdAt) | date: 'MM.dd. HH:mm' }}
              @if (c.updatedAt) { · szerkesztve }
            </p>
            @if (editingId() === c.id) {
              <form (submit)="$event.preventDefault(); saveEdit(c, editBox.value)">
                <label class="sr-only" [for]="'comment-edit-' + c.id">A megjegyzés szövege</label>
                <textarea #editBox [id]="'comment-edit-' + c.id" class="form-input !text-sm w-full mt-1" rows="3" maxlength="2000" [value]="c.body"></textarea>
                <div class="flex gap-2 mt-2">
                  <button type="submit" class="btn btn-primary !px-3 !py-1 !text-xs" [disabled]="busy()">Mentés</button>
                  <button type="button" class="btn btn-ghost !px-3 !py-1 !text-xs" (click)="editingId.set(null)">Mégse</button>
                </div>
              </form>
            } @else {
              <p class="thread-body">{{ c.body }}</p>
              @if (!locked()) {
                <div class="flex gap-2 mt-1">
                  <button type="button" class="btn btn-ghost !px-2 !py-0.5 !text-xs" [disabled]="busy()" (click)="editingId.set(c.id)"
                          [attr.data-testid]="'comment-edit-' + c.id">Szerkeszt</button>
                  <button type="button" class="btn btn-ghost !px-2 !py-0.5 !text-xs text-danger" [disabled]="busy()" (click)="remove(c)"
                          [attr.data-testid]="'comment-delete-' + c.id">Töröl</button>
                </div>
              }
            }
          </div>
        }
        @for (sg of suggestionsAt(line); track sg.key) {
          <form class="suggestion" [attr.data-testid]="'suggestion-' + sg.key" (submit)="$event.preventDefault(); accept(sg, sgBox.value)">
            <p class="text-xs text-text-muted"><span [class]="'sev sev--' + (sg.severity === 'dicséret' ? 'dicseret' : sg.severity)">{{ sg.severity }}</span>
              <strong class="text-text-primary">MI-javaslat</strong> · még nem megjegyzés</p>
            <label class="sr-only" [for]="'suggestion-box-' + sg.key">A javaslat szövege</label>
            <textarea #sgBox [id]="'suggestion-box-' + sg.key" class="form-input !text-sm w-full mt-1" rows="2" maxlength="2000" [value]="sg.text"></textarea>
            <div class="flex gap-2 mt-2">
              <button type="submit" class="btn btn-primary !px-2 !py-1 !text-xs" [disabled]="busy()">Elfogad</button>
              <button type="button" class="btn btn-ghost !px-2 !py-1 !text-xs" (click)="dismiss(sg)">Elvet</button>
            </div>
          </form>
        }
        @if (newLine() === line) {
          <form class="thread" data-testid="new-comment" (submit)="$event.preventDefault(); create(newBox)">
            <label class="text-xs font-semibold" for="snapshot-new-comment">Megjegyzés a(z) {{ line }}. sorhoz</label>
            <textarea #newBox id="snapshot-new-comment" class="form-input !text-sm w-full mt-1" rows="3" maxlength="2000"
                      placeholder="Pl.: Itt mi történik, ha üres a fájl?"></textarea>
            <div class="flex gap-2 mt-2">
              <button type="submit" class="btn btn-primary !px-3 !py-1 !text-xs" [disabled]="busy()">Megjegyzés mentése</button>
              <button type="button" class="btn btn-ghost !px-3 !py-1 !text-xs" (click)="newLine.set(null)">Mégse</button>
            </div>
          </form>
        }
      </ng-template>
    </div>

    @if (lightbox() !== null) {
      <div class="lightbox" role="dialog" aria-modal="true" aria-label="Képernyőkép nagyítva" data-testid="gui-lightbox" (click)="closeLightbox()">
        <img [src]="imageUrls()[lightbox()!]" [alt]="(lightbox()! + 1) + '. képernyőkép'" (click)="$event.stopPropagation()" />
        <div class="lightbox-bar" (click)="$event.stopPropagation()">
          <button type="button" class="btn btn-ghost !text-xs" [disabled]="lightbox() === 0" (click)="step(-1)">‹ Előző</button>
          <span class="text-xs">{{ lightbox()! + 1 }} / {{ imageUrls().length }}</span>
          <button type="button" class="btn btn-ghost !text-xs" [disabled]="lightbox() === imageUrls().length - 1" (click)="step(1)">Következő ›</button>
          <button type="button" class="btn btn-primary !text-xs" (click)="closeLightbox()">Bezárás</button>
        </div>
      </div>
    }
  `,
  styles: [`
    .part-tab { padding: 0.25rem 0.625rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; border: 1px solid var(--color-border-default);
      background: var(--color-bg-panel); color: var(--color-text-primary); }
    .part-tab[aria-selected="true"] { background: var(--color-primary-subtle); border-color: var(--color-primary); color: var(--color-primary); }
    .comment-count { margin-left: 0.25rem; padding: 0 0.375rem; border-radius: 999px; background: var(--color-warning); color: #fff; font-size: 0.625rem; }
    .lang-badge { margin-left: 0.25rem; padding: 0 0.375rem; border-radius: 999px; border: 1px solid currentColor; font-size: 0.625rem; }
    .gallery { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .thumb { display: flex; align-items: center; justify-content: center; width: 10rem; height: 6.5rem; overflow: hidden; border-radius: 0.5rem;
      border: 1px solid var(--color-border-default); background: var(--color-bg-element); }
    .thumb img { width: 100%; height: 100%; object-fit: contain; }
    .thumb:hover, .thumb:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 1px; }
    .lightbox { position: fixed; inset: 0; z-index: 60; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.75rem;
      padding: 1rem; background: rgba(0, 0, 0, 0.8); }
    .lightbox img { max-width: 100%; max-height: calc(100vh - 6rem); object-fit: contain; border-radius: 0.5rem; background: var(--color-bg-panel); }
    .lightbox-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; padding: 0.375rem 0.75rem; border-radius: 0.75rem;
      background: var(--color-bg-panel); color: var(--color-text-primary); }
    .ai-bar { padding: 0.5rem 0.75rem; border-radius: 0.5rem; border: 1px dashed var(--color-primary); }
    .thread, .suggestion { margin: 0.25rem 0.75rem 0.5rem 3rem; padding: 0.5rem 0.75rem; border-radius: 0.5rem; font-family: var(--font-sans, system-ui, sans-serif);
      white-space: normal; }
    .thread { background: var(--color-bg-panel); border: 1px solid var(--color-border-default); }
    .suggestion { border: 1px dashed var(--color-primary); background: var(--color-primary-subtle); }
    .thread-body { margin-top: 0.25rem; font-size: 0.8125rem; white-space: pre-wrap; }
    .sev { display: inline-block; margin-right: 0.375rem; padding: 0 0.375rem; border-radius: 999px; font-size: 0.625rem; font-weight: 700; color: #fff; }
    .sev--hiba { background: var(--color-danger); }
    .sev--javaslat { background: var(--color-primary); }
    .sev--dicseret { background: var(--color-success); }
    @media (max-width: 480px) { .thread, .suggestion { margin-left: 0.5rem; margin-right: 0.5rem; } .thumb { width: 8rem; height: 5.25rem; } }
  `],
})
export class PillanatkepKodComponent {
  private readonly api = inject(TeacherTechnikumService);
  private readonly confirm = inject(ConfirmService);
  private readonly destroyRef = inject(DestroyRef);

  readonly snapshot = input.required<ExamSessionSnapshotDto>();

  readonly utc = parseUtc;
  readonly tab = signal<Tab>('console');
  readonly activePath = signal<string | null>(null);
  readonly comments = signal<ExamCodeCommentDto[]>([]);
  readonly newLine = signal<number | null>(null);
  readonly editingId = signal<number | null>(null);
  readonly busy = signal(false);
  readonly commentError = signal<string | null>(null);
  readonly imageUrls = signal<(string | null)[]>([]);
  readonly imageError = signal<string | null>(null);
  readonly lightbox = signal<number | null>(null);
  readonly suggestions = signal<Suggestion[]>([]);
  readonly suggesting = signal(false);
  readonly suggestError = signal<string | null>(null);
  readonly suggestNote = signal<string | null>(null);
  readonly suggestQuota = signal<AiHelperQuotaItemDto | null>(null);

  private loads: Subscription[] = [];
  private nextKey = 1;

  private readonly roots = computed(() => ({ ...EXAM_PART_ROOTS, ...(this.snapshot().partRoots ?? {}) }));

  /** A részhez nem tartozó fájlok (pl. a hivatalos adatbázis-fájlok) - csak olvasásra. */
  private readonly otherFiles = computed(() => {
    const roots = Object.values(this.roots()).filter((r): r is string => !!r);
    return Object.fromEntries(Object.entries(this.snapshot().files).filter(([p]) => !roots.some((r) => p.startsWith(r))));
  });

  readonly tabs = computed(() => {
    const sn = this.snapshot();
    const keys = sn.session.parts.map((p) => p.partKey);
    const counts = new Map<ExamPartKey, number>();
    for (const c of this.comments()) counts.set(c.partKey, (counts.get(c.partKey) ?? 0) + 1);
    const language = DESKTOP_LANGUAGE_LABEL[sn.desktopLanguage ?? 'csharp'];
    const tabs: { key: Tab; label: string; language: string | null; comments: number }[] = keys.map((k) => ({
      key: k, label: EXAM_PART_LABEL[k] ?? k, language: DESKTOP_PARTS.includes(k) ? language : null, comments: counts.get(k) ?? 0,
    }));
    if (Object.keys(this.otherFiles()).length) tabs.push({ key: 'egyeb', label: 'Egyéb fájlok', language: null, comments: 0 });
    return tabs;
  });

  readonly files = computed(() => this.filesOf(this.tab()));
  readonly fileRank = computed(() => this.rankOf(this.tab()));
  readonly hasFiles = computed(() => Object.keys(this.files()).length > 0);
  /** A diák azóta kilépett a csoportból: a dolgozat csak olvasható (a megjegyzések látszanak, újat írni, MI-javaslatot kérni nem lehet). */
  readonly locked = computed(() => !!this.snapshot().leftGroup);
  /** Megjegyzés csak a rész saját (nem hivatalos, csak olvasható) fájljára írható. */
  readonly commentable = computed(() => {
    const path = this.activePath();
    return !this.locked() && this.tab() !== 'egyeb' && !!path && !this.snapshot().readOnlyPaths.includes(path);
  });

  private readonly activeComments = computed(() =>
    this.comments().filter((c) => c.partKey === this.tab() && c.path === this.activePath()),
  );
  readonly markedLines = computed(() => new Set(this.activeComments().map((c) => c.line)));
  readonly commentCounts = computed(() => {
    const counts: Record<string, number> = {};
    for (const c of this.comments()) if (c.partKey === this.tab()) counts[c.path] = (counts[c.path] ?? 0) + 1;
    return counts;
  });
  readonly suggestionCounts = computed(() => {
    const counts: Record<string, number> = {};
    for (const s of this.suggestions()) if (s.partKey === this.tab()) counts[s.path] = (counts[s.path] ?? 0) + 1;
    return counts;
  });

  constructor() {
    // Új pillanatkép (másik diák / újratöltés pontozás után): ugyanannál a munkamenetnél a fül és a megjegyzések maradnak.
    let sessionId: number | null = null;
    effect(() => {
      const sn = this.snapshot();
      untracked(() => {
        if (sn.sessionId === sessionId) return;
        sessionId = sn.sessionId;
        this.reset();
        this.loadComments(sn.sessionId);
        this.loadImages(sn);
        const first = this.tabs().find((t) => Object.keys(this.filesOf(t.key)).length) ?? this.tabs()[0];
        if (first) this.selectTab(first.key);
      });
    });
    this.destroyRef.onDestroy(() => this.reset());
  }

  private filesOf(tab: Tab): Record<string, string> {
    const sn = this.snapshot();
    if (tab === 'egyeb') return this.otherFiles();
    if (tab === 'gui') return sn.gui?.files ?? {};
    const root = this.roots()[tab];
    return root ? Object.fromEntries(Object.entries(sn.files).filter(([p]) => p.startsWith(root))) : {};
  }

  selectTab(tab: Tab): void {
    this.tab.set(tab);
    this.newLine.set(null);
    this.editingId.set(null);
    this.commentError.set(null);
    this.activePath.set(codeFilePaths(this.filesOf(tab), this.snapshot().readOnlyPaths, this.rankOf(tab))[0] ?? null);
  }

  private rankOf(tab: Tab): CodeFileRank {
    return DESKTOP_PARTS.includes(tab) ? desktopFileRank : () => 0;
  }

  selectFile(path: string | null): void {
    this.activePath.set(path);
    this.newLine.set(null);
    this.editingId.set(null);
  }

  commentsAt(line: number): ExamCodeCommentDto[] {
    return this.activeComments().filter((c) => c.line === line);
  }

  suggestionsAt(line: number): Suggestion[] {
    return this.suggestions().filter((s) => s.partKey === this.tab() && s.path === this.activePath() && s.line === line);
  }

  startComment(line: number): void {
    if (!this.commentable()) return;
    this.commentError.set(null);
    this.newLine.set(line);
  }

  create(box: HTMLTextAreaElement): void {
    const path = this.activePath();
    const line = this.newLine();
    const body = box.value.trim();
    const tab = this.tab();
    if (!path || !line || !body || tab === 'egyeb') return;
    this.run(this.api.createComment(this.snapshot().sessionId, tab, path, line, body), (c) => {
      this.comments.update((list) => [...list, c]);
      this.newLine.set(null);
    });
  }

  saveEdit(c: ExamCodeCommentDto, text: string): void {
    const body = text.trim();
    if (!body) return;
    this.run(this.api.updateComment(this.snapshot().sessionId, c.id, body), (updated) => {
      this.comments.update((list) => list.map((x) => (x.id === updated.id ? updated : x)));
      this.editingId.set(null);
    });
  }

  async remove(c: ExamCodeCommentDto): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Megjegyzés törlése', message: `Törlöd a(z) ${c.line}. sorhoz írt megjegyzést?`, confirmLabel: 'Törlés', cancelLabel: 'Mégse', danger: true,
    });
    if (!ok) return;
    this.run(this.api.deleteComment(this.snapshot().sessionId, c.id), () => this.comments.update((list) => list.filter((x) => x.id !== c.id)));
  }

  requestSuggestions(): void {
    const tab = this.tab();
    if (tab === 'egyeb' || this.suggesting()) return;
    const sessionId = this.snapshot().sessionId;
    this.suggesting.set(true);
    this.suggestError.set(null);
    this.suggestNote.set(null);
    this.api.commentSuggestions(sessionId, tab, null).pipe(take(1), takeUntilDestroyed(this.destroyRef), finalize(() => this.suggesting.set(false))).subscribe({
      next: (res) => {
        if (this.snapshot().sessionId !== sessionId) return;
        if (res.quota) this.suggestQuota.set(res.quota);
        const reviewed = new Set(res.reviewedPaths);
        const fresh = res.suggestions.map((s) => ({ ...s, partKey: tab, key: this.nextKey++ }));
        this.suggestions.update((list) => [...list.filter((s) => s.partKey !== tab || !reviewed.has(s.path)), ...fresh]);
        const parts = [fresh.length ? `${fresh.length} MI-javaslat érkezett.` : 'Az MI nem talált megjegyzésre érdemes sort.'];
        if (res.skippedFiles.length) parts.push(`Kimaradt: ${res.skippedFiles.map((f) => `${f.path} (${f.reason})`).join(', ')}.`);
        if (res.truncatedPaths.length) parts.push(`Csak részben nézte át: ${res.truncatedPaths.join(', ')}.`);
        this.suggestNote.set(parts.join(' '));
      },
      error: (e) => this.suggestError.set(aiHelperErrorMessage(e) ?? extractErrorMessage(e, 'Az MI-javaslatok kérése sikertelen.')),
    });
  }

  /** Elfogadás: a (módosítható) szövegből a megjegyzés-végponttal valódi megjegyzés lesz. */
  accept(sg: Suggestion, text: string): void {
    const body = text.trim();
    if (!body) return;
    this.run(this.api.createComment(this.snapshot().sessionId, sg.partKey, sg.path, sg.line, body), (c) => {
      this.comments.update((list) => [...list, c]);
      this.dismiss(sg);
    });
  }

  dismiss(sg: Suggestion): void {
    this.suggestions.update((list) => list.filter((s) => s.key !== sg.key));
  }

  step(delta: number): void {
    const i = this.lightbox();
    if (i === null) return;
    this.lightbox.set(Math.min(Math.max(i + delta, 0), this.imageUrls().length - 1));
  }

  closeLightbox(): void {
    this.lightbox.set(null);
  }

  /** Egy megjegyzés-művelet; a válasz eldobva, ha közben másik dolgozat pillanatképe nyílt meg. */
  private run<T>(call: Observable<T>, done: (value: T) => void): void {
    const sessionId = this.snapshot().sessionId;
    this.busy.set(true);
    this.commentError.set(null);
    call.pipe(take(1), finalize(() => this.busy.set(false))).subscribe({
      next: (value) => {
        if (this.snapshot().sessionId === sessionId) done(value);
      },
      error: (e) => {
        if (this.snapshot().sessionId === sessionId) this.commentError.set(extractErrorMessage(e, 'A megjegyzés mentése sikertelen.'));
      },
    });
  }

  private loadComments(sessionId: number): void {
    this.loads.push(this.api.comments(sessionId).pipe(take(1)).subscribe({
      next: (list) => this.comments.set(list),
      error: (e) => this.commentError.set(extractErrorMessage(e, 'A megjegyzések betöltése sikertelen.')),
    }));
  }

  /** A képernyőképek blobként (a JWT nem süti), objektum-URL-lel; váltáskor / bezáráskor felszabadítva. */
  private loadImages(sn: ExamSessionSnapshotDto): void {
    const count = sn.gui?.imageCount ?? 0;
    this.imageUrls.set(Array.from({ length: count }, () => null));
    for (let i = 0; i < count; i++) {
      this.loads.push(this.api.guiImage(sn.sessionId, i).pipe(take(1)).subscribe({
        next: (blob) => this.imageUrls.update((urls) => urls.map((u, j) => (j === i ? URL.createObjectURL(blob) : u))),
        error: () => this.imageError.set('Egy képernyőkép betöltése sikertelen.'),
      }));
    }
  }

  private reset(): void {
    this.loads.forEach((s) => s.unsubscribe());
    this.loads = [];
    for (const url of this.imageUrls()) if (url) URL.revokeObjectURL(url);
    this.imageUrls.set([]);
    this.imageError.set(null);
    this.lightbox.set(null);
    this.comments.set([]);
    this.suggestions.set([]);
    this.suggestError.set(null);
    this.suggestNote.set(null);
    this.newLine.set(null);
    this.editingId.set(null);
    this.commentError.set(null);
  }
}
