import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TaskSetAssignmentDto } from '../../../models/teacher-content.model';
import { GroupStore } from '../../../services/group/group.store';
import { TeacherTaskSetStore } from '../../../services/teacher-taskset/teacher-taskset.store';
import { TeacherTaskSetService } from '../../../services/teacher-taskset/teacher-taskset.service';
import { ConfirmService } from '../../../shared/confirm/confirm.service';
import { extractErrorMessage } from '../../../shared/http-error/extract-error-message.util';
import { IconComponent } from '../../../shared/icon/icon.component';
import { ToastService } from '../../../shared/toast/toast.service';
import { TestWindowErrorsComponent, testWindowValidator } from '../../../shared/test-window/test-window';

/** A szerkesztő „Kiadás csoportnak” része: az aktív kiadások listája, visszavonása és az új kiadás (dolgozat mód) űrlapja. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-assign-section',
  standalone: true,
  host: { class: 'block' },
  imports: [ReactiveFormsModule, RouterLink, DatePipe, IconComponent, TestWindowErrorsComponent],
  templateUrl: './assign-section.component.html',
})
export class AssignSectionComponent implements OnInit {
  readonly taskSetId = input.required<number>();
  readonly isPublished = input.required<boolean>();

  private readonly taskSetService = inject(TeacherTaskSetService);
  private readonly confirmService = inject(ConfirmService);
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  protected readonly store = inject(TeacherTaskSetStore);
  protected readonly groupStore = inject(GroupStore);

  private readonly assignments = signal<TaskSetAssignmentDto[]>([]);
  readonly assignmentsLoading = signal(false);
  readonly assignmentsError = signal<string | null>(null);

  readonly activeAssignments = computed(() => this.assignments().filter((a) => !a.revokedAt));

  readonly assignableGroups = computed(() => {
    const assigned = new Set(this.activeAssignments().map((a) => a.groupId));
    return this.groupStore.activeGroups().filter((g) => !assigned.has(g.id));
  });

  private readonly duplicateGroupNameCounts = computed(() => {
    const counts = new Map<string, number>();
    for (const g of this.groupStore.groups()) {
      counts.set(g.name, (counts.get(g.name) ?? 0) + 1);
    }
    return counts;
  });

  readonly assignForm = this.fb.nonNullable.group(
    {
      groupId: this.fb.control<number | null>(null, Validators.required),
      opensAt: [''],
      dueAt: [''],
      // Dolgozat mód: időkorlát + kötelező időablak (a szerver is ellenőrzi).
      isTest: [false],
      timeLimitMinutes: [45],
    },
    { validators: testWindowValidator() },
  );

  constructor() {
    // Egyetlen választható csoportnál az üres select csak felesleges kattintás: előválasztjuk.
    effect(() => {
      const groups = this.assignableGroups();
      const control = this.assignForm.controls.groupId;
      if (groups.length === 1 && control.value === null) control.setValue(groups[0].id);
    });
  }

  ngOnInit(): void {
    this.groupStore.loadMine();
    this.loadAssignments();
  }

  groupLabel(groupId: number, groupName: string): string {
    if ((this.duplicateGroupNameCounts().get(groupName) ?? 0) <= 1) return groupName;
    const full = this.groupStore.groups().find((g) => g.id === groupId);
    return full ? `${groupName} (kód: ${full.inviteCode})` : groupName;
  }

  private loadAssignments(): void {
    this.assignmentsLoading.set(true);
    this.assignmentsError.set(null);
    this.taskSetService.getTaskSetAssignments(this.taskSetId()).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (list) => {
        this.assignments.set(list);
        this.assignmentsLoading.set(false);
      },
      error: (err) => {
        this.assignmentsError.set(extractErrorMessage(err));
        this.assignmentsLoading.set(false);
      },
    });
  }

  // A kiadás és a visszavonás írás: nincs takeUntilDestroyed, az oldal elhagyása után is végigfut, és a toast megjelenik.
  assign(): void {
    if (this.assignForm.invalid || this.store.loading()) return;

    const raw = this.assignForm.getRawValue();
    this.taskSetService
      .assignToGroup(this.taskSetId(), {
        groupId: Number(raw.groupId),
        opensAt: raw.opensAt ? new Date(raw.opensAt).toISOString() : null,
        dueAt: raw.dueAt ? new Date(raw.dueAt).toISOString() : null,
        isTest: raw.isTest,
        timeLimitMinutes: raw.isTest ? Number(raw.timeLimitMinutes) : null,
      })
      .subscribe({
        next: (dto) => {
          this.assignments.update((list) => [dto, ...list]);
          this.assignForm.reset();
          this.toastService.success(dto.isTest ? 'Dolgozat kiadva.' : 'Feladatsor kiadva.');
        },
        error: (err) => this.toastService.danger(extractErrorMessage(err)),
      });
  }

  async revokeAssignment(assignmentId: number): Promise<void> {
    const confirmed = await this.confirmService.ask({
      title: 'Kiadás visszavonása',
      message: 'A diákok nem indíthatják többé. A már megkezdett vizsgamunkamenetek megmaradnak.',
      confirmLabel: 'Visszavonás',
      cancelLabel: 'Mégsem',
      danger: true,
    });
    if (!confirmed) return;

    this.taskSetService.revokeAssignment(assignmentId).subscribe({
      next: () => {
        this.assignments.update((list) =>
          list.map((a) => (a.id === assignmentId ? { ...a, revokedAt: new Date().toISOString() } : a)),
        );
        this.toastService.success('Kiadás visszavonva.');
      },
      error: (err) => this.toastService.danger(extractErrorMessage(err)),
    });
  }
}
