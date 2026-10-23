import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { finalize, take } from 'rxjs';
import { TeacherQuizDetailDto } from '../../../models/teacher-quiz.model';
import { GroupStore } from '../../../services/group/group.store';
import { KahootHostService } from '../../../services/kahoot-host/kahoot-host.service';
import { extractErrorMessage } from '../../../shared/http-error/extract-error-message.util';
import { groupLabeler } from './quiz-labels';

/** „Élő játék” (Kahoot-mód) indítása egy csoporttal. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-quiz-live',
  standalone: true,
  host: { class: 'block' },
  template: `
    <h2 class="font-bold mb-1">Élő játék</h2>
    <p class="text-sm text-text-muted mb-3">
      Tanár-vezérelt, valós idejű kvízjáték: a diákok a saját eszközükön válaszolnak,
      a pontszám a gyorsaságtól is függ. Az indítás kiadja a kvízt a csoportnak, ha
      még nem volt kiadva. Időkorlát nélküli kvíznél élőben kérdésenként 30 mp az
      alapértelmezés.
    </p>

    @if (!quiz().isPublished) {
      <p class="text-sm text-text-muted">Előbb publikáld a kvízt, utána indíthatsz élő játékot.</p>
    } @else {
      <div class="flex flex-wrap items-end gap-3">
        <label class="block grow max-w-xs">
          <span class="text-sm text-text-muted">Csoport</span>
          <select class="input mt-1" [value]="liveGroupId() ?? ''" (change)="selectLiveGroup($event)">
            <option value="">Válassz csoportot…</option>
            @for (group of groupOptions(); track group.id) {
              <option [value]="group.id">{{ groupLabel(group.id, group.name) }}</option>
            }
          </select>
        </label>
        <button type="button" class="btn btn-primary"
                (click)="startLive()"
                [disabled]="liveGroupId() === null || livePending() || !!quiz().takedownAt">
          {{ livePending() ? 'Szoba nyitása…' : 'Élő játék indítása' }}
        </button>
      </div>
      @if (liveError(); as err) {
        <p class="text-sm text-danger mt-2">{{ err }}</p>
      }
    }
  `,
})
export class QuizLiveComponent {
  private readonly kahootHostService = inject(KahootHostService);
  private readonly router = inject(Router);
  private readonly groupStore = inject(GroupStore);

  readonly quizId = input.required<number>();
  readonly quiz = input.required<TeacherQuizDetailDto>();

  readonly groupLabel = groupLabeler(this.groupStore.groups);

  readonly liveGroupId = signal<number | null>(null);
  readonly livePending = signal(false);
  readonly liveError = signal<string | null>(null);

  /** Élő játékhoz bármely saját, NEM archivált csoport választható - a szoba-nyitás kiadást
   *  is létrehoz, ha még nincs (a jogosultság azon öröklődik a diákokra). */
  readonly groupOptions = this.groupStore.activeGroups;

  selectLiveGroup(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.liveGroupId.set(value ? +value : null);
  }

  startLive(): void {
    const groupId = this.liveGroupId();
    if (groupId === null || this.livePending()) return;

    const quizId = this.quizId();
    this.livePending.set(true);
    this.liveError.set(null);
    // Szoba-nyitás (írás, kiadást is létrehozhat): a komponens megszűnésekor sem szakítjuk meg.
    this.kahootHostService
      .createRoom(quizId, groupId)
      .pipe(take(1), finalize(() => this.livePending.set(false)))
      .subscribe({
        next: (room) =>
          void this.router.navigate([
            '/feladatsorok', 'kvizek', quizId, 'elo', room.kahootSessionId,
          ]),
        error: (err) =>
          this.liveError.set(extractErrorMessage(err, 'Az élő játék indítása sikertelen.')),
      });
  }
}
