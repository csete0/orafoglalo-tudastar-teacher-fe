import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, concatMap, finalize, from, map, take } from 'rxjs';
import { TeacherProjectService } from '../../../services/teacher-project/teacher-project.service';
import { ReportService } from '../../../services/report/report.service';
import { ConfirmService } from '../../../shared/confirm/confirm.service';
import { AI_HELPER_PREMIUM_TEXT, AiHelperBlock, AiHelperQuotaItemDto, aiHelperBlock, aiHelperErrorMessage, quotaRemaining } from '../../../shared/ai-helper-quota.util';
import { extractErrorMessage } from '../../../shared/http-error/extract-error-message.util';
import { CodeCommentSuggestionDto, CodeCommentSuggestionsResponse, CodeCommentThreadDto } from '../../../models/teacher-project.model';
import { StudentCodeState } from './student-code.state';

/** Kliens-oldali (nem mentett) AI-javaslat; a `key` csak a felületen azonosít. */
export interface CodeSuggestion extends CodeCommentSuggestionDto {
  key: number;
}

/** Az AI-javaslatok hatóköre: a megnyitott fájl vagy a diák minden saját fájlja. */
type SuggestScope = 'file' | 'all';

/**
 * AI-javaslatok a megnyitott diák kódjára (Tanári segítségek 3): az MI sorokhoz kötött javaslatokat ad (Prémium, havi keret);
 * ezek csak itt, a böngészőben élnek, amíg a tanár el nem fogadja (= a meglévő megjegyzés-végponttal megjegyzés lesz belőlük)
 * vagy el nem veti őket. A `ProjektKiadasComponent` adja (`providers`), a `StudentCodeState` mellett.
 */
@Injectable()
export class CodeSuggestionsState {
  private readonly api = inject(TeacherProjectService);
  private readonly reports = inject(ReportService);
  private readonly confirm = inject(ConfirmService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly codeView = inject(StudentCodeState);

  readonly quotaLeft = quotaRemaining;
  readonly suggestions = signal<CodeSuggestion[]>([]);
  readonly suggestScope = signal<SuggestScope>('file');
  readonly suggestQuota = signal<AiHelperQuotaItemDto | null>(null);
  /** A keret-végpont szerint Prémium-e a tanár (null = még nem tudjuk). */
  readonly premium = signal<boolean | null>(null);
  readonly suggestBlock = signal<AiHelperBlock | null>(null);
  readonly suggesting = signal(false);
  readonly suggestError = signal<string | null>(null);
  readonly suggestNote = signal<string | null>(null);
  readonly editingKey = signal<number | null>(null);
  /** Egy elfogadás (vagy a „Mind elfogad” sor) fut - közben a többi gomb tiltva. */
  readonly acceptBusy = signal(false);
  private suggestRequest: Subscription | null = null;
  private suggestScopeInFlight: SuggestScope | null = null;
  /** Sorszám az elavult javaslat-válaszok kiszűrésére (diák-/fájlváltás, megszakítás után). */
  private suggestGeneration = 0;
  private acceptRequest: Subscription | null = null;
  private nextSuggestionKey = 1;

  readonly suggestBlockText = computed(() => {
    if (this.suggestBlock() === 'premium' || this.premium() === false) return AI_HELPER_PREMIUM_TEXT;
    const q = this.suggestQuota();
    if (this.suggestBlock() === 'quota' || (q && quotaRemaining(q) === 0))
      return this.suggestError() ?? 'Elfogyott a havi kereted - a következő hónapban újra kérhetsz AI-javaslatot.';
    return null;
  });
  readonly canSuggest = computed(
    () => !this.suggesting() && !this.suggestBlockText() && (this.suggestScope() === 'all' || !!this.codeView.activePath()),
  );

  /** Az aktív fájl javaslatai soronként (a fájl végén túliak az utolsó soron). */
  private readonly suggestionsByLine = computed(() => {
    const map = new Map<number, CodeSuggestion[]>();
    const last = this.codeView.lines().length;
    for (const sg of this.suggestions().filter((x) => x.path === this.codeView.activePath())) {
      const line = Math.min(sg.line, last);
      map.set(line, [...(map.get(line) ?? []), sg]);
    }
    return map;
  });

  /** Fájlonként az AI-javaslatok száma. */
  readonly suggestionCounts = computed(() => {
    const counts: Record<string, number> = {};
    for (const sg of this.suggestions()) counts[sg.path] = (counts[sg.path] ?? 0) + 1;
    return counts;
  });

  suggestionsAt(line: number): CodeSuggestion[] {
    return this.suggestionsByLine().get(line) ?? [];
  }

  requestSuggestions(): void {
    const s = this.codeView.codeFor();
    const path = this.codeView.activePath();
    const scope = this.suggestScope();
    if (!s || !this.canSuggest()) return;
    this.cancelSuggest();
    const generation = ++this.suggestGeneration;
    this.suggesting.set(true);
    this.suggestScopeInFlight = scope;
    this.suggestError.set(null);
    this.suggestNote.set(null);
    this.suggestRequest = this.api
      .commentSuggestions(this.codeView.assignmentId, s.userId, scope === 'file' && path ? [path] : null)
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          if (generation !== this.suggestGeneration) return;
          this.endSuggest();
          if (res.quota) this.suggestQuota.set(res.quota);
          this.mergeSuggestions(res);
        },
        error: (err) => {
          if (generation !== this.suggestGeneration) return;
          this.endSuggest();
          const block = aiHelperBlock(err);
          this.suggestBlock.set(block);
          if (block === 'quota') this.suggestQuota.update((q) => (q ? { ...q, used: q.limit } : q));
          this.suggestError.set(aiHelperErrorMessage(err) ?? extractErrorMessage(err, 'Az AI-javaslatok kérése sikertelen.'));
        },
      });
  }

  /** A futó javaslat-kérés megszakítása; a késve érkező válasz a sorszám miatt sem jut be. */
  cancelSuggest(): void {
    this.suggestGeneration++;
    this.suggestRequest?.unsubscribe();
    this.endSuggest();
  }

  /** Fájlváltáskor: a megnyitott fájlra kért javaslat okafogyottá válik; az „összes fájl” kérés fut tovább. */
  cancelFileScopedSuggest(): void {
    if (this.suggestScopeInFlight === 'file') this.cancelSuggest();
  }

  private endSuggest(): void {
    this.suggestRequest = null;
    this.suggestScopeInFlight = null;
    this.suggesting.set(false);
  }

  /** Az átnézett fájlok korábbi (el nem fogadott) javaslatait az új kör váltja; a többi fájlé marad. */
  private mergeSuggestions(res: CodeCommentSuggestionsResponse): void {
    const reviewed = new Set(res.reviewedPaths);
    const fresh = res.suggestions.map((x) => ({ ...x, key: this.nextSuggestionKey++ }));
    this.suggestions.update((list) => [...list.filter((x) => !reviewed.has(x.path)), ...fresh]);
    if (this.editingKey() !== null && !this.suggestions().some((x) => x.key === this.editingKey())) this.editingKey.set(null);
    const parts = [fresh.length ? `${fresh.length} AI-javaslat érkezett.` : 'Az MI nem talált megjegyzésre érdemes sort.'];
    if (res.skippedFiles.length) parts.push(`Kimaradt: ${res.skippedFiles.map((f) => `${f.path} (${f.reason})`).join(', ')}.`);
    if (res.truncatedPaths.length) parts.push(`Csak részben nézte át: ${res.truncatedPaths.join(', ')}.`);
    this.suggestNote.set(parts.join(' '));
  }

  dismiss(sg: CodeSuggestion): void {
    this.removeSuggestion(sg.key);
  }

  /** Elfogadás: a meglévő megjegyzés-végponttal valódi megjegyzés lesz belőle (szerkesztve a módosított szöveggel). */
  accept(sg: CodeSuggestion, text: string = sg.text): void {
    const s = this.codeView.codeFor();
    const body = text.trim();
    if (!s || !body || this.acceptBusy()) return;
    this.acceptBusy.set(true);
    this.codeView.commentError.set(null);
    this.acceptRequest = this.api.createComment(this.codeView.assignmentId, s.userId, sg.path, sg.line, body)
      .pipe(take(1), finalize(() => this.acceptBusy.set(false)))
      .subscribe({
        next: (t) => this.accepted(s.userId, sg.key, t),
        error: (e) => this.codeView.commentError.set(extractErrorMessage(e, 'A megjegyzés mentése sikertelen.')),
      });
  }

  /** Minden javaslat elfogadása megerősítés után, egymás után; hibánál megáll (a már elfogadottak megmaradnak). */
  async acceptAll(): Promise<void> {
    const s = this.codeView.codeFor();
    const list = this.suggestions();
    if (!s || !list.length || this.acceptBusy()) return;
    const ok = await this.confirm.ask({
      title: 'Mind elfogadod?',
      message: `${list.length} AI-javaslatból megjegyzés lesz a diák kódjában, és a diák látni fogja őket.`,
      confirmLabel: 'Mind elfogad',
      cancelLabel: 'Mégse',
    });
    if (!ok || this.codeView.codeFor()?.userId !== s.userId || this.acceptBusy()) return;
    const current = this.suggestions().filter((x) => list.some((y) => y.key === x.key));
    this.acceptBusy.set(true);
    this.codeView.commentError.set(null);
    this.acceptRequest = from(current)
      .pipe(
        concatMap((sg) => this.api.createComment(this.codeView.assignmentId, s.userId, sg.path, sg.line, sg.text.trim()).pipe(map((t) => ({ sg, t })))),
        finalize(() => this.acceptBusy.set(false)),
      )
      .subscribe({
        next: ({ sg, t }) => this.accepted(s.userId, sg.key, t),
        error: (e) => this.codeView.commentError.set(extractErrorMessage(e, 'Egy megjegyzés mentése sikertelen - a többi javaslat megmaradt.')),
      });
  }

  private accepted(userId: number, key: number, t: CodeCommentThreadDto): void {
    if (this.codeView.codeFor()?.userId !== userId) return; // közben másik diákra váltott
    this.codeView.upsertComment(t);
    this.removeSuggestion(key);
  }

  private removeSuggestion(key: number): void {
    this.suggestions.update((list) => list.filter((x) => x.key !== key));
    if (this.editingKey() === key) this.editingKey.set(null);
  }

  /** Van-e el nem fogadott javaslat - elhagyás előtt rákérdezünk, mert nincsenek elmentve. */
  hasPendingSuggestions(): boolean {
    return this.suggestions().length > 0;
  }

  async confirmDiscardSuggestions(): Promise<boolean> {
    const n = this.suggestions().length;
    if (!n) return true;
    return this.confirm.ask({
      title: 'Elveted az AI-javaslatokat?',
      message: `${n} el nem fogadott AI-javaslat elvész - ezeket nem mentjük el.`,
      confirmLabel: 'Elvetem',
      cancelLabel: 'Maradok',
      danger: true,
    });
  }

  resetSuggestions(): void {
    this.cancelSuggest();
    this.acceptRequest?.unsubscribe();
    this.acceptRequest = null;
    this.acceptBusy.set(false);
    this.suggestions.set([]);
    this.editingKey.set(null);
    this.suggestError.set(null);
    this.suggestNote.set(null);
  }

  /** A keret csak tájékoztatás (a javaslat-válasz is hozza); egyszer kérjük le, az első megnyitott kódnál. */
  loadSuggestQuota(): void {
    if (this.premium() !== null) return;
    this.premium.set(true); // ne kérjük újra, amíg úton van; hibánál a gomb engedélyezve marad, a BE dönt
    this.reports.getAiHelperQuota().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (q) => {
        this.premium.set(q.premium);
        this.suggestQuota.update((current) => current ?? q.codeComments ?? null);
      },
      error: () => {},
    });
  }
}
