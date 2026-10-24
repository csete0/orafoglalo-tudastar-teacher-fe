import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { KahootHostStore } from '../../../services/kahoot-host/kahoot-host.store';
import { IconComponent } from '../../../shared/icon/icon.component';

/** Egy kérdés lezárása utáni eredmény a vezérlő-képernyőn: helyes válasz, hisztogram, élmezőny és a továbblépés. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-kahoot-reveal',
  host: { class: 'block' },
  standalone: true,
  imports: [IconComponent],
  template: `
    @if (store.questionClosed(); as closed) {
      <div class="card p-6 mb-4">
        <div class="flex items-center justify-between mb-4">
          <span class="badge badge-success">
            Helyes: {{ closed.correctAnswers.join(', ') }}
          </span>
          <span class="text-sm text-text-muted">
            {{ closed.answerCount }} / {{ closed.participantCount }} válaszolt
          </span>
        </div>

        @if (closed.explanation) {
          <p class="text-sm text-text-muted mb-4">{{ closed.explanation }}</p>
        }

        @if (closed.optionCounts.length) {
          <ul class="space-y-2 mb-2">
            @for (oc of closed.optionCounts; track oc.option) {
              <li>
                <div class="flex justify-between text-sm mb-0.5">
                  <span [class.text-success]="isCorrectOption(oc.option)"
                        [class.font-bold]="isCorrectOption(oc.option)">
                    @if (isCorrectOption(oc.option)) {
                      <app-icon name="check" class="w-4 h-4 inline-block mr-1" />
                    }
                    {{ oc.option }}
                  </span>
                  <span class="text-text-muted tabular-nums">{{ oc.count }}</span>
                </div>
                <div class="h-2.5 rounded-full bg-bg-element overflow-hidden">
                  <div class="h-full rounded-full transition-all duration-500"
                       [class.bg-success]="isCorrectOption(oc.option)"
                       [class.bg-border-default]="!isCorrectOption(oc.option)"
                       [style.width.%]="optionPercent(closed, oc.count)"></div>
                </div>
              </li>
            }
          </ul>
        }
      </div>

      @if (closed.top.length) {
        <div class="card p-5 mb-4">
          <h2 class="font-bold mb-3">Élmezőny</h2>
          <ol class="space-y-1.5">
            @for (entry of closed.top; track entry.userId) {
              <li class="flex items-center gap-3 text-sm">
                <span class="w-6 text-center font-bold text-text-muted">{{ entry.rank }}.</span>
                <span class="flex-1 truncate">{{ entry.name }}</span>
                <span class="font-bold tabular-nums">{{ entry.totalPoints }}</span>
              </li>
            }
          </ol>
        </div>
      }
    } @else {
      <!-- F5 a reveal alatt: a zárás-payload nem őrződik, de a játék folytatható. -->
      <div class="card p-6 mb-4 text-center text-sm text-text-muted">
        Eredményhirdetés — a részletek a következő kérdésnél folytatódnak.
      </div>
    }

    <div class="flex justify-end gap-3">
      <button type="button" class="btn btn-primary text-base px-8 py-3"
              (click)="next()" [disabled]="store.actionPending()">
        {{ store.hasNextQuestion() ? 'Következő kérdés' : 'Eredményhirdetés' }}
      </button>
    </div>
  `,
})
export class KahootRevealComponent {
  readonly store = inject(KahootHostStore);

  next(): void {
    void this.store.next();
  }

  isCorrectOption(option: string): boolean {
    const closed = this.store.questionClosed();
    return !!closed?.correctAnswers.some(
      (c) => c.trim().toLowerCase() === option.trim().toLowerCase(),
    );
  }

  optionPercent(closed: { answerCount: number }, count: number): number {
    return closed.answerCount > 0 ? Math.round((count / closed.answerCount) * 100) : 0;
  }
}
