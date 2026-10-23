import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SnippetDraftsState } from './snippet-drafts.state';
import { LANGUAGES } from './task-types';

/** Nyelvenkénti kódrészlet-rács egy piszkozat-kulcshoz (részfeladat vagy összevont megoldás) és a mentés gombja. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-snippet-editor',
  standalone: true,
  host: { class: 'block' },
  imports: [FormsModule],
  template: `
    <div class="grid grid-cols-2 gap-2">
      @for (lang of languages; track lang.id) {
        <div>
          <label class="text-xs text-text-muted">{{ lang.name }}</label>
          <textarea rows="3"
            [ngModel]="drafts.draftCode(draftKey(), lang.id)"
            (ngModelChange)="drafts.setDraftCode(draftKey(), lang.id, $event)"
            class="input !bg-bg-element !px-2 !py-1 !text-xs font-mono"></textarea>
        </div>
      }
    </div>
    <!-- UI-TT-141: a store kódrészlet-mentése a MINDEN mutáló metódus által megosztott loading-jelzőn korai-return-nel
         véd. E kötés nélkül egy MÁSIK feladat/megoldás törlése közben ide kattintva a mentés láthatatlanul no-op maradt:
         nincs hálózati hívás, nincs toast, és a gomb sem tűnt letiltottnak - a tanár azt hihette, mentett. -->
    <button (click)="save.emit()" [disabled]="drafts.loading()" class="btn btn-primary mt-2 !px-3 !py-1">
      {{ saveLabel() }}
    </button>
  `,
})
export class SnippetEditorComponent {
  /** Részfeladatnál a solutionId, összevont megoldásnál `SnippetDraftsState.completeSolutionKey(taskId)`. */
  readonly draftKey = input.required<number>();
  readonly saveLabel = input.required<string>();
  readonly save = output<void>();

  protected readonly drafts = inject(SnippetDraftsState);
  protected readonly languages = LANGUAGES;
}
