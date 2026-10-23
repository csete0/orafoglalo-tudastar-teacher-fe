import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CodeSuggestionsState } from './code-suggestions.state';

/** Az AI-javaslatok sávja a diák kódja fölött: hatókör, kérés/megszakítás, „Mind elfogad”, keret és állapot. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-code-suggest-bar',
  host: { class: 'block' },
  standalone: true,
  template: `
    <div class="ai-bar mt-3" data-testid="ai-suggest" role="group" aria-labelledby="ai-suggest-title">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span id="ai-suggest-title" class="font-semibold text-sm">AI-javaslatok</span>
        <fieldset class="flex flex-wrap gap-x-3 gap-y-1 text-xs" [disabled]="suggest.suggesting()">
          <legend class="sr-only">Mire kérsz AI-javaslatot?</legend>
          <label class="inline-flex items-center gap-1"><input type="radio" name="suggest-scope" value="file"
            [checked]="suggest.suggestScope() === 'file'" (change)="suggest.suggestScope.set('file')" /> csak a megnyitott fájl</label>
          <label class="inline-flex items-center gap-1"><input type="radio" name="suggest-scope" value="all"
            [checked]="suggest.suggestScope() === 'all'" (change)="suggest.suggestScope.set('all')" /> a diák összes fájlja</label>
        </fieldset>
        @if (suggest.suggesting()) {
          <button type="button" class="btn btn-ghost !px-3 !py-1 !text-xs" (click)="suggest.cancelSuggest()" data-testid="suggest-cancel">Megszakítás</button>
        } @else {
          <button type="button" class="btn btn-primary !px-3 !py-1 !text-xs" [disabled]="!suggest.canSuggest()" (click)="suggest.requestSuggestions()"
                  data-testid="suggest-run">AI-javaslatok kérése</button>
        }
        @if (suggest.suggestions().length) {
          <button type="button" class="btn btn-ghost !px-3 !py-1 !text-xs" [disabled]="suggest.acceptBusy() || suggest.suggesting()" (click)="suggest.acceptAll()"
                  data-testid="suggest-accept-all">Mind elfogad ({{ suggest.suggestions().length }})</button>
        }
      </div>
      @if (suggest.suggestQuota(); as q) {
        <p class="text-xs text-text-muted mt-1" data-testid="suggest-quota">Havi keret: ebben a hónapban még {{ suggest.quotaLeft(q) }}/{{ q.limit }} kérés.</p>
      }
      <p class="text-xs mt-1" aria-live="polite" data-testid="suggest-status">
        @if (suggest.suggesting()) { Az MI átnézi a kódot – ez akár egy percig is tarthat… }
        @else if (suggest.suggestNote(); as note) { {{ note }} }
      </p>
      @if (suggest.suggestBlockText(); as msg) {
        <p class="text-xs text-warning mt-1" role="alert" data-testid="suggest-block">{{ msg }}</p>
      } @else if (suggest.suggestError(); as err) {
        <p class="text-xs text-danger mt-1" role="alert" data-testid="suggest-error">{{ err }}</p>
      }
      <p class="text-xs text-text-muted mt-1">A javaslatokat a diák nem látja, és nem mentjük el: csak az elfogadottakból lesz megjegyzés.</p>
    </div>
  `,
  styles: [`
    .ai-bar { padding: 0.75rem; border-radius: 0.5rem; border: 1px dashed var(--color-primary); }
  `],
})
export class CodeSuggestBarComponent {
  readonly suggest = inject(CodeSuggestionsState);
}
