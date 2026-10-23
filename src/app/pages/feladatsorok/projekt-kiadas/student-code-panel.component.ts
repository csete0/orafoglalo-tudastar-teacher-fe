import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { LocalSpinnerComponent } from '../../../shared/local-spinner/local-spinner.component';
import { KodOlvasoComponent } from '../../../shared/kod-olvaso/kod-olvaso.component';
import { parseUtc } from '../../../shared/utc-date.util';
import { CodeSuggestBarComponent } from './code-suggest-bar.component';
import { CodeSuggestion, CodeSuggestionsState } from './code-suggestions.state';
import { StudentCodeState } from './student-code.state';

/**
 * A megnyitott diák kódja csak olvasva (H fázis): sorszámra kattintva megjegyzés írható, a diák válaszolhat és megoldottnak
 * jelölheti; ha a sor azóta megváltozott, a megjegyzés „elavult”. A soronkénti AI-javaslatok is itt jelennek meg.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-student-code-panel',
  host: { class: 'block' },
  standalone: true,
  imports: [DatePipe, NgTemplateOutlet, LocalSpinnerComponent, KodOlvasoComponent, CodeSuggestBarComponent],
  templateUrl: './student-code-panel.component.html',
  styles: [`
    .thread { margin: 0.25rem 0.75rem 0.5rem 3rem; padding: 0.5rem 0.75rem; border-radius: 0.5rem; background: var(--color-bg-panel);
      border: 1px solid var(--color-border-default); font-family: var(--font-sans, system-ui, sans-serif); white-space: normal; }
    .thread--resolved { opacity: 0.7; }
    .thread-body { margin-top: 0.25rem; font-size: 0.8125rem; white-space: pre-wrap; }
    .thread-reply { margin-top: 0.25rem; padding-left: 0.75rem; border-left: 2px solid var(--color-border-default); font-size: 0.75rem; white-space: pre-wrap; }
    .suggestion { margin: 0.25rem 0.75rem 0.5rem 3rem; padding: 0.5rem 0.75rem; border-radius: 0.5rem; border: 1px dashed var(--color-primary);
      background: var(--color-primary-subtle); font-family: var(--font-sans, system-ui, sans-serif); white-space: normal; }
    .suggestion:focus { outline: 2px solid var(--color-primary); outline-offset: 2px; }
    .suggest-list { max-height: 40vh; overflow: auto; }
    .sev { display: inline-block; margin-right: 0.375rem; padding: 0 0.375rem; border-radius: 999px; font-size: 0.625rem; font-weight: 700; color: white; }
    .sev--hiba { background: var(--color-danger); }
    .sev--javaslat { background: var(--color-primary); }
    .sev--dicseret { background: var(--color-success); }
    @media (max-width: 480px) { .thread, .suggestion { margin-left: 0.5rem; margin-right: 0.5rem; } }
  `],
})
export class StudentCodePanelComponent {
  readonly codeView = inject(StudentCodeState);
  readonly suggest = inject(CodeSuggestionsState);

  readonly utc = parseUtc;

  sevClass(sg: CodeSuggestion): string {
    return sg.severity === 'dicséret' ? 'dicseret' : sg.severity;
  }

  selectFile(path: string | null): void {
    if (path !== this.codeView.activePath()) this.suggest.cancelFileScopedSuggest();
    this.codeView.activePath.set(path);
    this.codeView.newCommentLine.set(null);
  }

  startEdit(sg: CodeSuggestion): void {
    this.suggest.editingKey.set(sg.key);
    this.jumpTo(sg, `suggest-edit-${sg.key}`);
  }

  /** A javaslat sorára ugrik (szükség esetén fájlt vált), és oda (vagy a szerkesztőbe) viszi a fókuszt. */
  jumpTo(sg: CodeSuggestion, focusId = `suggestion-${sg.key}`): void {
    if (sg.path !== this.codeView.activePath()) this.selectFile(sg.path);
    setTimeout(() => {
      const el = document.getElementById(focusId);
      el?.scrollIntoView?.({ block: 'center' });
      el?.focus();
    });
  }

  async closeCode(): Promise<void> {
    if (!(await this.suggest.confirmDiscardSuggestions())) return;
    this.suggest.resetSuggestions();
    this.codeView.codeFor.set(null);
  }
}
