import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TeacherQuizDetailDto } from '../../../models/teacher-quiz.model';
import { GroupStore } from '../../../services/group/group.store';
import { TeacherQuizStore } from '../../../services/teacher-quiz/teacher-quiz.store';
import { ConfirmService } from '../../../shared/confirm/confirm.service';
import { IconComponent } from '../../../shared/icon/icon.component';
import { ToastService } from '../../../shared/toast/toast.service';
import { TestWindowErrorsComponent, testWindowValidator } from '../../../shared/test-window/test-window';
import { groupLabeler } from './quiz-labels';

/** „Kiadás csoportnak”: aktív kiadások visszavonással, új kiadás, és a szekció alján a kvíz törlése. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-quiz-assign',
  standalone: true,
  host: { class: 'block' },
  imports: [ReactiveFormsModule, IconComponent, DatePipe, RouterLink, TestWindowErrorsComponent],
  template: `
    <h2 class="font-bold mb-3">Kiadás csoportnak</h2>

    <ul class="space-y-2 mb-4">
      @for (assignment of activeAssignments(); track assignment.id) {
        <li class="flex items-center gap-2 text-sm">
          <app-icon name="users" class="w-4 h-4 block text-text-muted" />
          <span class="flex-1">
            {{ groupLabel(assignment.groupId, assignment.groupName) }}
            @if (assignment.isTest) {
              <span class="badge badge-warning">Dolgozat · {{ (assignment.timeLimitSeconds ?? 0) / 60 }} perc</span>
              <a class="text-primary font-semibold" [routerLink]="['/dolgozatok', 'kviz', assignment.id]">Áttekintés</a>
            } @else if (assignment.timeLimitSeconds) {
              <span class="badge badge-neutral">{{ assignment.timeLimitSeconds / 60 }} perc</span>
            }
            @if (assignment.opensAt) {
              <span class="text-text-muted">· nyílik: {{ assignment.opensAt | date: 'yyyy.MM.dd. HH:mm' }}</span>
            }
            @if (assignment.dueAt) {
              <span class="text-text-muted">· határidő: {{ assignment.dueAt | date: 'yyyy.MM.dd. HH:mm' }}</span>
            }
          </span>
          <button type="button" class="btn btn-ghost text-danger" (click)="revoke(assignment.id)">
            Visszavonás
          </button>
        </li>
      } @empty {
        <li class="text-sm text-text-muted">Még nincs kiadva egyetlen csoportnak sem.</li>
      }
    </ul>

    @if (!quiz().isPublished) {
      <p class="text-sm text-text-muted">Előbb publikáld a kvízt, utána adhatod ki csoportoknak.</p>
    } @else {
      <form [formGroup]="assignForm" (ngSubmit)="assign()" class="space-y-3 border-t border-border-default pt-4">
        <label class="block">
          <span class="text-sm text-text-muted">Csoport</span>
          <select formControlName="groupId" class="input mt-1">
            @for (group of assignableGroups(); track group.id) {
              <option [value]="group.id">{{ groupLabel(group.id, group.name) }}</option>
            }
          </select>
        </label>

        <label class="flex items-start gap-2">
          <input formControlName="isTest" type="checkbox" class="mt-1" data-testid="quiz-assign-is-test" />
          <span>
            <span class="font-semibold">Dolgozatként adom ki</span>
            <span class="block text-sm text-text-muted">
              Egyszer írható meg a megadott időablakban és időkorláttal; lejártkor a rendszer beadja. A pontot és a megoldásokat a
              diákok csak a közzétételed után látják, a Dolgozataim között.
            </span>
          </span>
        </label>

        <label class="block">
          <span class="text-sm text-text-muted">
            {{ assignForm.controls.isTest.value ? 'Időkorlát (perc)' : 'Időkorlát a teljes kitöltésre (perc, nem kötelező)' }}
          </span>
          <input formControlName="timeLimitMinutes" type="number" min="5" max="240" class="input mt-1" data-testid="quiz-assign-time-limit" />
        </label>

        <label class="block">
          <span class="text-sm text-text-muted">
            {{ assignForm.controls.isTest.value ? 'Megírható ettől' : 'Nyitás dátuma (nem kötelező)' }}
          </span>
          <input formControlName="opensAt" type="datetime-local" class="input mt-1" />
        </label>

        <label class="block">
          <span class="text-sm text-text-muted">
            {{ assignForm.controls.isTest.value ? 'Megírható eddig (utána a rendszer beadja)' : 'Határidő (nem kötelező)' }}
          </span>
          <input formControlName="dueAt" type="datetime-local" class="input mt-1" />
        </label>

        <app-test-window-errors [errors]="assignForm.errors" />

        <button
          type="submit"
          class="btn btn-primary"
          [disabled]="assignForm.invalid || store.loading() || assignableGroups().length === 0"
        >
          Kiadás
        </button>
        @if (assignableGroups().length === 0 && groupStore.activeGroups().length > 0) {
          <p class="text-sm text-text-muted">Minden csoportod megkapta már ezt a kvízt.</p>
        }
      </form>
    }

    <div class="border-t border-border-default mt-6 pt-4">
      <button
        type="button"
        class="btn btn-ghost text-danger"
        [disabled]="store.loading()"
        (click)="deleteQuiz()"
      >
        Kvíz törlése
      </button>
    </div>
  `,
})
export class QuizAssignComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastService);
  private readonly confirmService = inject(ConfirmService);
  protected readonly groupStore = inject(GroupStore);
  protected readonly store = inject(TeacherQuizStore);

  readonly quizId = input.required<number>();
  readonly quiz = input.required<TeacherQuizDetailDto>();

  readonly groupLabel = groupLabeler(this.groupStore.groups);

  readonly assignForm = this.fb.nonNullable.group(
    {
      groupId: this.fb.control<number | null>(null, Validators.required),
      opensAt: [''],
      dueAt: [''],
      // Dolgozat: kötelező ablak + időkorlát; sima kiadásnál az időkorlát opcionális (a szerver is ellenőrzi).
      isTest: [false],
      timeLimitMinutes: this.fb.control<number | null>(null),
    },
    { validators: testWindowValidator() },
  );

  readonly activeAssignments = computed(() => this.quiz().assignments.filter((a) => !a.revokedAt));

  /** Csak azok a csoportok, amelyek MÉG NEM kapták meg — a backend is elutasítaná a duplát. */
  readonly assignableGroups = computed(() => {
    const assigned = new Set(this.activeAssignments().map((a) => a.groupId));
    return this.groupStore.activeGroups().filter((g) => !assigned.has(g.id));
  });

  assign(): void {
    if (this.assignForm.invalid || this.store.loading()) return;

    const raw = this.assignForm.getRawValue();
    this.store.assignToGroup(
      this.quizId(),
      {
        groupId: Number(raw.groupId),
        // A datetime-local érték helyi idő, időzóna-jelölés nélkül - ISO-alakra váltjuk,
        // hogy a szerver ne értelmezhesse félre.
        opensAt: raw.opensAt ? new Date(raw.opensAt).toISOString() : null,
        dueAt: raw.dueAt ? new Date(raw.dueAt).toISOString() : null,
        isTest: raw.isTest,
        timeLimitMinutes: raw.timeLimitMinutes ? Number(raw.timeLimitMinutes) : null,
      },
      () => {
        this.toastService.success(raw.isTest ? 'Dolgozat kiadva.' : 'Kvíz kiadva.');
        this.assignForm.reset();
      },
    );
  }

  async revoke(assignmentId: number): Promise<void> {
    const confirmed = await this.confirmService.ask({
      title: 'Kiadás visszavonása',
      message: 'A diákok nem indíthatják többé. A már megírt eredmények megmaradnak.',
      confirmLabel: 'Visszavonás',
      cancelLabel: 'Mégsem',
      danger: true,
    });
    if (!confirmed) return;

    this.store.revokeAssignment(this.quizId(), assignmentId, () => this.toastService.success('Kiadás visszavonva.'));
  }

  async deleteQuiz(): Promise<void> {
    const confirmed = await this.confirmService.ask({
      title: 'Kvíz törlése',
      message: 'A kvíz és az összes kiadása törlődik. Ez nem vonható vissza.',
      confirmLabel: 'Törlés',
      cancelLabel: 'Mégsem',
      danger: true,
    });
    if (!confirmed) return;
    if (this.store.loading()) return;
    this.store.deleteQuiz(this.quizId(), () => this.router.navigate(['/feladatsorok/kvizek']));
  }
}
