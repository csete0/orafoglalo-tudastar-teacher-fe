import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, OnInit, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, take } from 'rxjs';
import { GroupStore } from '../../services/group/group.store';
import { TeacherOralExamService } from '../../services/teacher-oral-exam/teacher-oral-exam.service';
import {
  ORAL_MODE_LABELS,
  OralAssignmentMode,
  TeacherOralAssignmentDto,
} from '../../models/teacher-oral-exam.model';
import { AiHelperQuotaItemDto, aiHelperErrorMessage, quotaRemaining } from '../../shared/ai-helper-quota.util';
import { extractErrorMessage } from '../../shared/http-error/extract-error-message.util';
import { IconComponent } from '../../shared/icon/icon.component';

/** Mit adunk ki: a saját jóváhagyott téma (`topicId`) VAGY egy platform-profil (`profileSlug`), a választható felelési hosszakkal. */
export interface OralAssignTarget {
  topicId: number | null;
  profileSlug: string | null;
  title: string;
  voiceMinuteOptions: number[];
  defaultVoiceMinutes: number;
}

/**
 * Szóbeli kiadása egy csoportnak: csoport, mód (Gyakorlás – a diák havi keretéből | Szóbeli dolgozat – diákonként egy egység a
 * tanár havi szóbeli-keretéből), felelési hossz, nyitás és határidő (helyi idő → UTC ISO, mint a többi kiadásnál).
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-szobeli-kiadas-dialog',
  standalone: true,
  imports: [FormsModule, IconComponent],
  template: `
    <div class="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" (keydown.escape)="closed.emit()">
      <div class="fixed inset-0 bg-black/40" data-testid="oral-assign-backdrop" (click)="closed.emit()"></div>
      <form #dialog role="dialog" aria-modal="true" aria-labelledby="oral-assign-title" tabindex="-1" (ngSubmit)="submit()"
        class="card relative w-full max-w-lg min-w-0 p-4 sm:p-6 shadow-xl my-8 sm:my-auto outline-none space-y-4" data-testid="oral-assign-dialog">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 id="oral-assign-title" class="font-bold text-lg">Kiadás csoportnak</h2>
            <p class="text-sm text-text-muted truncate">{{ target().title }}</p>
          </div>
          <button type="button" class="btn btn-ghost !p-1.5" aria-label="Bezárás" (click)="closed.emit()">
            <app-icon name="x" class="w-5 h-5 block" />
          </button>
        </div>

        <label class="block text-sm">Csoport
          <select class="input mt-1" name="group" [ngModel]="groupId()" (ngModelChange)="groupId.set($event)" data-testid="oral-assign-group">
            <option [ngValue]="null" disabled>Válassz…</option>
            @for (g of groups.activeGroups(); track g.id) { <option [ngValue]="g.id">{{ g.name }}</option> }
          </select>
        </label>

        <fieldset>
          <legend class="text-sm mb-1">Mód</legend>
          <div class="flex flex-wrap gap-2">
            @for (m of modes; track m.value) {
              <label class="flex items-center gap-2 rounded-xl px-3 py-2 border border-border-default text-sm" [class.border-primary]="mode() === m.value">
                <input type="radio" name="mode" [value]="m.value" [checked]="mode() === m.value" (change)="mode.set(m.value)"
                  [attr.data-testid]="'oral-assign-mode-' + m.value" />
                {{ m.label }}
              </label>
            }
          </div>
          <p class="text-xs text-text-muted mt-1" data-testid="oral-assign-mode-help">
            @if (mode() === 'exam' && examBlocked()) {
              <span class="text-danger" data-testid="oral-assign-premium-required">A szóbeli dolgozat a havi tanári keretedből fogy, ezért Prémium
                tanári előfizetéssel adható ki. Gyakorlásként most is kiadhatod (a diák a saját keretéből indítja).</span>
            } @else if (mode() === 'exam') {
              Diákonként 1 egység a havi szóbeli-keretedből@if (examQuota(); as q) { (még {{ remaining(q) }} / {{ q.limit }})}. A diáknak
              nem kell előfizetés, egyszer írhatja meg, az eredményt te teszed közzé.
            } @else {
              A diák a saját havi szóbeli-keretéből indítja (Prémium kell), és azonnal látja az eredményét.
            }
          </p>
        </fieldset>

        <label class="block text-sm">A felelet hossza
          <select class="input mt-1" name="minutes" [ngModel]="voiceMinutes()" (ngModelChange)="voiceMinutes.set($event)" data-testid="oral-assign-minutes">
            @for (m of target().voiceMinuteOptions; track m) { <option [ngValue]="m">{{ m }} perc</option> }
          </select>
        </label>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label class="text-sm">Nyílik (nem kötelező)
            <input type="datetime-local" class="input mt-1" (change)="opensAt.set($any($event.target).value)" data-testid="oral-assign-opens" />
          </label>
          <label class="text-sm">Határidő (nem kötelező)
            <input type="datetime-local" class="input mt-1" (change)="dueAt.set($any($event.target).value)" data-testid="oral-assign-due" />
          </label>
        </div>

        @if (error(); as err) {
          <p class="text-danger text-sm" role="alert" data-testid="oral-assign-error">{{ err }}</p>
        }

        <div class="flex flex-wrap justify-end gap-2">
          <button type="button" class="btn btn-ghost" (click)="closed.emit()">Mégse</button>
          <button type="submit" class="btn btn-primary" [disabled]="saving() || groupId() == null || (mode() === 'exam' && examBlocked())" data-testid="oral-assign-submit">Kiadás</button>
        </div>
      </form>
    </div>
  `,
})
export class SzobeliKiadasDialogComponent implements OnInit {
  private readonly api = inject(TeacherOralExamService);
  readonly groups = inject(GroupStore);

  readonly target = input.required<OralAssignTarget>();
  readonly closed = output<void>();
  readonly assigned = output<TeacherOralAssignmentDto>();

  readonly modes = (Object.keys(ORAL_MODE_LABELS) as OralAssignmentMode[]).map((value) => ({ value, label: ORAL_MODE_LABELS[value] }));
  readonly remaining = quotaRemaining;

  readonly groupId = signal<number | null>(null);
  readonly mode = signal<OralAssignmentMode>('practice');
  readonly voiceMinutes = signal(0);
  readonly opensAt = signal('');
  readonly dueAt = signal('');
  readonly examQuota = signal<AiHelperQuotaItemDto | null>(null);
  /**
   * Prémium nélküli tanárnál a szóbeli dolgozatot egyetlen diák sem tudná elindítani (BE-ORALEXAM-ASSIGNMENT-NONPREMIUM-TEACHER-DEADEND):
   * a dialógus ezt előre jelzi, és a dolgozat-kiadást nem engedi. Ha a keret nem jön meg, nem tiltunk.
   */
  readonly examBlocked = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  /** Helyi idő (datetime-local) → UTC ISO; üres → null. */
  private readonly schedule = computed(() => ({
    opensAt: this.opensAt() ? new Date(this.opensAt()).toISOString() : null,
    dueAt: this.dueAt() ? new Date(this.dueAt()).toISOString() : null,
  }));

  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');

  ngOnInit(): void {
    this.voiceMinutes.set(this.target().defaultVoiceMinutes);
    this.groups.loadMine();
    // A keret csak tájékoztatás: ha nem jön meg, a kiadás attól még megy (a diák indításakor számít).
    this.api.quota().pipe(take(1)).subscribe({
      next: (q) => {
        this.examQuota.set(q.oralExam ?? null);
        this.examBlocked.set(q.premium === false);
      },
      error: () => {},
    });
    setTimeout(() => this.dialog()?.nativeElement.focus());
  }

  submit(): void {
    const groupId = this.groupId();
    if (groupId == null || this.saving() || (this.mode() === 'exam' && this.examBlocked())) return;
    const { opensAt, dueAt } = this.schedule();
    if (opensAt && dueAt && dueAt <= opensAt) {
      this.error.set('A határidő a nyitás után legyen.');
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    const target = this.target();
    this.api
      .assign({ topicId: target.topicId, profileSlug: target.profileSlug, groupId, mode: this.mode(), voiceMinutes: this.voiceMinutes(), opensAt, dueAt })
      .pipe(take(1), finalize(() => this.saving.set(false)))
      .subscribe({
        next: (assignment) => this.assigned.emit(assignment),
        error: (err) => this.error.set(aiHelperErrorMessage(err) ?? extractErrorMessage(err, 'A kiadás nem sikerült.')),
      });
  }
}
